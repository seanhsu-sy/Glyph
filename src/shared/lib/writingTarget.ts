/** 与统计页 `writing_target_${scope}` 一致：先本书，再全局「全部」，最后默认 2000 */
export function resolveWritingTarget(bookId: string): number {
  const per = localStorage.getItem(`writing_target_${bookId}`);
  const parsedPer = per ? Number(per) : NaN;
  if (Number.isFinite(parsedPer) && parsedPer > 0) {
    return Math.round(parsedPer);
  }
  const all = localStorage.getItem("writing_target_all");
  const parsedAll = all ? Number(all) : NaN;
  if (Number.isFinite(parsedAll) && parsedAll > 0) {
    return Math.round(parsedAll);
  }
  return 2000;
}
