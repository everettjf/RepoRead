import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { FileNode, FileContent } from "../types";
import "./ContentSearch.css";

interface ContentSearchProps {
  isOpen: boolean;
  onClose: () => void;
  tree: FileNode | null;
  readFileContent: (path: string) => Promise<FileContent>;
  onResultSelect: (path: string, line: number) => void;
}

interface FlatFile {
  path: string;
  name: string;
}

interface SearchResult {
  path: string;
  name: string;
  line: number;
  lineText: string;
  matchIndex: number;
  truncated: boolean;
}

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

function truncateLine(text: string, maxLength = 220): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}

export function ContentSearch({
  isOpen,
  onClose,
  tree,
  readFileContent,
  onResultSelect,
}: ContentSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [limited, setLimited] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchIdRef = useRef(0);
  const debounceRef = useRef<number | null>(null);
  const cacheRef = useRef<Map<string, FileContent>>(new Map());
  const lastCompletedQueryRef = useRef<string>("");

  const MAX_RESULTS = 200;
  const MAX_FILES = 1500;
  const CACHE_LIMIT = 200;
  const DEBOUNCE_MS = 250;

  const allFiles = useMemo(() => {
    if (!tree) return [];
    return flattenTree(tree);
  }, [tree]);

  useEffect(() => {
    if (!isOpen) {
      searchIdRef.current += 1;
      setIsSearching(false);
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      return;
    }
    setSelectedIndex(0);
    setTotalFiles(allFiles.length);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen, allFiles.length]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    setScannedCount(0);
    setStopped(false);
    setLimited(false);
    lastCompletedQueryRef.current = "";
    cacheRef.current.clear();
  }, [tree?.path]);

  useEffect(() => {
    if (!listRef.current) return;
    const selectedElement = listRef.current.querySelector(".content-search-item.selected");
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      setScannedCount(0);
      setStopped(false);
      setLimited(false);
      lastCompletedQueryRef.current = "";
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      return;
    }

    if (
      trimmed === lastCompletedQueryRef.current &&
      results.length > 0 &&
      !isSearching &&
      !stopped
    ) {
      return;
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      const searchId = ++searchIdRef.current;
      const queryLower = trimmed.toLowerCase();
      let isActive = true;

      setIsSearching(true);
      setResults([]);
      setScannedCount(0);
      setTotalFiles(allFiles.length);
      setStopped(false);
      setLimited(false);

      const runSearch = async () => {
        const found: SearchResult[] = [];
        let scanned = 0;
        const fileList = allFiles.slice(0, MAX_FILES);

        for (const file of fileList) {
          if (!isActive || searchIdRef.current !== searchId) return;
          if (found.length >= MAX_RESULTS) break;

          try {
            let content = cacheRef.current.get(file.path);
            if (!content) {
              content = await readFileContent(file.path);
              cacheRef.current.set(file.path, content);
              if (cacheRef.current.size > CACHE_LIMIT) {
                const firstKey = cacheRef.current.keys().next().value;
                if (firstKey) cacheRef.current.delete(firstKey);
              }
            }

            if (content.is_binary) {
              scanned += 1;
              setScannedCount(scanned);
              continue;
            }

            const lines = content.content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const lineText = lines[i];
              const matchIndex = lineText.toLowerCase().indexOf(queryLower);
              if (matchIndex !== -1) {
                const previewLine = truncateLine(lineText);
                found.push({
                  path: file.path,
                  name: file.name,
                  line: i + 1,
                  lineText: previewLine,
                  matchIndex: matchIndex >= previewLine.length ? -1 : matchIndex,
                  truncated: content.truncated,
                });
                if (found.length % 20 === 0) {
                  setResults([...found]);
                }
                if (found.length >= MAX_RESULTS) break;
              }
            }
          } catch (err) {
            // Ignore file read errors for search
          }

          scanned += 1;
          setScannedCount(scanned);

          if (scanned % 8 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }

        if (!isActive || searchIdRef.current !== searchId) return;
        setResults(found);
        setIsSearching(false);
        setLimited(allFiles.length > MAX_FILES || found.length >= MAX_RESULTS);
        lastCompletedQueryRef.current = trimmed;
      };

      runSearch();

      return () => {
        isActive = false;
      };
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query, allFiles, readFileContent, isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIndex]) {
          onResultSelect(results[selectedIndex].path, results[selectedIndex].line);
          onClose();
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }, [results, selectedIndex, onResultSelect, onClose]);

  const stopSearch = () => {
    searchIdRef.current += 1;
    setIsSearching(false);
    setStopped(true);
  };

  const handleItemClick = useCallback((item: SearchResult) => {
    onResultSelect(item.path, item.line);
    onClose();
  }, [onResultSelect, onClose]);

  const statusText = isSearching
    ? `Searching ${scannedCount}/${Math.min(totalFiles, MAX_FILES)} files...`
    : stopped
    ? "Search stopped"
    : results.length > 0
    ? `${results.length} result${results.length > 1 ? "s" : ""}`
    : "";

  if (!isOpen) return null;

  return (
    <div className="content-search-overlay" onClick={onClose}>
      <div className="content-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="content-search-input-wrapper">
          <span className="content-search-icon">🔎</span>
          <input
            ref={inputRef}
            type="text"
            className="content-search-input"
            placeholder="Find in files (min 2 chars)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
          <button
            className="content-search-clear"
            onClick={() => {
              searchIdRef.current += 1;
              setQuery("");
              setResults([]);
              setScannedCount(0);
              setStopped(false);
              setLimited(false);
              setIsSearching(false);
              lastCompletedQueryRef.current = "";
              if (debounceRef.current) {
                window.clearTimeout(debounceRef.current);
                debounceRef.current = null;
              }
            }}
            aria-label="Clear search"
            title="Clear"
            disabled={!query && results.length === 0 && !isSearching}
          >
            ✕
          </button>
          {isSearching ? (
            <button className="content-search-stop" onClick={stopSearch}>
              Stop
            </button>
          ) : (
            <span className="content-search-shortcut">ESC</span>
          )}
        </div>

        {statusText && (
          <div className="content-search-status">
            {statusText}
            {totalFiles > MAX_FILES && (
              <span className="content-search-note">Searching first {MAX_FILES} files</span>
            )}
            {limited && results.length >= MAX_RESULTS && (
              <span className="content-search-note">Showing top {MAX_RESULTS}</span>
            )}
            {results.some((r) => r.truncated) && (
              <span className="content-search-note">Partial results (large files)</span>
            )}
          </div>
        )}

        <div className="content-search-list" ref={listRef}>
          {query.trim().length < 2 ? (
            <div className="content-search-empty">Type at least 2 characters to search.</div>
          ) : results.length === 0 ? (
            <div className="content-search-empty">
              {isSearching ? "Searching..." : "No matches found"}
            </div>
          ) : (
            results.map((item, index) => (
              <div
                key={`${item.path}-${item.line}-${index}`}
                className={`content-search-item ${index === selectedIndex ? "selected" : ""}`}
                onClick={() => handleItemClick(item)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="content-search-item-icon">{getFileIcon(item.name)}</span>
                <div className="content-search-item-content">
                  <div className="content-search-item-title">
                    <span className="content-search-item-name">{item.name}</span>
                    <span className="content-search-item-line">:{item.line}</span>
                    {item.truncated && <span className="content-search-item-badge">partial</span>}
                  </div>
                  <div className="content-search-item-path">{item.path}</div>
                  <div className="content-search-item-snippet">
                    {renderHighlightedSnippet(item.lineText, query, item.matchIndex)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function renderHighlightedSnippet(text: string, query: string, matchIndex: number) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;
  if (matchIndex < 0) return text;
  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + trimmedQuery.length);
  const after = text.slice(matchIndex + trimmedQuery.length);
  return (
    <>
      {before}
      <mark className="content-search-highlight">{match}</mark>
      {after}
    </>
  );
}
