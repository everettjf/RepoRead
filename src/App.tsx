import { useState, useEffect, useCallback } from "react";
import { FileTree } from "./components/FileTree";
import { CodeViewer } from "./components/CodeViewer";
import { RepoList } from "./components/RepoList";
import { UrlInput } from "./components/UrlInput";
import {
  importRepoFromGithub,
  readTextFile,
  listRecentRepos,
  getRepoTree,
  deleteRepo,
  searchGithubRepos,
} from "./api";
import type { FileNode, RepoInfo, FileContent, SearchResultItem } from "./types";
import "./App.css";

type View = "home" | "repo";

function formatStars(count: number): string {
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return String(count);
}

function SearchResults({
  results,
  onImport,
  importingRepo,
}: {
  results: SearchResultItem[];
  onImport: (item: SearchResultItem) => void;
  importingRepo: string | null;
}) {
  if (results.length === 0) return null;

  return (
    <div className="search-results">
      <h3>Search Results</h3>
      <div className="search-items">
        {results.map((item) => (
          <div key={item.full_name} className="search-item">
            <div className="search-item-info">
              <div className="search-item-header">
                <span className="search-item-name">{item.full_name}</span>
                <span className="search-item-stars">
                  ⭐ {formatStars(item.stargazers_count)}
                </span>
              </div>
              {item.description && (
                <p className="search-item-desc">{item.description}</p>
              )}
            </div>
            <button
              className="search-item-import"
              onClick={() => onImport(item)}
              disabled={importingRepo === item.full_name}
            >
              {importingRepo === item.full_name ? (
                <>
                  <span className="spinner small"></span>
                  Importing...
                </>
              ) : (
                "Import"
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [view, setView] = useState<View>("home");
  const [recentRepos, setRecentRepos] = useState<RepoInfo[]>([]);
  const [currentRepo, setCurrentRepo] = useState<RepoInfo | null>(null);
  const [tree, setTree] = useState<FileNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [error, setError] = useState<string>("");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [importingRepo, setImportingRepo] = useState<string | null>(null);

  // Load recent repos on mount
  useEffect(() => {
    loadRecentRepos();
  }, []);

  const loadRecentRepos = async () => {
    try {
      const repos = await listRecentRepos();
      setRecentRepos(repos);
    } catch (err) {
      console.error("Failed to load recent repos:", err);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || isSearching) return;

    setIsSearching(true);
    setError("");

    try {
      const results = await searchGithubRepos(searchQuery);
      setSearchResults(results);
    } catch (err) {
      setError(String(err));
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchImport = async (item: SearchResultItem) => {
    setImportingRepo(item.full_name);
    setError("");

    try {
      const result = await importRepoFromGithub(item.html_url);
      setCurrentRepo(result.info);
      setTree(result.tree);
      setView("repo");
      setSelectedPath("");
      setFileContent(null);
      setSearchResults([]);
      setSearchQuery("");
      await loadRecentRepos();
    } catch (err) {
      setError(String(err));
    } finally {
      setImportingRepo(null);
    }
  };

  const handleImport = async (url: string) => {
    setIsImporting(true);
    setError("");

    try {
      const result = await importRepoFromGithub(url);
      setCurrentRepo(result.info);
      setTree(result.tree);
      setView("repo");
      setSelectedPath("");
      setFileContent(null);
      setSearchResults([]);
      setSearchQuery("");
      await loadRecentRepos();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsImporting(false);
    }
  };

  const handleRepoSelect = async (repo: RepoInfo) => {
    try {
      const repoTree = await getRepoTree(repo.key);
      setCurrentRepo(repo);
      setTree(repoTree);
      setView("repo");
      setSelectedPath("");
      setFileContent(null);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleRepoDelete = async (repoKey: string) => {
    if (!confirm("Delete this repository?")) return;

    try {
      await deleteRepo(repoKey);
      await loadRecentRepos();

      if (currentRepo?.key === repoKey) {
        setView("home");
        setCurrentRepo(null);
        setTree(null);
        setFileContent(null);
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const handleFileSelect = useCallback(
    async (path: string) => {
      if (!currentRepo || !path) return;

      setSelectedPath(path);
      setIsLoadingFile(true);

      try {
        const content = await readTextFile(currentRepo.key, path);
        setFileContent(content);
      } catch (err) {
        setError(String(err));
        setFileContent(null);
      } finally {
        setIsLoadingFile(false);
      }
    },
    [currentRepo]
  );

  const handleBack = () => {
    setView("home");
    setCurrentRepo(null);
    setTree(null);
    setFileContent(null);
    setSelectedPath("");
    setError("");
  };

  if (view === "home") {
    return (
      <div className="app home-view">
        <header className="app-header">
          <h1>RepoView</h1>
          <p className="tagline">Read GitHub repositories. No clone. No setup. Just code.</p>
        </header>

        <main className="home-content">
          {/* Search Section */}
          <div className="search-section">
            <form className="search-form" onSubmit={handleSearch}>
              <input
                type="text"
                className="search-input"
                placeholder="Search GitHub repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isSearching}
              />
              <button
                type="submit"
                className="search-submit"
                disabled={isSearching || !searchQuery.trim()}
              >
                {isSearching ? (
                  <>
                    <span className="spinner small"></span>
                    Searching...
                  </>
                ) : (
                  "Search"
                )}
              </button>
            </form>
          </div>

          {/* Search Results */}
          <SearchResults
            results={searchResults}
            onImport={handleSearchImport}
            importingRepo={importingRepo}
          />

          {/* Divider when search results exist */}
          {searchResults.length > 0 && <div className="section-divider" />}

          {/* URL Input */}
          <UrlInput onSubmit={handleImport} isLoading={isImporting} error={error} />

          {/* Recent Repos */}
          <RepoList
            repos={recentRepos}
            onSelect={handleRepoSelect}
            onDelete={handleRepoDelete}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app repo-view">
      <header className="repo-header">
        <button className="back-button" onClick={handleBack}>
          ← Back
        </button>
        <div className="repo-title">
          <span className="repo-name">
            {currentRepo?.owner}/{currentRepo?.repo}
          </span>
          <span className="repo-branch">{currentRepo?.branch}</span>
        </div>
      </header>

      <div className="repo-content">
        <aside className="sidebar">
          {tree && (
            <FileTree
              tree={tree}
              onFileSelect={handleFileSelect}
              selectedPath={selectedPath}
            />
          )}
        </aside>

        <main className="main-content">
          <CodeViewer
            content={fileContent}
            filePath={selectedPath}
            isLoading={isLoadingFile}
            repoInfo={currentRepo}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
