import React from "react";
import { marked } from "marked";

type MarkdownPreviewProps = {
  content: string;
};

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const html = marked.parse(content);

  return (
    <div
      className="markdown-preview"
      dangerouslySetInnerHTML={{
        __html: html,
      }}
    />
  );
}

