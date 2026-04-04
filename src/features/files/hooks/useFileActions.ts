import { useCallback } from "react";

import { useEditorStore } from "../../../app/store/editorStore";
import { useTabStore } from "../../../app/store/tabStore";
import { saveUntitledInBook } from "../../../shared/lib/tauri";
import { isVirtualUntitledPath } from "../../../shared/lib/virtualDocument";
import { openMarkdownFile, saveFileAs, saveMarkdownFile } from "../services/fileService";

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "Untitled.md";
}

export function useFileActions() {
  const setFile = useEditorStore((s) => s.setFile);
  const setDirty = useEditorStore((s) => s.setDirty);
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);

  const filePath = useEditorStore((s) => s.filePath);
  const content = useEditorStore((s) => s.content);
  const bookFolderPath = useEditorStore((s) => s.bookFolderPath);

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

  const saveFileAsAction = useCallback(async (): Promise<void> => {
    setSaveStatus("saving");
    try {
      const newPath = await saveFileAs(content);

      if (!newPath) {
        setSaveStatus(filePath ? "unsaved" : "idle");
        return;
      }

      const nextName = fileNameFromPath(newPath);
      setFile({
        filePath: newPath,
        fileName: nextName,
        content,
      });
      setDirty(false);
      setSaveStatus("saved");

      const { activeTabId, updateTabContent } = useTabStore.getState();
      if (activeTabId) {
        updateTabContent(activeTabId, {
          content,
          isDirty: false,
          fileName: nextName,
          filePath: newPath,
        });
      }
    } catch (err) {
      console.error("save as failed", err);
      setSaveStatus("unsaved");
    }
  }, [content, filePath, setFile, setDirty, setSaveStatus]);

  const saveFile = useCallback(async (): Promise<void> => {
    if (!filePath) {
      await saveFileAsAction();
      return;
    }

    if (isVirtualUntitledPath(filePath)) {
      if (bookFolderPath) {
        try {
          setSaveStatus("saving");
          const newPath = await saveUntitledInBook(bookFolderPath, content);
          const nextName = fileNameFromPath(newPath);
          setFile({
            filePath: newPath,
            fileName: nextName,
            content,
          });
          setDirty(false);
          setSaveStatus("saved");
          const { activeTabId, updateTabContent } = useTabStore.getState();
          if (activeTabId) {
            updateTabContent(activeTabId, {
              content,
              isDirty: false,
              fileName: nextName,
              filePath: newPath,
            });
          }
        } catch (err) {
          console.error("save failed", err);
          setSaveStatus("unsaved");
        }
        return;
      }
      await saveFileAsAction();
      return;
    }

    setSaveStatus("saving");
    try {
      await saveMarkdownFile(filePath, content);
      setDirty(false);
      setSaveStatus("saved");
    } catch (err) {
      console.error("save failed", err);
      setSaveStatus("unsaved");
    }
  }, [
    filePath,
    content,
    bookFolderPath,
    setDirty,
    setSaveStatus,
    saveFileAsAction,
    setFile,
  ]);

  return {
    openFile,
    saveFile,
    saveFileAs: saveFileAsAction,
  };
}