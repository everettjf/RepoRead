import { useMemo } from "react";

interface InterpretModalProps {
  isOpen: boolean;
  isLoading: boolean;
  result: string | null;
  error: string | null;
  onClose: () => void;
}

function renderMarkdown(content: string): string {
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
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Horizontal rule
    .replace(/^---$/gm, "<hr />")
    // Unordered lists
    .replace(/^[\*\-]\s+(.*)$/gm, "<li>$1</li>")
    // Ordered lists
    .replace(/^\d+\.\s+(.*)$/gm, "<li>$1</li>")
    // Blockquotes
    .replace(/^>\s+(.*)$/gm, "<blockquote>$1</blockquote>")
    // Line breaks
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br />");

  // Wrap lists
  result = result.replace(/(<li>.*<\/li>)(?=<li>|$)/gs, "<ul>$1</ul>");
  result = result.replace(/<\/ul><ul>/g, "");

  return `<p>${result}</p>`;
}

export function InterpretModal({
  isOpen,
  isLoading,
  result,
  error,
  onClose,
}: InterpretModalProps) {
  const html = useMemo(() => {
    if (!result) return "";
    return renderMarkdown(result);
  }, [result]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Interpretation</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          {isLoading && (
            <div className="modal-loading">
              <div className="spinner"></div>
              <span>Interpreting code...</span>
            </div>
          )}
          {error && <div className="modal-error">{error}</div>}
          {result && (
            <div
              className="modal-result markdown-preview"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
