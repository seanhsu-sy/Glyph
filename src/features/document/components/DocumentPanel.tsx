import type { DocumentItem } from "../../../shared/lib/tauri";

type Props = {
  docs: DocumentItem[];
  onOpen: (doc: DocumentItem) => void;
};

export function DocumentPanel({ docs, onOpen }: Props) {
  return (
    <div
      style={{
        width: 240,
        borderRight: "1px solid #eee",
        padding: 12,
      }}
    >
      {docs.map((doc) => (
        <div
          key={doc.path}
          onClick={() => onOpen(doc)}
          style={{
            padding: "6px 8px",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {doc.name}
        </div>
      ))}
    </div>
  );
}