export type ForeshadowDocKind = "chapter" | "outline";

export type ForeshadowRecord = {
  id: string;
  /** 伏笔标签名（用户自定义） */
  tag: string;
  /** 绝对路径，与编辑器 filePath 一致 */
  docPath: string;
  docName: string;
  docKind: ForeshadowDocKind;
  from: number;
  to: number;
  excerpt: string;
  createdAt: string;
  /** 无法在正文中可靠定位到 excerpt 时为 true */
  positionUncertain: boolean;
};

export type ForeshadowFileV1 = {
  version: 1;
  records: ForeshadowRecord[];
};

export type ForeshadowAnchor = {
  id: string;
  from: number;
  to: number;
};
