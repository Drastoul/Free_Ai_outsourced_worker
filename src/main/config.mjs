// 配置存储（设计权威：docs/design/overview.md「配置存储」）
// 位置：<userData>/config.json（%APPDATA%\free-outsource\config.json）；单一写者 = 主进程。
// 原子写：同目录临时文件 + rename 替换；保留上一版 .bak。schema 与校验 = config-schema.mjs。

import fsp from 'node:fs/promises';
import path from 'node:path';
import { writeJsonAtomic } from '../shared/outbox.mjs';
import { DEFAULT_CONFIG, normalizeConfig } from './config-schema.mjs';

export { CONFIG_VERSION, DEFAULT_CONFIG, normalizeConfig } from './config-schema.mjs';

export class ConfigStore {
  constructor({ file, config, firstRun = false }) {
    this.file = file;
    this._config = config;
    /** 首建标记（T5 首启引导）：本次启动是否首次创建 config.json（loadConfig 判定；reload 不改变） */
    this.firstRun = firstRun === true;
  }

  get current() {
    return this._config;
  }

  /** 把上一版保留为 `.bak`，然后原子替换（设计：临时文件 + rename + .bak） */
  async writeFile() {
    try {
      await fsp.copyFile(this.file, `${this.file}.bak`);
    } catch (e) {
      if (e?.code !== 'ENOENT') throw e; // 首次写入无上一版
    }
    await writeJsonAtomic(this.file, this._config);
  }

  /** 用新的整份配置替换（先校验归一化；非法项回退默认并返回 issues 供调用方记日志）。
   *  写盘失败 ⇒ 回滚内存配置（b2·T8：内存与磁盘不漂移，界面据错误回滚显示；异常照旧抛给调用方） */
  async save(next) {
    const { config, issues } = normalizeConfig(next);
    const previous = this._config;
    this._config = config;
    try {
      await this.writeFile();
    } catch (e) {
      this._config = previous;
      throw e;
    }
    return issues;
  }

  /** 就地修改（mutator 收到深拷贝；返回 issues） */
  async update(mutator) {
    const next = structuredClone(this._config);
    const ret = mutator(next);
    if (ret && typeof ret.then === 'function') await ret;
    return this.save(next);
  }

  /** 重新读盘（文件手改后调用；下次启动生效的口径由调用方说明） */
  async reload() {
    const raw = await this.readFileRaw();
    const { config, issues } = normalizeConfig(raw);
    this._config = config;
    return issues;
  }

  async readFileRaw() {
    try {
      return JSON.parse(await fsp.readFile(this.file, 'utf8'));
    } catch (e) {
      if (e?.code === 'ENOENT') return null;
      throw e;
    }
  }
}

/**
 * 载入配置：文件不存在 ⇒ 写入默认配置；存在 ⇒ 校验（非法项回退默认 + 记日志，不改写用户文件）。
 * @returns {Promise<ConfigStore>}
 */
export async function loadConfig({ userDataDir, log }) {
  const file = path.join(userDataDir, 'config.json');
  let raw = null;
  let missing = false;
  try {
    raw = JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (e) {
    if (e?.code === 'ENOENT') {
      missing = true;
      raw = structuredClone(DEFAULT_CONFIG);
      log?.info(`配置文件不存在，写入默认配置：${file}`);
    } else {
      log?.warn(`配置文件读取/解析失败（${e?.message || e}），本次按默认值运行：${file}`);
      raw = structuredClone(DEFAULT_CONFIG);
    }
  }
  const { config, issues } = normalizeConfig(raw);
  for (const issue of issues) log?.warn(`配置校验：${issue}`);
  const store = new ConfigStore({ file, config, firstRun: missing });
  if (missing) {
    try {
      await store.writeFile();
    } catch (e) {
      log?.warn(`写入默认配置失败：${e?.message || e}`);
    }
  }
  return store;
}
