import type { RepoInfo } from "../types";

interface RepoListProps {
  repos: RepoInfo[];
  onSelect: (repo: RepoInfo) => void;
  onDelete: (repoKey: string) => void;
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
  if (repos.length === 0) {
    return null;
  }

  return (
    <div className="repo-list">
      <h3>Recent Repositories</h3>
      <div className="repo-items">
        {repos.map((repo) => (
          <div key={repo.key} className="repo-item">
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
    </div>
  );
}
