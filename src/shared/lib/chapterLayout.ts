export type VolumeItem = {
  id: string;
  title: string;
};

export type LayoutEntry =
  | { type: "volume"; id: string }
  | { type: "chapter"; path: string };

export type ChapterLayout = {
  volumes: VolumeItem[];
  rootOrder: LayoutEntry[];
  volumeChapters: Record<string, string[]>;
};

export function emptyChapterLayout(): ChapterLayout {
  return { volumes: [], rootOrder: [], volumeChapters: {} };
}

/** 后端不可用时的本地默认结构：章节平铺在根列表 */
export function fallbackChapterLayout(chapterPaths: string[]): ChapterLayout {
  return {
    volumes: [],
    rootOrder: chapterPaths.map((path) => ({ type: "chapter", path })),
    volumeChapters: {},
  };
}

export function newVolumeId(): string {
  return crypto.randomUUID();
}

export function defaultVolumeTitle(existingCount: number): string {
  return `第${existingCount + 1}卷`;
}

/** 在布局中把章节路径从旧路径换成新路径（重命名后调用） */
export function migrateChapterPathInLayout(
  layout: ChapterLayout,
  oldPath: string,
  newPath: string,
): ChapterLayout {
  const rootOrder = layout.rootOrder.map((e) =>
    e.type === "chapter" && e.path === oldPath ? { ...e, path: newPath } : e,
  );
  const volumeChapters: Record<string, string[]> = {};
  for (const [vid, paths] of Object.entries(layout.volumeChapters)) {
    volumeChapters[vid] = paths.map((p) => (p === oldPath ? newPath : p));
  }
  return { ...layout, rootOrder, volumeChapters };
}

export function removeChapterFromLayout(
  layout: ChapterLayout,
  path: string,
): ChapterLayout {
  const rootOrder = layout.rootOrder.filter(
    (e) => !(e.type === "chapter" && e.path === path),
  );
  const volumeChapters: Record<string, string[]> = {};
  for (const [vid, paths] of Object.entries(layout.volumeChapters)) {
    volumeChapters[vid] = paths.filter((p) => p !== path);
  }
  return { ...layout, rootOrder, volumeChapters };
}

function cloneLayout(layout: ChapterLayout): ChapterLayout {
  return {
    volumes: layout.volumes.map((v) => ({ ...v })),
    rootOrder: layout.rootOrder.map((e) => ({ ...e })),
    volumeChapters: Object.fromEntries(
      Object.entries(layout.volumeChapters).map(([k, v]) => [k, [...v]]),
    ),
  };
}

/** 从布局任意位置移除章节路径 */
export function detachChapterPath(layout: ChapterLayout, path: string): ChapterLayout {
  return removeChapterFromLayout(layout, path);
}

export function addVolume(
  layout: ChapterLayout,
  title: string,
  id = newVolumeId(),
): ChapterLayout {
  return addVolumeAt(layout, title, layout.rootOrder.length, id);
}

/** 在根列表指定位置插入空卷 */
export function addVolumeAt(
  layout: ChapterLayout,
  title: string,
  rootIndex: number,
  id = newVolumeId(),
): ChapterLayout {
  const next = cloneLayout(layout);
  next.volumes.push({ id, title });
  next.volumeChapters[id] = [];
  const idx = Math.max(0, Math.min(rootIndex, next.rootOrder.length));
  next.rootOrder.splice(idx, 0, { type: "volume", id });
  return next;
}

/** 在指定章节上方插入新卷（根列表章节：紧挨其前；卷内章节：新卷插在原卷之前并移入该章） */
export function addVolumeAboveChapter(
  layout: ChapterLayout,
  chapterPath: string,
  title: string,
): ChapterLayout {
  const rootIdx = layout.rootOrder.findIndex(
    (e) => e.type === "chapter" && e.path === chapterPath,
  );
  if (rootIdx !== -1) {
    return addVolumeAt(layout, title, rootIdx);
  }

  for (const [volumeId, paths] of Object.entries(layout.volumeChapters)) {
    const volIdx = paths.indexOf(chapterPath);
    if (volIdx === -1) continue;

    const volumeRootIdx = layout.rootOrder.findIndex(
      (e) => e.type === "volume" && e.id === volumeId,
    );
    if (volumeRootIdx === -1) continue;

    const id = newVolumeId();
    const next = cloneLayout(layout);
    next.volumes.push({ id, title });
    next.volumeChapters[volumeId] = paths.filter((p) => p !== chapterPath);
    next.volumeChapters[id] = [chapterPath];
    next.rootOrder.splice(volumeRootIdx, 0, { type: "volume", id });
    return next;
  }

  return addVolume(layout, title);
}

export function renameVolume(
  layout: ChapterLayout,
  volumeId: string,
  title: string,
): ChapterLayout {
  const next = cloneLayout(layout);
  const vol = next.volumes.find((v) => v.id === volumeId);
  if (vol) vol.title = title;
  return next;
}

export function deleteVolume(layout: ChapterLayout, volumeId: string): ChapterLayout {
  const next = cloneLayout(layout);
  const orphaned = next.volumeChapters[volumeId] ?? [];
  delete next.volumeChapters[volumeId];
  next.volumes = next.volumes.filter((v) => v.id !== volumeId);
  next.rootOrder = next.rootOrder.filter(
    (e) => !(e.type === "volume" && e.id === volumeId),
  );
  for (const path of orphaned) {
    next.rootOrder.push({ type: "chapter", path });
  }
  return next;
}

export type DropTarget =
  | { zone: "root"; index: number }
  | { zone: "volume"; volumeId: string; index: number };

type ChapterLocation =
  | { zone: "root"; index: number }
  | { zone: "volume"; volumeId: string; index: number };

function findChapterLocation(
  layout: ChapterLayout,
  chapterPath: string,
): ChapterLocation | null {
  const rootIndex = layout.rootOrder.findIndex(
    (e) => e.type === "chapter" && e.path === chapterPath,
  );
  if (rootIndex !== -1) {
    return { zone: "root", index: rootIndex };
  }

  for (const [volumeId, paths] of Object.entries(layout.volumeChapters)) {
    const index = paths.indexOf(chapterPath);
    if (index !== -1) {
      return { zone: "volume", volumeId, index };
    }
  }

  return null;
}

/** 将章节放到目标位置（会先自布局中移除该章节） */
export function moveChapterTo(
  layout: ChapterLayout,
  chapterPath: string,
  target: DropTarget,
): ChapterLayout {
  const from = findChapterLocation(layout, chapterPath);
  let next = detachChapterPath(layout, chapterPath);

  if (target.zone === "root") {
    const entry: LayoutEntry = { type: "chapter", path: chapterPath };
    let idx = target.index;
    if (from?.zone === "root" && from.index < idx) {
      idx -= 1;
    }
    idx = Math.max(0, Math.min(idx, next.rootOrder.length));
    next.rootOrder.splice(idx, 0, entry);
    return next;
  }

  const list = next.volumeChapters[target.volumeId] ?? [];
  let idx = target.index;
  if (
    from?.zone === "volume" &&
    from.volumeId === target.volumeId &&
    from.index < idx
  ) {
    idx -= 1;
  }
  idx = Math.max(0, Math.min(idx, list.length));
  list.splice(idx, 0, chapterPath);
  next.volumeChapters[target.volumeId] = list;
  return next;
}

/**
 * 卷在 UI 上应展示的章节路径：优先 `volumeChapters`；
 * 若为空，则包含根列表中紧挨该卷之后、直到下一卷之前的章节
 * （常见于「添加卷」后章节仍在根列表的情况）。
 */
export function getVolumeDisplayPaths(
  layout: ChapterLayout,
  volumeId: string,
  volumeRootIndex: number,
): string[] {
  const explicit = layout.volumeChapters[volumeId] ?? [];
  if (explicit.length > 0) return explicit;

  const implicit: string[] = [];
  for (let i = volumeRootIndex + 1; i < layout.rootOrder.length; i++) {
    const entry = layout.rootOrder[i];
    if (entry.type === "volume") break;
    if (entry.type === "chapter") implicit.push(entry.path);
  }
  return implicit;
}

export function moveVolumeInRoot(
  layout: ChapterLayout,
  volumeId: string,
  toIndex: number,
): ChapterLayout {
  const next = cloneLayout(layout);
  const fromIndex = next.rootOrder.findIndex(
    (e) => e.type === "volume" && e.id === volumeId,
  );
  if (fromIndex === -1) return layout;
  const [entry] = next.rootOrder.splice(fromIndex, 1);
  let idx = toIndex;
  if (fromIndex < idx) {
    idx -= 1;
  }
  idx = Math.max(0, Math.min(idx, next.rootOrder.length));
  next.rootOrder.splice(idx, 0, entry);
  return next;
}
