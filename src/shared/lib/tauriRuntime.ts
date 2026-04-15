/**
 * 是否与 Tauri 核心 IPC 连通（与 `@tauri-apps/api/core` 的 `invoke` 一致）。
 * 勿使用 `isTauri()` 仅判断 `globalThis.isTauri`：Tauri 2 WebView 里该标志可能未注入，会导致桌面端被误判为浏览器。
 */
export function hasTauriCore(): boolean {
  if (typeof window === "undefined") return false;
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__?: { invoke?: unknown };
    }
  ).__TAURI_INTERNALS__;
  return typeof internals?.invoke === "function";
}
