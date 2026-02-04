import { useState, useEffect, useRef } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getRepoPath } from "../api";
import type { RepoInfo } from "../types";

interface RepoListProps {
  repos: RepoInfo[];
  onSelect: (repo: RepoInfo) => void;
  onDelete: (repoKey: string) => void;
  onUpdate: (repoKey: string) => void;
  updatingRepoKey?: string | null;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  repoKey: string;
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function RepoList({ repos, onSelect, onDelete, onUpdate, updatingRepoKey }: RepoListProps) {
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

  const handleUpdateFromMenu = () => {
    onUpdate(contextMenu.repoKey);
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  if (repos.length === 0) {
    return null;
  }

  return (
    <div className="repo-list">
      <h3>Recent Repositories</h3>
      <div className="repo-items">
        {repos.map((repo) => {
          const isUpdating = updatingRepoKey === repo.key;
          return (
          <div
            key={repo.key}
            className={`repo-item ${isUpdating ? "is-updating" : ""}`}
            onContextMenu={(e) => {
              if (isUpdating) return;
              handleContextMenu(e, repo.key);
            }}
          >
            <div className="repo-info" onClick={() => !isUpdating && onSelect(repo)}>
              <span className="repo-name">
                {repo.owner}/{repo.repo}
              </span>
              {isUpdating && <span className="repo-updating">Updating...</span>}
              <span className="repo-date">
                {formatRelativeTime(repo.last_opened_at || repo.imported_at)}
              </span>
            </div>
            <button
              className="repo-delete"
              onClick={(e) => {
                e.stopPropagation();
                if (isUpdating) return;
                onDelete(repo.key);
              }}
              title="Delete repository"
              disabled={isUpdating}
            >
              ×
            </button>
          </div>
          );
        })}
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
          <button className="context-menu-item" onClick={handleUpdateFromMenu}>
            Update
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
