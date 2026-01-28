import { Suspense, lazy } from "react";
import type { FileContent } from "../types";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

interface CodeViewerProps {
  content: FileContent | null;
  filePath: string;
  isLoading: boolean;
}

function LoadingSpinner() {
  return (
    <div className="code-loading">
      <div className="spinner"></div>
      <span>Loading editor...</span>
    </div>
  );
}

export function CodeViewer({ content, filePath, isLoading }: CodeViewerProps) {
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

  return (
    <div className="code-viewer">
      <div className="code-header">
        <span className="file-path">{filePath}</span>
        {content.truncated && (
          <span className="truncated-badge">
            Truncated {content.total_lines ? `(${content.total_lines.toLocaleString()} lines total)` : ""}
          </span>
        )}
        <span className="language-badge">{content.language}</span>
      </div>
      <div className="code-content">
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
              fontFamily: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
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
      </div>
    </div>
  );
}
