import { useState, useEffect, useRef } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getRepoPath } from "../api";
import type { RepoInfo } from "../types";

interface RepoListProps {
  repos: RepoInfo[];
  onSelect: (repo: RepoInfo) => void;
  onDelete: (repoKey: string) => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  repoKey: string;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function RepoList({ repos, onSelect, onDelete }: RepoListProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    repoKey: "",
  });
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };

    if (contextMenu.visible) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [contextMenu.visible]);

  const handleContextMenu = (e: React.MouseEvent, repoKey: string) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      repoKey,
    });
  };

  const handleRevealInFinder = async () => {
    try {
      const path = await getRepoPath(contextMenu.repoKey);
      await revealItemInDir(path);
    } catch (err) {
      console.error("Failed to reveal in Finder:", err);
    }
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const handleDeleteFromMenu = () => {
    onDelete(contextMenu.repoKey);
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  if (repos.length === 0) {
    return null;
  }

  return (
    <div className="repo-list">
      <h3>Recent Repositories</h3>
      <div className="repo-items">
        {repos.map((repo) => (
          <div
            key={repo.key}
            className="repo-item"
            onContextMenu={(e) => handleContextMenu(e, repo.key)}
          >
            <div className="repo-info" onClick={() => onSelect(repo)}>
              <span className="repo-name">
                {repo.owner}/{repo.repo}
              </span>
              <span className="repo-branch">{repo.branch}</span>
              <span className="repo-date">{formatDate(repo.imported_at)}</span>
            </div>
            <button
              className="repo-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(repo.key);
              }}
              title="Delete repository"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          ref={menuRef}
          className="context-menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <button className="context-menu-item" onClick={handleRevealInFinder}>
            Reveal in Finder
          </button>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item danger"
            onClick={handleDeleteFromMenu}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
