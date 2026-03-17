import { useCallback } from "react";

import { useEditorStore } from "../../../app/store/editorStore";

export function useEditorActions() {
  const setContent = useEditorStore((s) => s.setContent);

  const updateContent = useCallback(
    (value: string) => {
      setContent(value);
    },
    [setContent],
  );

  return { updateContent };
}