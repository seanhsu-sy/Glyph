const GLOBAL_WELCOME_SEEN_KEY = "glyph_welcome_seen_global_v1";

/** 是否在任意书中看过一次自动注入的操作说明（新开其他书不再重复显示）。 */
export function hasGlobalWelcomeBeenShown(): boolean {
  try {
    return localStorage.getItem(GLOBAL_WELCOME_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGlobalWelcomeShown(): void {
  try {
    localStorage.setItem(GLOBAL_WELCOME_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * 进入写作页且自动打开内存 Untitled 时使用的操作说明（Markdown）。
 * 仅当 `hasGlobalWelcomeBeenShown()` 为 false 时注入；注入后调用 `markGlobalWelcomeShown()`。
 */
export const DEFAULT_WELCOME_MARKDOWN = `# 欢迎使用 Glyph

在这里直接写作即可。左侧是本书的章节库，可新建章节或大纲。

## 常用操作

- **保存 / ⌘S**：未命名文稿会**直接保存到本书文件夹**为 \`Untitled.md\`（若重名则 \`Untitled-2.md\` …），无需先另存为。
- **另存为**：需要把文件存到**书籍以外**的路径时使用顶栏「另存为」。
- **工具**：顶栏 **工具** 可打开预览、大纲、关联与搜索。
- **批注 / 便签**：选中文字后点 **批注**；**便签** 在右下角。侧栏 **关联** 可查看标签互文与你的批注列表。
- **跨书**：批注或便签可勾选「跨书」，在写作页侧栏 **关联** 底部打开「跨书关联页」统一查看。

祝写作愉快。
`;
