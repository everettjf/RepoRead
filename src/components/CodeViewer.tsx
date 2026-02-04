import { Suspense, lazy, useState, useMemo, useRef, useImperativeHandle, forwardRef, useEffect } from "react";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { FileContent, RepoInfo } from "../types";
import { ScreenshotOverlay } from "./ScreenshotOverlay";
import { getRepoPath, readBinaryFileDataUrl, saveScreenshot } from "../api";
import type { editor } from "monaco-editor";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

interface CodeViewerProps {
  content: FileContent | null;
  filePath: string;
  isLoading: boolean;
  repoInfo: RepoInfo | null;
  onRevealInTree?: () => void;
  revealLine?: number;
  onRevealComplete?: () => void;
  copyScreenshotToClipboard?: boolean;
  isCapturing?: boolean;
  onScreenshotSaved?: (copiedToClipboard: boolean) => void;
  onCaptureComplete?: () => void;
  onToast?: (message: string) => void;
}

export interface CodeViewerHandle {
  getSelectedText: () => string;
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
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"].includes(ext);
  const [imageSrc, setImageSrc] = useState<string>("");
  const [imageLoadError, setImageLoadError] = useState(false);

  useEffect(() => {
    if (!isImage) return;

    let cancelled = false;

    const resolveLocalImagePath = async () => {
      try {
        const localDataUrl = await readBinaryFileDataUrl(repoInfo.key, filePath);

        if (!cancelled) {
          setImageSrc(localDataUrl);
          setImageLoadError(false);
        }
      } catch {
        if (!cancelled) {
          setImageSrc("");
          setImageLoadError(true);
        }
      }
    };

    resolveLocalImagePath();

    return () => {
      cancelled = true;
    };
  }, [filePath, isImage, repoInfo.key]);

  const extLabel = ext.toUpperCase() || "FILE";

  return (
    <div className="binary-file-view">
      {isImage && (
        <div className="binary-image-preview">
          {!imageLoadError && imageSrc ? (
            <img
              src={imageSrc}
              alt={filePath}
              onError={() => setImageLoadError(true)}
            />
          ) : !imageLoadError ? (
            <div className="binary-image-fallback">Loading local image preview...</div>
          ) : (
            <div className="binary-image-fallback">
              Unable to load local image preview for this file.
            </div>
          )}
        </div>
      )}
      {!isImage && (
        <>
          <div className="binary-icon">
            {extLabel === "PDF"
              ? "📄"
              : extLabel === "ZIP" || extLabel === "TAR" || extLabel === "GZ" || extLabel === "RAR"
              ? "📦"
              : extLabel === "MP3" || extLabel === "WAV" || extLabel === "OGG"
              ? "🎵"
              : extLabel === "MP4" || extLabel === "AVI" || extLabel === "MOV"
              ? "🎬"
              : "📁"}
          </div>
          <h3>Binary File</h3>
          <p className="binary-info">This file cannot be displayed as text.</p>
        </>
      )}
    </div>
  );
}

export const CodeViewer = forwardRef<CodeViewerHandle, CodeViewerProps>(function CodeViewer({
  content,
  filePath,
  isLoading,
  repoInfo,
  onRevealInTree,
  revealLine,
  onRevealComplete,
  copyScreenshotToClipboard = true,
  isCapturing = false,
  onScreenshotSaved,
  onCaptureComplete,
  onToast,
}, ref) {
  const [showPreview, setShowPreview] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const codeContentRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  useImperativeHandle(ref, () => ({
    getSelectedText: () => {
      const editorInstance = editorRef.current;
      if (!editorInstance) return "";
      const selection = editorInstance.getSelection();
      if (!selection) return "";
      const model = editorInstance.getModel();
      if (!model) return "";
      return model.getValueInRange(selection);
    },
  }));

  const handleScreenshotCapture = async (dataUrl: string) => {
    onCaptureComplete?.();

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
    }
  };

  const handleScreenshotCancel = () => {
    onCaptureComplete?.();
  };

  const isMarkdown =
    filePath.endsWith(".md") || filePath.endsWith(".markdown");
  const fileUrls = useMemo(() => {
    if (!repoInfo || !filePath) return null;
    const encodedPath = filePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return {
      githubUrl: `https://github.com/${repoInfo.owner}/${repoInfo.repo}/blob/${repoInfo.branch}/${encodedPath}`,
      rawUrl: `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch}/${encodedPath}`,
    };
  }, [repoInfo, filePath]);

  const handleOpenInGitHub = async () => {
    if (!fileUrls) return;
    await openUrl(fileUrls.githubUrl);
  };

  const handleDownload = async () => {
    if (!fileUrls) return;
    await openUrl(fileUrls.rawUrl);
  };

  const handleCopyUrl = async () => {
    if (!fileUrls) return;
    try {
      if (!navigator.clipboard?.writeText) return;
      await navigator.clipboard.writeText(fileUrls.githubUrl);
      setCopiedUrl(true);
      onToast?.("URL copied");
      window.setTimeout(() => setCopiedUrl(false), 1400);
    } catch {
      setCopiedUrl(false);
    }
  };

  const handleRevealInFinder = async () => {
    if (!repoInfo || !filePath) return;
    try {
      const repoPath = await getRepoPath(repoInfo.key);
      const separator = repoPath.includes("\\") ? "\\" : "/";
      const normalizedRepoPath = repoPath.replace(/[\\\/]+$/, "");
      const localPath = [normalizedRepoPath, ...filePath.split("/").filter(Boolean)].join(separator);
      await revealItemInDir(localPath);
    } catch (error) {
      console.error("Failed to reveal file in finder:", error);
    }
  };

  useEffect(() => {
    setCopiedUrl(false);
  }, [filePath]);

  useEffect(() => {
    if (!revealLine || !content || content.is_binary) return;
    if (isMarkdown && showPreview) {
      setShowPreview(false);
      return;
    }

    const editorInstance = editorRef.current;
    if (!editorInstance || !editorReady) return;
    const model = editorInstance.getModel();
    if (!model) return;

    const maxLine = model.getLineCount();
    const safeLine = Math.min(Math.max(1, revealLine), maxLine);
    const maxColumn = model.getLineMaxColumn(safeLine);
    editorInstance.setSelection({
      startLineNumber: safeLine,
      startColumn: 1,
      endLineNumber: safeLine,
      endColumn: maxColumn,
    });
    editorInstance.setPosition({ lineNumber: safeLine, column: 1 });
    editorInstance.revealLineInCenter(safeLine);
    editorInstance.focus();
    onRevealComplete?.();
  }, [revealLine, content, showPreview, isMarkdown, onRevealComplete, editorReady]);

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
          {filePath && onRevealInTree && (
            <button
              className="reveal-in-tree"
              onClick={onRevealInTree}
              title="Reveal in file tree"
              aria-label="Reveal in file tree"
            >
              📍
            </button>
          )}
          <span className="file-path">{filePath}</span>
          <span className="language-badge">binary</span>
          {fileUrls && (
            <div className="code-header-actions">
              <button
                className="code-action-icon"
                onClick={handleRevealInFinder}
                title="Reveal in Finder"
                aria-label="Reveal in Finder"
              >
                📂
              </button>
              <button
                className="code-action-icon"
                onClick={handleOpenInGitHub}
                title="Open in GitHub"
                aria-label="Open in GitHub"
              >
                ↗
              </button>
              <button
                className="code-action-icon"
                onClick={handleDownload}
                title="Download raw file"
                aria-label="Download raw file"
              >
                ⬇
              </button>
              <button
                className={`code-action-icon ${copiedUrl ? "copied" : ""}`}
                onClick={handleCopyUrl}
                title={copiedUrl ? "URL copied" : "Copy GitHub URL"}
                aria-label="Copy GitHub URL"
              >
                🔗
              </button>
            </div>
          )}
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
        {filePath && onRevealInTree && (
          <button
            className="reveal-in-tree"
            onClick={onRevealInTree}
            title="Reveal in file tree"
            aria-label="Reveal in file tree"
          >
            📍
          </button>
        )}
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
        <span className="language-badge">{content.language}</span>
        {fileUrls && (
          <div className="code-header-actions">
            <button
              className="code-action-icon"
              onClick={handleRevealInFinder}
              title="Reveal in Finder"
              aria-label="Reveal in Finder"
            >
              📂
            </button>
            <button
              className="code-action-icon"
              onClick={handleOpenInGitHub}
              title="Open in GitHub"
              aria-label="Open in GitHub"
            >
              ↗
            </button>
            <button
              className="code-action-icon"
              onClick={handleDownload}
              title="Download raw file"
              aria-label="Download raw file"
            >
              ⬇
            </button>
            <button
              className={`code-action-icon ${copiedUrl ? "copied" : ""}`}
              onClick={handleCopyUrl}
              title={copiedUrl ? "URL copied" : "Copy GitHub URL"}
              aria-label="Copy GitHub URL"
            >
              🔗
            </button>
          </div>
        )}
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
              onMount={(editor) => {
                editorRef.current = editor;
                setEditorReady(true);
              }}
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
});
