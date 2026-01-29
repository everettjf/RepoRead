import { useState, useEffect, useRef, useCallback } from "react";
import type { FileHistoryEntry } from "../types";
import "./FileHistory.css";

interface FileHistoryProps {
  history: FileHistoryEntry[];
  onFileSelect: (path: string) => void;
}

export function FileHistory({ history, onFileSelect }: FileHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleItemClick = useCallback((path: string) => {
    onFileSelect(path);
    setIsOpen(false);
  }, [onFileSelect]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  return (
    <div className="file-history-container" ref={dropdownRef}>
      <button
        className="toolbar-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Recently opened files"
      >
        🕐 History
      </button>

      {isOpen && (
        <div className="file-history-dropdown">
          <div className="file-history-header">
            <span>Recently Opened</span>
            <span className="file-history-count">{history.length}</span>
          </div>

          <div className="file-history-list">
            {history.length === 0 ? (
              <div className="file-history-empty">
                No files opened yet
              </div>
            ) : (
              history.map((entry, index) => (
                <div
                  key={`${entry.path}-${index}`}
                  className="file-history-item"
                  onClick={() => handleItemClick(entry.path)}
                >
                  <span className="file-history-item-icon">{getFileIcon(entry.path)}</span>
                  <div className="file-history-item-content">
                    <span className="file-history-item-name">{getFileName(entry.path)}</span>
                    <span className="file-history-item-path">{entry.path}</span>
                  </div>
                  <span className="file-history-item-time">{formatTime(entry.opened_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getFileName(path: string): string {
  return path.split("/").pop() || path;
}

function getFileIcon(path: string): string {
  const name = getFileName(path);
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const iconMap: Record<string, string> = {
    ts: "📘",
    tsx: "📘",
    js: "📒",
    jsx: "📒",
    json: "📋",
    md: "📝",
    css: "🎨",
    scss: "🎨",
    html: "🌐",
    py: "🐍",
    rs: "🦀",
    go: "🐹",
    rb: "💎",
    java: "☕",
    kt: "🟣",
    swift: "🍎",
    c: "🔧",
    cpp: "🔧",
    h: "📎",
    hpp: "📎",
    yaml: "⚙️",
    yml: "⚙️",
    toml: "⚙️",
    lock: "🔒",
    sh: "🖥️",
    bash: "🖥️",
    zsh: "🖥️",
    sql: "🗃️",
    svg: "🖼️",
    png: "🖼️",
    jpg: "🖼️",
    jpeg: "🖼️",
    gif: "🖼️",
    ico: "🖼️",
    txt: "📄",
  };
  return iconMap[ext] || "📄";
}
