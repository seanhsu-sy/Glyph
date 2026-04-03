import { useCallback } from "react";

import { useEditorStore } from "../../../app/store/editorStore";

export type TagItem = {
  tag: string;
  index: number;
};

function extractTags(text: string): TagItem[] {
  const regex = /#[^\s]+/g;

  const result: TagItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    result.push({
      tag: match[0].slice(1),
      index: match.index,
    });
  }

  return result;
}

export function useEditorActions() {
  const setContent = useEditorStore((s) => s.setContent);
  const setTags = useEditorStore((s) => s.setTags);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const updateContent = useCallback(
    (value: string) => {
      setContent(value);
      setTags(extractTags(value));
    },
    [setContent, setTags],
  );

  return {
    updateContent,
    undo,
    redo,
  };
}