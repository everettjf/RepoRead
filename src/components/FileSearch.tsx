import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { FileNode } from "../types";
import "./FileSearch.css";

interface FileSearchProps {
  isOpen: boolean;
  onClose: () => void;
  tree: FileNode | null;
  onFileSelect: (path: string) => void;
}

interface FlatFile {
  path: string;
  name: string;
}

// Flatten file tree to get all files (not directories)
function flattenTree(node: FileNode, files: FlatFile[] = []): FlatFile[] {
  if (!node.is_dir) {
    files.push({ path: node.path, name: node.name });
  }
  if (node.children) {
    for (const child of node.children) {
      flattenTree(child, files);
    }
  }
  return files;
}

// Simple fuzzy match: check if all query chars appear in order in the target
function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  let queryIndex = 0;
  let score = 0;
  let consecutiveMatches = 0;
  let lastMatchIndex = -1;

  for (let i = 0; i < targetLower.length && queryIndex < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIndex]) {
      queryIndex++;

      // Bonus for consecutive matches
      if (lastMatchIndex === i - 1) {
        consecutiveMatches++;
        score += consecutiveMatches * 2;
      } else {
        consecutiveMatches = 0;
      }

      // Bonus for matching at start or after separator
      if (i === 0 || target[i - 1] === "/" || target[i - 1] === "." || target[i - 1] === "_" || target[i - 1] === "-") {
        score += 5;
      }

      lastMatchIndex = i;
      score += 1;
    }
  }

  // Penalty for longer paths (prefer shorter matches)
  score -= target.length * 0.1;

  return { match: queryIndex === queryLower.length, score };
}

export function FileSearch({ isOpen, onClose, tree, onFileSelect }: FileSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Get all files from tree
  const allFiles = useMemo(() => {
    if (!tree) return [];
    return flattenTree(tree);
  }, [tree]);

  // Filter and sort files based on query
  const filteredFiles = useMemo(() => {
    if (!query.trim()) {
      // Show all files sorted alphabetically when no query
      return [...allFiles].sort((a, b) => a.path.localeCompare(b.path)).slice(0, 50);
    }

    const results: { file: FlatFile; score: number }[] = [];

    for (const file of allFiles) {
      // Match against both full path and filename
      const pathMatch = fuzzyMatch(query, file.path);
      const nameMatch = fuzzyMatch(query, file.name);

      // Use the better match
      if (pathMatch.match || nameMatch.match) {
        const score = Math.max(
          pathMatch.match ? pathMatch.score : -Infinity,
          nameMatch.match ? nameMatch.score + 10 : -Infinity // Bonus for name matches
        );
        results.push({ file, score });
      }
    }

    // Sort by score (higher is better)
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, 50).map(r => r.file);
  }, [allFiles, query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(".file-search-item.selected");
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredFiles.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredFiles[selectedIndex]) {
          onFileSelect(filteredFiles[selectedIndex].path);
          onClose();
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredFiles, selectedIndex, onFileSelect, onClose]);

  const handleItemClick = useCallback((path: string) => {
    onFileSelect(path);
    onClose();
  }, [onFileSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div className="file-search-overlay" onClick={onClose}>
      <div className="file-search-modal" onClick={e => e.stopPropagation()}>
        <div className="file-search-input-wrapper">
          <span className="file-search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="file-search-input"
            placeholder="Search files by name..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
          <span className="file-search-shortcut">ESC</span>
        </div>

        <div className="file-search-list" ref={listRef}>
          {filteredFiles.length === 0 ? (
            <div className="file-search-empty">
              {query ? "No files found" : "No files in repository"}
            </div>
          ) : (
            filteredFiles.map((file, index) => (
              <div
                key={file.path}
                className={`file-search-item ${index === selectedIndex ? "selected" : ""}`}
                onClick={() => handleItemClick(file.path)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="file-search-item-icon">{getFileIcon(file.name)}</span>
                <div className="file-search-item-content">
                  <span className="file-search-item-name">{file.name}</span>
                  <span className="file-search-item-path">{file.path}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function getFileIcon(name: string): string {
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
