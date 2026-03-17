import { useCallback, useEffect, useRef } from "react";

import { useEditorStore } from "../../../app/store/editorStore";
import { openMarkdownFile, saveMarkdownFile, saveMarkdownFileAs } from "../services/fileService";

export function useFileActions() {
  const setFile = useEditorStore((s) => s.setFile);
  const setDirty = useEditorStore((s) => s.setDirty);
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);
  const filePath = useEditorStore((s) => s.filePath);
  const content = useEditorStore((s) => s.content);
  const timeoutRef = useRef<number | null>(null);

  const openFile = useCallback(async (): Promise<void> => {
    const opened = await openMarkdownFile();

    if (!opened) {
      return;
    }

    setFile({
      filePath: opened.path,
      fileName: opened.name,
      content: opened.content,
    });
    setDirty(false);
    setSaveStatus("saved");
  }, [setFile, setDirty, setSaveStatus]);

  const saveFile = useCallback(async (): Promise<void> => {
    if (!filePath) {
      return;
    }

    setSaveStatus("saving");
    await saveMarkdownFile(filePath, content);
    setDirty(false);
    setSaveStatus("saved");
  }, [filePath, content, setDirty, setSaveStatus]);

  const saveFileAs = useCallback(async (): Promise<void> => {
    setSaveStatus("saving");
    const saved = await saveMarkdownFileAs(content);

    if (!saved) {
      setSaveStatus("unsaved");
      return;
    }

    setFile({
      filePath: saved.path,
      fileName: saved.name,
      content: saved.content,
    });
    setDirty(false);
    setSaveStatus("saved");
  }, [content, setFile, setDirty, setSaveStatus]);

  useEffect(() => {
    if (!filePath) {
      return;
    }

    setSaveStatus("unsaved");

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(async () => {
      setSaveStatus("saving");
      await saveMarkdownFile(filePath, content);
      setDirty(false);
      setSaveStatus("saved");
    }, 500);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [filePath, content, setDirty, setSaveStatus]);

  return {
    openFile,
    saveFile,
    saveFileAs,
  };
}

