// 打包态 / 开发态运行期取值（b4，T4）：引擎 hostScript / 引擎子进程 cwd / 引擎附加环境变量 / 随包文档路径。
// 纯函数（不 import electron）：isPackaged / resourcesPath / execPath / appPath 由 Electron 侧（src/main/index.mjs）
//   取值注入 ⇒ 可脱 Electron 单测（同 src/settings/wiring.mjs:4「service.mjs 为纯 Node 面」法）。
// 两态口径（批次档 b4 §2「打包态 / 开发态两态对照」）：开发态 = 仓库直跑（引擎 cwd = 应用目录）；
//   打包态 = asar 内 hostScript + 安装目录 cwd（asar 档根不可作 cwd）+ 随包运行时环境变量。
import path from 'node:path';

/**
 * @param {{isPackaged: boolean, resourcesPath: string, execPath: string, appPath: string}} values
 *        Electron 侧取值 = app.isPackaged / process.resourcesPath / process.execPath / app.getAppPath()
 * @returns {{packaged: boolean, hostScript: string, engineCwd: string, engineEnv: object, guidePath: string}}
 *        hostScript = 引擎子进程入口 · engineCwd = 引擎子进程 cwd · engineEnv = 附加环境变量（并入 spawn env）
 *        guidePath = 「打开随包文档」落点（agent-onboarding.md）
 */
export function resolveRuntimePaths({ isPackaged, resourcesPath, execPath, appPath }) {
  const packaged = isPackaged === true;
  const guideDir = packaged ? path.join(resourcesPath, 'guide') : path.join(appPath, 'docs', 'guide');
  return {
    packaged,
    hostScript: path.join(appPath, 'src', 'engine', 'host.mjs'),
    engineCwd: packaged ? path.dirname(execPath) : appPath,
    engineEnv: packaged ? { PLAYWRIGHT_BROWSERS_PATH: path.join(resourcesPath, 'ms-playwright') } : {},
    guidePath: path.join(guideDir, 'agent-onboarding.md'),
  };
}
