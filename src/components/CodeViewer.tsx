import { Suspense, lazy, useState, useMemo, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { FileContent, RepoInfo } from "../types";
import { ScreenshotOverlay } from "./ScreenshotOverlay";
import { saveScreenshot } from "../api";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

interface CodeViewerProps {
  content: FileContent | null;
  filePath: string;
  isLoading: boolean;
  repoInfo: RepoInfo | null;
  copyScreenshotToClipboard?: boolean;
  onScreenshotSaved?: (copiedToClipboard: boolean) => void;
}

function LoadingSpinner() {
  return (
    <div className="code-loading">
      <div className="spinner"></div>
      <span>Loading editor...</span>
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  const html = useMemo(() => {
    // Simple markdown to HTML conversion
    let result = content
      // Escape HTML
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Code blocks (fenced)
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // Headers
      .replace(/^######\s+(.*)$/gm, "<h6>$1</h6>")
      .replace(/^#####\s+(.*)$/gm, "<h5>$1</h5>")
      .replace(/^####\s+(.*)$/gm, "<h4>$1</h4>")
      .replace(/^###\s+(.*)$/gm, "<h3>$1</h3>")
      .replace(/^##\s+(.*)$/gm, "<h2>$1</h2>")
      .replace(/^#\s+(.*)$/gm, "<h1>$1</h1>")
      // Bold and italic
      .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Images (must be before links to avoid conflicts)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" loading="lazy" />')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      // Horizontal rule
      .replace(/^---$/gm, "<hr />")
      // Unordered lists
      .replace(/^[\*\-]\s+(.*)$/gm, "<li>$1</li>")
      // Blockquotes
      .replace(/^>\s+(.*)$/gm, "<blockquote>$1</blockquote>")
      // Line breaks (paragraphs)
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br />");

    // Wrap lists
    result = result.replace(/(<li>.*<\/li>)(?=<li>|$)/gs, "<ul>$1</ul>");
    // Remove duplicate ul tags
    result = result.replace(/<\/ul><ul>/g, "");

    return `<p>${result}</p>`;
  }, [content]);

  return (
    <div
      className="markdown-preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function BinaryFileView({
  filePath,
  repoInfo,
}: {
  filePath: string;
  repoInfo: RepoInfo;
}) {
  const githubUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/blob/${repoInfo.branch}/${filePath}`;
  const rawUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch}/${filePath}`;

  const handleOpenInBrowser = async () => {
    await openUrl(githubUrl);
  };

  const handleDownload = async () => {
    await openUrl(rawUrl);
  };

  // Get file extension for display
  const ext = filePath.split(".").pop()?.toUpperCase() || "FILE";

  return (
    <div className="binary-file-view">
      <div className="binary-icon">
        {ext === "PNG" || ext === "JPG" || ext === "JPEG" || ext === "GIF" || ext === "WEBP" || ext === "SVG"
          ? "🖼️"
          : ext === "PDF"
          ? "📄"
          : ext === "ZIP" || ext === "TAR" || ext === "GZ" || ext === "RAR"
          ? "📦"
          : ext === "MP3" || ext === "WAV" || ext === "OGG"
          ? "🎵"
          : ext === "MP4" || ext === "AVI" || ext === "MOV"
          ? "🎬"
          : "📁"}
      </div>
      <h3>Binary File</h3>
      <p className="binary-info">This file cannot be displayed as text.</p>
      <div className="binary-link">
        <a href={githubUrl} target="_blank" rel="noopener noreferrer">
          {githubUrl}
        </a>
      </div>
      <div className="binary-actions">
        <button className="binary-button" onClick={handleOpenInBrowser}>
          Open in GitHub
        </button>
        <button className="binary-button secondary" onClick={handleDownload}>
          Download
        </button>
      </div>
    </div>
  );
}

export function CodeViewer({
  content,
  filePath,
  isLoading,
  repoInfo,
  copyScreenshotToClipboard = true,
  onScreenshotSaved,
}: CodeViewerProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const codeContentRef = useRef<HTMLDivElement>(null);

  const handleScreenshotCapture = async (dataUrl: string) => {
    setIsCapturing(false);
    setIsSaving(true);

    try {
      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, "-")
        .replace(/\.\d{3}Z$/, "");
      const filename = `screenshot_${timestamp}.png`;
      await saveScreenshot(dataUrl, filename, copyScreenshotToClipboard);
      onScreenshotSaved?.(copyScreenshotToClipboard);
    } catch (error) {
      console.error("Failed to save screenshot:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleScreenshotCancel = () => {
    setIsCapturing(false);
  };

  const isMarkdown =
    filePath.endsWith(".md") || filePath.endsWith(".markdown");

  if (isLoading) {
    return (
      <div className="code-viewer loading">
        <div className="code-loading">
          <div className="spinner"></div>
          <span>Loading file...</span>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="code-viewer empty">
        <div className="empty-state">
          <span className="empty-icon">📖</span>
          <h3>Select a file to view</h3>
          <p>Choose a file from the tree on the left</p>
        </div>
      </div>
    );
  }

  // Handle binary files
  if (content.is_binary) {
    if (!repoInfo) {
      return (
        <div className="code-viewer empty">
          <div className="empty-state">
            <span className="empty-icon">📁</span>
            <h3>Binary File</h3>
            <p>This file cannot be displayed as text.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="code-viewer">
        <div className="code-header">
          <span className="file-path">{filePath}</span>
          <span className="language-badge">binary</span>
        </div>
        <div className="code-content binary-content">
          <BinaryFileView filePath={filePath} repoInfo={repoInfo} />
        </div>
      </div>
    );
  }

  return (
    <div className="code-viewer">
      <div className="code-header">
        <span className="file-path">{filePath}</span>
        {content.truncated && (
          <span className="truncated-badge">
            Truncated{" "}
            {content.total_lines
              ? `(${content.total_lines.toLocaleString()} lines total)`
              : ""}
          </span>
        )}
        {isMarkdown && (
          <button
            className={`preview-toggle ${showPreview ? "active" : ""}`}
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? "Code" : "Preview"}
          </button>
        )}
        <button
          className="screenshot-button"
          onClick={() => setIsCapturing(true)}
          disabled={isSaving}
          title="Take screenshot"
        >
          {isSaving ? "..." : "\uD83D\uDCF7"}
        </button>
        <span className="language-badge">{content.language}</span>
      </div>
      <div className="code-content" ref={codeContentRef}>
        {isMarkdown && showPreview ? (
          <MarkdownPreview content={content.content} />
        ) : (
          <Suspense fallback={<LoadingSpinner />}>
            <MonacoEditor
              height="100%"
              language={content.language}
              value={content.content}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: true },
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "off",
                folding: true,
                fontSize: 14,
                fontFamily:
                  "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
                renderLineHighlight: "line",
                selectOnLineNumbers: true,
                automaticLayout: true,
                scrollbar: {
                  vertical: "auto",
                  horizontal: "auto",
                },
                find: {
                  addExtraSpaceOnTop: false,
                  autoFindInSelection: "never",
                  seedSearchStringFromSelection: "always",
                },
              }}
            />
          </Suspense>
        )}
      </div>
      {isCapturing && (
        <ScreenshotOverlay
          targetRef={codeContentRef}
          onCapture={handleScreenshotCapture}
          onCancel={handleScreenshotCancel}
        />
      )}
    </div>
  );
}
