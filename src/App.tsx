import { useState, useEffect, useCallback } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FileTree } from "./components/FileTree";
import { CodeViewer } from "./components/CodeViewer";
import { RepoList } from "./components/RepoList";
import {
  importRepoFromGithub,
  readTextFile,
  listRecentRepos,
  getRepoTree,
  deleteRepo,
  searchGithubRepos,
  getSettings,
  updateSettings,
} from "./api";
import type { FileNode, RepoInfo, FileContent, SearchResultItem, AppSettings } from "./types";
import "./App.css";

type View = "home" | "repo" | "settings";

function formatStars(count: number): string {
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return String(count);
}

// Check if input looks like a GitHub URL
function isGitHubUrl(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  return (
    trimmed.startsWith("https://github.com/") ||
    trimmed.startsWith("http://github.com/") ||
    trimmed.startsWith("github.com/") ||
    /^[\w-]+\/[\w.-]+$/.test(trimmed) // owner/repo format
  );
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

function SettingsPage({
  settings,
  onSave,
  onBack,
}: {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
  onBack: () => void;
}) {
  const [token, setToken] = useState(settings.github_token || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ github_token: token || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenGitHub = async () => {
    await openUrl("https://github.com/settings/tokens/new?description=RepoView&scopes=public_repo");
  };

  return (
    <div className="app settings-view">
      <header className="settings-header">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <h1>Settings</h1>
      </header>

      <main className="settings-content">
        <section className="settings-section">
          <h2>GitHub Token</h2>
          <p className="settings-desc">
            Add a personal access token to increase API rate limits.
          </p>
          <div className="settings-rate-info">
            <span className="rate-item">Without token: <strong>10 searches/min</strong></span>
            <span className="rate-item">With token: <strong>30 searches/min</strong></span>
          </div>

          <div className="token-input-group">
            <input
              type="password"
              className="token-input"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button
              className="save-button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : saved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h2>How to get a GitHub Token</h2>
          <ol className="token-steps">
            <li>Click the button below to open GitHub token settings</li>
            <li>Sign in to GitHub if prompted</li>
            <li>Set expiration (recommend: 90 days or longer)</li>
            <li>Under "Select scopes", check <code>public_repo</code></li>
            <li>Click "Generate token" at the bottom</li>
            <li>Copy the token and paste it above</li>
          </ol>
          <button className="github-link-button" onClick={handleOpenGitHub}>
            Open GitHub Token Page →
          </button>
        </section>
      </main>
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
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [error, setError] = useState<string>("");

  // Unified input state
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [importingRepo, setImportingRepo] = useState<string | null>(null);

  // Settings
  const [settings, setSettings] = useState<AppSettings>({ github_token: null });

  // Load recent repos and settings on mount
  useEffect(() => {
    loadRecentRepos();
    loadSettings();
  }, []);

  const loadRecentRepos = async () => {
    try {
      const repos = await listRecentRepos();
      setRecentRepos(repos);
    } catch (err) {
      console.error("Failed to load recent repos:", err);
    }
  };

  const loadSettings = async () => {
    try {
      const s = await getSettings();
      setSettings(s);
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    setError("");

    try {
      if (isGitHubUrl(input)) {
        // Direct import
        const url = input.includes("github.com") ? input : `https://github.com/${input}`;
        const result = await importRepoFromGithub(url);
        setCurrentRepo(result.info);
        setTree(result.tree);
        setView("repo");
        setSelectedPath("");
        setFileContent(null);
        setSearchResults([]);
        setInput("");
        await loadRecentRepos();
      } else {
        // Search
        const results = await searchGithubRepos(input, settings.github_token);
        setSearchResults(results);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
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
      setInput("");
      await loadRecentRepos();
    } catch (err) {
      setError(String(err));
    } finally {
      setImportingRepo(null);
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

  const handleSaveSettings = async (newSettings: AppSettings) => {
    await updateSettings(newSettings);
    setSettings(newSettings);
  };

  // Settings view
  if (view === "settings") {
    return (
      <SettingsPage
        settings={settings}
        onSave={handleSaveSettings}
        onBack={() => setView("home")}
      />
    );
  }

  // Home view
  if (view === "home") {
    const inputHint = isGitHubUrl(input)
      ? "Press Enter to import this repository"
      : input.trim()
      ? "Press Enter to search GitHub"
      : "";

    return (
      <div className="app home-view">
        <header className="app-header">
          <button
            className="settings-button"
            onClick={() => setView("settings")}
            title="Settings"
          >
            ⚙️
          </button>
          <div className="header-content">
            <span className="app-logo">📖</span>
            <h1>RepoView</h1>
          </div>
          <p className="tagline">Read GitHub repositories. No clone. No setup. Just code.</p>
        </header>

        <main className="home-content">
          {/* Unified Input */}
          <div className="input-section">
            <form className="unified-form" onSubmit={handleSubmit}>
              <input
                type="text"
                className="unified-input"
                placeholder="Search repos or paste GitHub URL (e.g. facebook/react)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
              <button
                type="submit"
                className="unified-submit"
                disabled={isLoading || !input.trim()}
              >
                {isLoading ? (
                  <>
                    <span className="spinner small"></span>
                    {isGitHubUrl(input) ? "Importing..." : "Searching..."}
                  </>
                ) : (
                  "Go"
                )}
              </button>
            </form>
            {inputHint && <p className="input-hint">{inputHint}</p>}
            {error && <p className="input-error">{error}</p>}
          </div>

          {/* Search Results */}
          <SearchResults
            results={searchResults}
            onImport={handleSearchImport}
            importingRepo={importingRepo}
          />

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

  // Repo view
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
