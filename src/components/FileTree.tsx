import { useState, useCallback } from "react";
import type { FileNode } from "../types";

interface FileTreeProps {
  tree: FileNode;
  onFileSelect: (path: string) => void;
  selectedPath?: string;
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedPath?: string;
  parentPath: string;
}

function TreeNode({ node, depth, onFileSelect, selectedPath, parentPath }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);

  const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const isSelected = selectedPath === node.path;

  const handleClick = useCallback(() => {
    if (node.is_dir) {
      setExpanded((e) => !e);
    } else {
      onFileSelect(node.path);
    }
  }, [node, onFileSelect]);

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
              parentPath={fullPath}
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

export function FileTree({ tree, onFileSelect, selectedPath }: FileTreeProps) {
  if (!tree.children || tree.children.length === 0) {
    return <div className="file-tree empty">No files</div>;
  }

  return (
    <div className="file-tree">
      <div className="tree-header">
        <span className="tree-icon">📦</span>
        <span className="tree-name">{tree.name}</span>
      </div>
      <div className="tree-content">
        {tree.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={0}
            onFileSelect={onFileSelect}
            selectedPath={selectedPath}
            parentPath=""
          />
        ))}
      </div>
    </div>
  );
}
