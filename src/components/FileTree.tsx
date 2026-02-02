import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { FileNode } from "../types";

interface FileTreeProps {
  tree: FileNode;
  onFileSelect: (path: string) => void;
  selectedPath?: string;
  revealPath?: string;
  revealRequestId?: number;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedPath?: string;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  forceExpand?: boolean;
}

function TreeNode({ node, depth, onFileSelect, selectedPath, expandedPaths, onToggle, forceExpand }: TreeNodeProps) {
  const expanded = forceExpand ? true : expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;

  const handleClick = useCallback(() => {
    if (node.is_dir) {
      onToggle(node.path);
    } else {
      onFileSelect(node.path);
    }
  }, [node, onFileSelect, onToggle]);

  const getFileIcon = (name: string, isDir: boolean): string => {
    if (isDir) return expanded ? "📂" : "📁";

    const ext = name.split(".").pop()?.toLowerCase() || "";
    switch (ext) {
      case "js":
      case "mjs":
      case "cjs":
        return "📜";
      case "ts":
      case "tsx":
        return "📘";
      case "jsx":
        return "📙";
      case "py":
        return "🐍";
      case "json":
        return "📋";
      case "md":
        return "📝";
      case "rs":
        return "🦀";
      case "html":
        return "🌐";
      case "css":
      case "scss":
        return "🎨";
      default:
        return "📄";
    }
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-item ${isSelected ? "selected" : ""} ${node.is_dir ? "dir" : "file"}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        data-path={node.path}
        onClick={handleClick}
      >
        <span className="tree-icon">{getFileIcon(node.name, node.is_dir)}</span>
        <span className="tree-name">{node.name}</span>
        {!node.is_dir && node.size !== undefined && (
          <span className="tree-size">{formatSize(node.size)}</span>
        )}
      </div>
      {node.is_dir && expanded && node.children && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              forceExpand={forceExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Collect all directory paths from the tree
function collectDirPaths(node: FileNode, paths: string[] = []): string[] {
  if (node.is_dir) {
    paths.push(node.path);
    if (node.children) {
      for (const child of node.children) {
        collectDirPaths(child, paths);
      }
    }
  }
  return paths;
}

function filterTreeNode(node: FileNode, query: string): FileNode | null {
  const match = node.name.toLowerCase().includes(query);
  if (!node.is_dir) {
    return match ? node : null;
  }

  const children = node.children || [];
  const filteredChildren = children
    .map((child) => filterTreeNode(child, query))
    .filter((child): child is FileNode => Boolean(child));

  if (match || filteredChildren.length > 0) {
    return {
      ...node,
      children: filteredChildren,
    };
  }
  return null;
}

function buildAncestorPaths(path: string): string[] {
  if (!path) return [];
  const parts = path.split("/").filter(Boolean);
  const ancestors: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i).join("/"));
  }
  return ancestors;
}

function getSafeSelector(path: string): string {
  if (typeof window !== "undefined" && window.CSS && window.CSS.escape) {
    return window.CSS.escape(path);
  }
  return path.replace(/["\\]/g, "\\$&");
}

export function FileTree({
  tree,
  onFileSelect,
  selectedPath,
  revealPath,
  revealRequestId,
  onNavigateBack,
  onNavigateForward,
  canNavigateBack,
  canNavigateForward,
}: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [filterText, setFilterText] = useState("");
  const treeContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFilterText("");
  }, [tree.path, tree.name]);

  const allDirPaths = useMemo(() => {
    const paths: string[] = [];
    if (tree.children) {
      for (const child of tree.children) {
        collectDirPaths(child, paths);
      }
    }
    return paths;
  }, [tree]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedPaths(new Set(allDirPaths));
  }, [allDirPaths]);

  const handleCollapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const filterQuery = filterText.trim().toLowerCase();
  const isFiltering = filterQuery.length > 0;

  const filteredChildren = useMemo(() => {
    if (!tree.children) return [];
    if (!isFiltering) return tree.children;
    return tree.children
      .map((child) => filterTreeNode(child, filterQuery))
      .filter((child): child is FileNode => Boolean(child));
  }, [tree.children, filterQuery, isFiltering]);

  useEffect(() => {
    if (!revealPath) return;
    const ancestors = buildAncestorPaths(revealPath);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      for (const ancestor of ancestors) {
        next.add(ancestor);
      }
      return next;
    });

    const selector = `[data-path="${getSafeSelector(revealPath)}"]`;
    requestAnimationFrame(() => {
      const target = treeContentRef.current?.querySelector(selector);
      target?.scrollIntoView({ block: "center" });
    });
  }, [revealPath, revealRequestId]);

  if (!tree.children || tree.children.length === 0) {
    return <div className="file-tree empty">No files</div>;
  }

  return (
    <div className="file-tree">
      <div className="tree-header">
        <span className="tree-icon">📦</span>
        <span className="tree-name">{tree.name}</span>
        <div className="tree-actions">
          <button
            className="tree-action-btn"
            onClick={onNavigateBack}
            title="Back"
            disabled={!canNavigateBack}
          >
            ◀
          </button>
          <button
            className="tree-action-btn"
            onClick={onNavigateForward}
            title="Forward"
            disabled={!canNavigateForward}
          >
            ▶
          </button>
          <button className="tree-action-btn" onClick={handleExpandAll} title="Expand All">
            ⊞
          </button>
          <button className="tree-action-btn" onClick={handleCollapseAll} title="Collapse All">
            ⊟
          </button>
        </div>
      </div>
      <div className="tree-content" ref={treeContentRef}>
        {filteredChildren.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={0}
            onFileSelect={onFileSelect}
            selectedPath={selectedPath}
            expandedPaths={expandedPaths}
            onToggle={handleToggle}
            forceExpand={isFiltering}
          />
        ))}
      </div>
      <div className="tree-filter">
        <input
          type="text"
          className="tree-filter-input"
          placeholder="Filter files and folders"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>
    </div>
  );
}
