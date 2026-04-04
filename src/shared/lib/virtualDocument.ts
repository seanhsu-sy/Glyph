/** 未保存到磁盘的「未命名」文稿在内存中的路径占位（非真实文件） */
export function virtualUntitledPath(bookId: string): string {
  return `glyph:untitled:${bookId}`;
}

export function isVirtualUntitledPath(path: string | null | undefined): boolean {
  return path != null && path.startsWith("glyph:untitled:");
}
