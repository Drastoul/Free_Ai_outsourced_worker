/**
 * 浏览器引擎（`docs/design/modules/browser-engine.md`）：
 * 持久化配置目录（登录态）、启动参数、CDP 下载自动落盘、下载暂存区、downloads-hub 页面处置、崩溃后重取上下文。
 *
 * 本模块不解析任何平台内容（平台细节见 `src/engine/adapters/`）；落盘命名与交付见 `src/engine/artifacts.mjs`。
 * 配置与路径解析在 `src/engine/browser-config.mjs`（可在测试里单独导入）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

import { defaultUserDataDir, readConfigBrowser, resolveBrowserOptions, safeSegment } from './browser-config.mjs';
import { collectDownloadFallback, downloadsSince, settleTaskDownloads, stagedFiles } from './staging.mjs';
import { sleep } from './util.mjs';

/** 点平台下载按钮会另开的页面（不计入会话页面；任务收尾做不阻塞的关闭尝试） */
export const DOWNLOADS_HUB_PREFIX = 'edge://downloads-hub';

export { defaultUserDataDir, readConfigBrowser, resolveBrowserOptions };

function isHubPage(page) {
  try {
    return String(page.url()).startsWith(DOWNLOADS_HUB_PREFIX);
  } catch {
    return false;
  }
}

/**
 * 每个外包工一个浏览器会话（持久化上下文 + 下载暂存区 + 下载事件台账）。
 * 同一 workerId 同时只有一个上下文（单写者；任务串行由 `src/engine/task-runner.mjs` 的每外包工锁承担）。
 */
export class BrowserHost {
  constructor({ userDataDir, log = () => {}, browserOptions, keepAliveTab = true, env = process.env } = {}) {
    this.userDataDir = path.resolve(userDataDir ?? defaultUserDataDir(env));
    this.log = log;
    this.browserOptions = browserOptions ?? resolveBrowserOptions({ env, configBrowser: readConfigBrowser(this.userDataDir, this.log, env) });
    this.keepAliveTab = keepAliveTab;
    this.sessions = new Map();
  }

  /** 配置目录与下载暂存区（`browser-engine.md` §2 / §4） */
  paths(workerId) {
    const safe = safeSegment(workerId);
    const profileOverride = process.env.FREE_OUTSOURCE_PROFILE_DIR;
    return {
      profileDir: profileOverride ? path.resolve(profileOverride) : path.join(this.userDataDir, 'profiles', safe),
      stagingDir: path.join(this.userDataDir, 'downloads-staging', safe),
    };
  }

  launchOptions() {
    const { mode, channel } = this.browserOptions;
    return {
      mode,
      channel,
      launch: {
        channel,
        headless: false,
        viewport: null,
        acceptDownloads: true,
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
      },
    };
  }

  #alive(session) {
    try {
      const browser = session.ctx.browser();
      return !!browser && (typeof browser.isConnected !== 'function' || browser.isConnected());
    } catch {
      return false;
    }
  }

  /** 取（必要时启动 / 重启）该外包工的浏览器会话 */
  async ensureSession(workerId) {
    const existing = this.sessions.get(workerId);
    if (existing && this.#alive(existing)) return existing;
    if (existing) {
      this.log(`浏览器上下文不可用，重新启动（worker=${workerId}；配置目录复用，登录态保留）`);
      this.sessions.delete(workerId);
      try {
        await existing.ctx.close();
      } catch {
        /* 已关闭 */
      }
    }
    const { profileDir, stagingDir } = this.paths(workerId);
    fs.mkdirSync(stagingDir, { recursive: true });
    const opts = this.launchOptions();
    this.log(`启动浏览器 worker=${workerId} mode=${opts.mode} channel=${opts.channel ?? '随包 chromium'} profile=${profileDir}`);
    const ctx = await chromium.launchPersistentContext(profileDir, opts.launch);
    const session = { workerId, ctx, profileDir, stagingDir, downloads: [], page: null, keeperPage: null, launchedAt: Date.now() };
    this.sessions.set(workerId, session);
    ctx.on('close', () => this.log(`浏览器上下文已关闭（worker=${workerId}）`));
    for (const page of ctx.pages()) this.#hookPage(session, page);
    ctx.on('page', (page) => this.#hookPage(session, page));
    await this.#applyDownloadBehavior(session);
    await this.#ensureKeepAliveTab(session);
    return session;
  }

  /**
   * 保活页（实测必要）：平台上点代码块「下载」时 Edge 会关掉来源标签页（`probe/out5/run.log` 同观）；
   * 若它是最后一个标签，浏览器进程随之退出、下载被中断（只剩 `.crdownload`）。留一个空白页即可保住
   * 浏览器进程，让下载正常收口；它不参与「会话页」判定。
   */
  async #ensureKeepAliveTab(session) {
    if (!this.keepAliveTab) return;
    try {
      if (session.keeperPage && !session.keeperPage.isClosed()) return;
      session.keeperPage = await session.ctx.newPage();
      await session.keeperPage.goto('about:blank').catch(() => {});
      this.log('已留保活空白页（防来源标签页被关导致浏览器退出）');
    } catch (e) {
      this.log(`保活页创建失败（忽略）：${String(e?.message ?? e).slice(0, 120)}`);
    }
  }

  #hookPage(session, page) {
    page.on('download', (d) => {
      const rec = { name: d.suggestedFilename(), at: Date.now(), workerId: session.workerId, path: null };
      session.downloads.push(rec);
      this.log(`下载事件 name=${rec.name}（CDP 自动落盘 → ${session.stagingDir}）`);
      void collectDownloadFallback(session, rec, d, (m) => this.log(m));
    });
    page.on('close', () => {
      let url = '';
      try {
        url = page.url();
      } catch {
        /* 忽略 */
      }
      this.log(`页面关闭：${url || '(未知)'}${isHubPage(page) ? '（downloads-hub）' : ''}`);
    });
  }

  /**
   * CDP 自动落盘：`Browser.setDownloadBehavior{allow, downloadPath, eventsEnabled}`（不用 saveAs）。
   * 注意：该行为绑定在发出命令的 CDP 会话上——**不可 detach**（detach 即失效，实测见交付记录）。
   */
  async #applyDownloadBehavior(session) {
    try {
      const page = session.ctx.pages()[0] ?? (await session.ctx.newPage());
      const cdp = await session.ctx.newCDPSession(page);
      await cdp.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: session.stagingDir,
        eventsEnabled: true,
      });
      session.cdp = cdp;
      this.log(`CDP 自动落盘就绪 → ${session.stagingDir}`);
    } catch (e) {
      this.log(`CDP Browser.setDownloadBehavior 失败（下载捕获不可用，取件降为代码块 + 全文）：${String(e?.message ?? e).slice(0, 160)}`);
    }
  }

  /** 会话页面（downloads-hub / 保活空白页不计入；记在会话上，避免误选内部页 / 空白页） */
  async sessionPage(workerId) {
    const session = await this.ensureSession(workerId);
    await this.#ensureKeepAliveTab(session);
    if (session.page && !session.page.isClosed() && !isHubPage(session.page)) return session.page;
    const candidates = session.ctx.pages().filter((p) => !isHubPage(p) && p !== session.page && p !== session.keeperPage);
    session.page = candidates[0] ?? (await session.ctx.newPage());
    return session.page;
  }

  /** 该外包工的 downloads-hub 页面 */
  hubPages(workerId) {
    const session = this.sessions.get(workerId);
    if (!session) return [];
    return session.ctx.pages().filter((p) => isHubPage(p));
  }

  /**
   * downloads-hub 页面处置（`browser-engine.md` §4）：不计入会话页面；任务收尾时尝试关闭。
   * 实测：Edge 的 `edge://downloads-hub/` 不受 `page.close()` 关闭（调用会一直挂起，含 CDP closeTarget）——
   * 故这里只做**不阻塞的后台尝试**（超时即放弃，取不到则忽略），绝不拖住任务收尾。
   */
  closeHubPages(workerId, { timeoutMs = 2000 } = {}) {
    const pages = this.hubPages(workerId);
    for (const page of pages) {
      void Promise.race([page.close({ runBeforeUnload: false }).catch(() => {}), sleep(timeoutMs)]);
    }
    if (pages.length) {
      this.log(`downloads-hub 页面 ${pages.length} 个：已发起后台关闭尝试（不阻塞；Edge 内部页可能拒绝关闭）`);
    }
    return pages.length;
  }

  /** 本任务的下载事件（`since` 之后；空闲期下载留在暂存区、不误入任务） */
  downloadsSince(workerId, since) {
    const session = this.sessions.get(workerId);
    return session ? downloadsSince(session, since) : [];
  }

  /** 暂存区现有文件（供记账 / 日志；空闲期下载不参与本任务归属） */
  stagedFiles(workerId) {
    const session = this.sessions.get(workerId);
    return session ? stagedFiles(session) : [];
  }

  /** 等本任务触发的下载落盘（落不下来的记日志、不中断——下载只是取件三层之一） */
  async settleDownloads(workerId, { since, timeoutMs = 30000 } = {}) {
    const session = this.sessions.get(workerId);
    if (!session) return [];
    return await settleTaskDownloads(session, {
      since,
      timeoutMs,
      isAlive: () => this.#alive(session),
      log: (m) => this.log(m),
    });
  }

  /** 会话状态（供 engine.health） */
  status() {
    return [...this.sessions.values()].map((s) => ({
      workerId: s.workerId,
      connected: this.#alive(s),
      pages: (() => {
        try {
          return s.ctx.pages().length;
        } catch {
          return 0;
        }
      })(),
      profileDir: s.profileDir,
      downloads: s.downloads.length,
    }));
  }

  async close(workerId) {
    const session = this.sessions.get(workerId);
    if (!session) return false;
    this.sessions.delete(workerId);
    try {
      await session.ctx.close();
    } catch {
      /* 已关闭 */
    }
    return true;
  }

  async closeAll() {
    const ids = [...this.sessions.keys()];
    for (const id of ids) await this.close(id);
    return ids.length;
  }
}
