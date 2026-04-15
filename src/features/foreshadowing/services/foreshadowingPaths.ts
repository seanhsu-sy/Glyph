export function foreshadowingJsonPath(bookFolderPath: string): string {
  const base = bookFolderPath.replace(/[/\\]+$/, "");
  return `${base}/.glyph/foreshadowing.json`;
}
