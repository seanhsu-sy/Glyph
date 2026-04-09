/** 未保存到磁盘的「未命名」文稿在内存中的路径占位（非真实文件） */
export function virtualUntitledPath(bookId: string): string {
  return `glyph:untitled:${bookId}`;
}

export function isVirtualUntitledPath(path: string | null | undefined): boolean {
  return path != null && path.startsWith("glyph:untitled:");
}

/** localStorage：仅在书库「新建书籍」成功时写入；写作区消费后删除，用于区分旧书不自动 Untitled */
export function getPendingInitialUntitledKey(bookId: string): string {
  return `glyph_book_pending_initial_untitled_${bookId}`;
}
