/**
 * 固定执行 `vite build`，忽略 npm 误传的参数（例如有人运行 `npm run build dev`）。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** 不用 require.resolve：Vite 的 package exports 不导出 bin 路径 */
const viteCli = join(root, "node_modules", "vite", "bin", "vite.js");
if (!existsSync(viteCli)) {
  console.error("找不到本地 Vite，请先在该目录执行 npm install。");
  process.exit(1);
}

const result = spawnSync(process.execPath, [viteCli, "build"], {
  stdio: "inherit",
  cwd: root,
});

process.exit(result.status === null ? 1 : result.status);
