/**
 * 统一字数统计（编辑区、章节列表、书籍总字数、写作统计一致）：
 * - 每个汉字计 1
 * - 每个阿拉伯数字计 1（连续数字不合并为一个词）
 * - 英文按单词计（连续字母为一个词）
 */
export function countWords(text: string): number {
  if (!text.trim()) return 0;

  let count = 0;
  let inLatinWord = false;

  for (const c of text) {
    if (isCjk(c)) {
      count += 1;
      inLatinWord = false;
    } else if (c >= "0" && c <= "9") {
      count += 1;
      inLatinWord = false;
    } else if (
      (c >= "a" && c <= "z") ||
      (c >= "A" && c <= "Z")
    ) {
      if (!inLatinWord) {
        count += 1;
        inLatinWord = true;
      }
    } else {
      inLatinWord = false;
    }
  }

  return count;
}

function isCjk(c: string): boolean {
  if (!c) return false;
  const code = c.codePointAt(0)!;
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf)
  );
}
