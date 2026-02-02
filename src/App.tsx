import { useState, useEffect, useCallback, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { save } from "@tauri-apps/plugin-dialog";
import * as Select from "@radix-ui/react-select";
import { FileTree } from "./components/FileTree";
import { CodeViewer, type CodeViewerHandle } from "./components/CodeViewer";
import { InterpretModal } from "./components/InterpretModal";
import { RepoList } from "./components/RepoList";
import { FileSearch } from "./components/FileSearch";
import { ContentSearch } from "./components/ContentSearch";
import { FileHistory } from "./components/FileHistory";
import { ChatSidebar } from "./components/ChatSidebar";
import { ResizableSidebar } from "./components/ResizableSidebar";
import {
  importRepoFromGithub,
  readTextFile,
  listRecentRepos,
  getRepoTree,
  deleteRepo,
  searchGithubRepos,
  getSettings,
  updateSettings,
  getTrendingRepos,
  getFavorites,
  saveFavorites,
  exportFavorites,
  openScreenshotsFolder,
  interpretCode,
  getFileHistory,
  addFileHistory,
  createGist,
  updateRepoLastOpened,
} from "./api";
import type {
  FileNode,
  RepoInfo,
  FileContent,
  SearchResultItem,
  AppSettings,
  TrendingRepo,
  FavoriteRepo,
  FileHistoryEntry,
} from "./types";
import "./App.css";

type View = "home" | "repo" | "settings";
type HomeTab = "home" | "trending" | "favorites";

// Toast component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return <div className="toast">{message}</div>;
}

function formatStars(count: number): string {
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return String(count);
}

function formatExportTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}`;
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
                  Opening...
                </>
              ) : (
                "Open"
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendingList({
  items,
  onImport,
  onFavorite,
  importingRepo,
  favoriteKeys,
}: {
  items: TrendingRepo[];
  onImport: (item: TrendingRepo) => void;
  onFavorite: (item: TrendingRepo) => void;
  importingRepo: string | null;
  favoriteKeys: Set<string>;
}) {
  if (items.length === 0) {
    return <p className="empty-state">No trending repositories found.</p>;
  }

  return (
    <div className="trending-list">
      {items.map((item) => {
        const isFavorited = favoriteKeys.has(item.full_name);
        return (
          <div key={item.full_name} className="trending-item">
            <div className="trending-item-info">
              <div className="trending-item-header">
                <span className="trending-item-name">{item.full_name}</span>
                {typeof item.stars === "number" && (
                  <span className="trending-item-stars">⭐ {formatStars(item.stars)}</span>
                )}
              </div>
              {item.description && <p className="trending-item-desc">{item.description}</p>}
              <div className="trending-item-meta">
                {item.language && <span>{item.language}</span>}
                {typeof item.forks === "number" && <span>🍴 {formatStars(item.forks)}</span>}
                {typeof item.stars_today === "number" && (
                  <span>✨ {formatStars(item.stars_today)} today</span>
                )}
              </div>
            </div>
            <div className="trending-item-actions">
              <button
                className="trending-item-import"
                onClick={() => onImport(item)}
                disabled={importingRepo === item.full_name}
              >
                {importingRepo === item.full_name ? (
                  <>
                    <span className="spinner small"></span>
                    Importing...
                  </>
                ) : (
                  "Open"
                )}
              </button>
              <button
                className={`trending-item-favorite ${isFavorited ? "favorited" : ""}`}
                onClick={() => onFavorite(item)}
                title={isFavorited ? "Already in favorites" : "Add to favorites"}
              >
                {isFavorited ? "★" : "☆"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FavoritesList({
  items,
  onOpen,
  onRemove,
}: {
  items: FavoriteRepo[];
  onOpen: (item: FavoriteRepo) => void;
  onRemove: (item: FavoriteRepo) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="empty-state favorites-empty">
        <div className="empty-icon">⭐</div>
        <h3>No favorites yet</h3>
        <p>Star repositories from Trending to keep them here.</p>
      </div>
    );
  }

  return (
    <div className="favorites-list">
      {items.map((item) => (
        <div key={`${item.owner}/${item.repo}`} className="favorites-item">
          <div className="favorites-item-info">
            <div className="favorites-item-header">
              <span className="favorites-item-name">
                {item.owner}/{item.repo}
              </span>
              {typeof item.stars === "number" && (
                <span className="favorites-item-stars">⭐ {formatStars(item.stars)}</span>
              )}
            </div>
            {item.description && <p className="favorites-item-desc">{item.description}</p>}
            <div className="favorites-item-meta">
              {item.language && <span>{item.language}</span>}
              <span>{new Date(item.added_at).toLocaleString()}</span>
            </div>
          </div>
          <div className="favorites-item-actions">
            <button className="favorites-item-open" onClick={() => onOpen(item)}>
              Open
            </button>
            <button className="favorites-item-remove" onClick={() => onRemove(item)}>
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsPage({
  settings,
  onSave,
  onBack,
  favoritesCount,
  onExport,
  exporting,
}: {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
  onBack: () => void;
  favoritesCount: number;
  onExport: (format: "json" | "markdown") => Promise<void>;
  exporting: boolean;
}) {
  const [token, setToken] = useState(settings.github_token || "");
  const [openrouterKey, setOpenrouterKey] = useState(settings.openrouter_api_key || "");
  const [interpretPrompt, setInterpretPrompt] = useState(settings.interpret_prompt || "");
  const [interpretModel, setInterpretModel] = useState(settings.interpret_model || "anthropic/claude-sonnet-4");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [openingScreenshots, setOpeningScreenshots] = useState(false);

  // Individual save states for each section
  const [savingGithub, setSavingGithub] = useState(false);
  const [savedGithub, setSavedGithub] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [savedApiKey, setSavedApiKey] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [savedModel, setSavedModel] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savedPrompt, setSavedPrompt] = useState(false);

  const saveSettings = async (updates: Partial<AppSettings>, setSaving: (v: boolean) => void, setSaved: (v: boolean) => void) => {
    setSaving(true);
    try {
      await onSave({ ...settings, ...updates });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenGitHub = async () => {
    await openUrl("https://github.com/settings/tokens/new?description=RepoRead&scopes=public_repo,gist");
  };

  const hasFavorites = favoritesCount > 0;

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
              onClick={() => saveSettings({ github_token: token || null }, setSavingGithub, setSavedGithub)}
              disabled={savingGithub}
            >
              {savingGithub ? "Saving..." : savedGithub ? "Saved ✓" : "Save"}
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h2>How to get a GitHub Token</h2>
          <ol className="token-steps">
            <li>Click the button below to open GitHub token settings</li>
            <li>Sign in to GitHub if prompted</li>
            <li>Set expiration (recommend: 90 days or longer)</li>
            <li>Under "Select scopes", check <code>public_repo</code> & <code>gist</code></li>
            <li>Click "Generate token" at the bottom</li>
            <li>Copy the token and paste it above</li>
          </ol>
          <button className="github-link-button" onClick={handleOpenGitHub}>
            Open GitHub Token Page →
          </button>
        </section>

        <section className="settings-section">
          <h2>Interpretation</h2>
          <p className="settings-desc">
            Set your <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" style={{ color: "var(--accent-color)" }}>OpenRouter API key</a> to enable the Interpret feature.
          </p>

          <div className="token-input-group" style={{ marginBottom: 16 }}>
            <input
              type="password"
              className="token-input"
              placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxx"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
            />
            <button
              className="save-button"
              onClick={() => saveSettings({ openrouter_api_key: openrouterKey || null }, setSavingApiKey, setSavedApiKey)}
              disabled={savingApiKey}
            >
              {savingApiKey ? "Saving..." : savedApiKey ? "Saved ✓" : "Save"}
            </button>
          </div>

          <p className="settings-desc" style={{ marginTop: 20 }}>
            Model (e.g. anthropic/claude-sonnet-4, openai/gpt-4o, google/gemini-2.0-flash-001)
          </p>
          <div className="token-input-group" style={{ marginBottom: 16 }}>
            <input
              type="text"
              className="token-input"
              placeholder="anthropic/claude-sonnet-4"
              value={interpretModel}
              onChange={(e) => setInterpretModel(e.target.value)}
            />
            <button
              className="save-button"
              onClick={() => saveSettings({ interpret_model: interpretModel }, setSavingModel, setSavedModel)}
              disabled={savingModel}
            >
              {savingModel ? "Saving..." : savedModel ? "Saved ✓" : "Save"}
            </button>
          </div>

          <p className="settings-desc" style={{ marginTop: 20 }}>
            Customize the prompt template. Use {"{language}"}, {"{project}"}, and {"{code}"} as placeholders.
          </p>
          <textarea
            className="prompt-textarea"
            value={interpretPrompt}
            onChange={(e) => setInterpretPrompt(e.target.value)}
            rows={5}
          />
          <button
            className="save-button"
            onClick={() => saveSettings({ interpret_prompt: interpretPrompt }, setSavingPrompt, setSavedPrompt)}
            disabled={savingPrompt}
            style={{ marginTop: 12 }}
          >
            {savingPrompt ? "Saving..." : savedPrompt ? "Saved ✓" : "Save Prompt"}
          </button>

          <div style={{ marginTop: 20 }}>
            <button
              className="github-link-button"
              onClick={async () => {
                if (!openrouterKey) {
                  setTestResult("Please enter an API key first.");
                  return;
                }
                setTesting(true);
                setTestResult(null);
                try {
                  const result = await interpretCode(
                    openrouterKey,
                    "Say 'Hello! API is working.' in one short sentence.",
                    "",
                    "",
                    "",
                    interpretModel
                  );
                  setTestResult("✓ " + result);
                } catch (err) {
                  setTestResult("✗ " + String(err));
                } finally {
                  setTesting(false);
                }
              }}
              disabled={testing}
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>
            {testResult && (
              <p style={{
                marginTop: 12,
                padding: "10px 14px",
                background: testResult.startsWith("✓") ? "rgba(78, 201, 176, 0.1)" : "rgba(241, 76, 76, 0.1)",
                border: `1px solid ${testResult.startsWith("✓") ? "var(--success-color)" : "var(--error-color)"}`,
                borderRadius: 8,
                fontSize: 13,
                color: testResult.startsWith("✓") ? "var(--success-color)" : "var(--error-color)",
              }}>
                {testResult}
              </p>
            )}
            <hr style={{ margin: "20px 0", border: "none", borderTop: "1px solid var(--border-color)" }} />
          </div>
        </section>

        <section className="settings-section">
          <h2>Export Favorites</h2>
          <p className="settings-desc">
            {hasFavorites
              ? `Download your ${favoritesCount} favorite${favoritesCount > 1 ? "s" : ""} as JSON or Markdown.`
              : "Add favorites from Trending to enable exports."}
          </p>
          <div className="export-buttons">
            <button
              className="save-button"
              onClick={() => onExport("json")}
              disabled={exporting || !hasFavorites}
            >
              Export JSON
            </button>
            <button
              className="github-link-button"
              onClick={() => onExport("markdown")}
              disabled={exporting || !hasFavorites}
            >
              Export Markdown
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h2>Screenshots</h2>
          <p className="settings-desc">
            Screenshots are saved when you use the camera button in the code viewer.
          </p>
          <div className="settings-toggle-row">
            <label className="settings-toggle-label">
              <span>Copy to clipboard automatically</span>
              <input
                type="checkbox"
                className="settings-toggle"
                checked={settings.copy_screenshot_to_clipboard}
                onChange={async (e) => {
                  const newSettings = { ...settings, copy_screenshot_to_clipboard: e.target.checked };
                  await onSave(newSettings);
                }}
              />
            </label>
          </div>
          <button
            className="github-link-button"
            onClick={async () => {
              setOpeningScreenshots(true);
              try {
                await openScreenshotsFolder();
              } catch (err) {
                console.error("Failed to open screenshots folder:", err);
              } finally {
                setOpeningScreenshots(false);
              }
            }}
            disabled={openingScreenshots}
          >
            {openingScreenshots ? "Opening..." : "Open Screenshots Folder"}
          </button>
        </section>
      </main>
    </div>
  );
}

function App() {
  const [view, setView] = useState<View>("home");
  const [homeTab, setHomeTab] = useState<HomeTab>("home");
  const [recentRepos, setRecentRepos] = useState<RepoInfo[]>([]);
  const [currentRepo, setCurrentRepo] = useState<RepoInfo | null>(null);
  const [tree, setTree] = useState<FileNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [revealRequestId, setRevealRequestId] = useState(0);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [error, setError] = useState<string>("");
  const [navState, setNavState] = useState<{ history: string[]; index: number }>({
    history: [],
    index: -1,
  });

  // Unified input state
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [importingRepo, setImportingRepo] = useState<string | null>(null);

  // Settings
  const [settings, setSettings] = useState<AppSettings>({
    github_token: null,
    copy_screenshot_to_clipboard: true,
    openrouter_api_key: null,
    interpret_prompt: "This is {language} code from the {project} project. Please interpret the following code in under 500 words:\n\n```{language}\n{code}\n```",
    interpret_model: "anthropic/claude-sonnet-4",
  });

  // Trending
  const [trendingItems, setTrendingItems] = useState<TrendingRepo[]>([]);
  const [trendingSince, setTrendingSince] = useState("daily");
  const [trendingLanguage, setTrendingLanguage] = useState("");
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState("");
  const [importingTrending, setImportingTrending] = useState<string | null>(null);

  // Top 20 popular programming languages
  const popularLanguages = [
    "Python",
    "JavaScript",
    "TypeScript",
    "Java",
    "C#",
    "C++",
    "Go",
    "Rust",
    "PHP",
    "Swift",
    "Kotlin",
    "Ruby",
    "C",
    "Scala",
    "Shell",
    "Dart",
    "R",
    "Lua",
    "Haskell",
    "Julia",
  ];

  // Favorites
  const [favorites, setFavorites] = useState<FavoriteRepo[]>([]);
  const [favoritesError, setFavoritesError] = useState("");
  const [exporting, setExporting] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Screenshot
  const [isCapturing, setIsCapturing] = useState(false);

  // Interpret
  const codeViewerRef = useRef<CodeViewerHandle>(null);
  const [interpretModalOpen, setInterpretModalOpen] = useState(false);
  const [interpretLoading, setInterpretLoading] = useState(false);
  const [interpretResult, setInterpretResult] = useState<string | null>(null);
  const [interpretError, setInterpretError] = useState<string | null>(null);

  // File Search
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [contentSearchOpen, setContentSearchOpen] = useState(false);

  // File History
  const [fileHistory, setFileHistory] = useState<FileHistoryEntry[]>([]);

  // Create Gist
  const [creatingGist, setCreatingGist] = useState(false);

  // Chat Sidebar
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [chatPinned, setChatPinned] = useState(false);

  const [pendingReveal, setPendingReveal] = useState<{ path: string; line: number } | null>(null);

  // Favorites lookup set for quick check
  const favoriteKeys = new Set(favorites.map((f) => `${f.owner}/${f.repo}`));

  // Load recent repos and settings on mount
  useEffect(() => {
    loadRecentRepos();
    loadSettings();
    loadFavorites();
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("reporead:chatPinned");
      if (saved === "true") setChatPinned(true);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("reporead:chatPinned", chatPinned ? "true" : "false");
    } catch {
      // ignore storage errors
    }
  }, [chatPinned]);

  // Keyboard shortcut for file search (Cmd+P / Ctrl+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "p" && view === "repo") {
        e.preventDefault();
        setFileSearchOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f" && view === "repo") {
        e.preventDefault();
        setContentSearchOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [view]);

  // Load file history when repo changes
  useEffect(() => {
    if (currentRepo?.url) {
      loadFileHistory(currentRepo.url);
    } else {
      setFileHistory([]);
    }
  }, [currentRepo?.url]);

  useEffect(() => {
    setNavState({ history: [], index: -1 });
    setPendingReveal(null);
  }, [currentRepo?.key]);

  const loadFileHistory = async (repoUrl: string) => {
    try {
      const history = await getFileHistory(repoUrl);
      setFileHistory(history);
    } catch (err) {
      console.error("Failed to load file history:", err);
    }
  };

  useEffect(() => {
    if (homeTab === "trending" && trendingItems.length === 0 && !trendingLoading) {
      loadTrending();
    }
  }, [homeTab]);

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

  const loadFavorites = async () => {
    try {
      const items = await getFavorites();
      setFavorites(items);
    } catch (err) {
      console.error("Failed to load favorites:", err);
    }
  };

  const loadTrending = async () => {
    setTrendingLoading(true);
    setTrendingError("");

    try {
      const items = await getTrendingRepos(
        trendingLanguage.trim() ? trendingLanguage.trim() : null,
        trendingSince,
        null
      );
      setTrendingItems(items);
    } catch (err) {
      setTrendingError(String(err));
    } finally {
      setTrendingLoading(false);
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

  const handleTrendingImport = async (item: TrendingRepo) => {
    setImportingTrending(item.full_name);
    setTrendingError("");

    try {
      const result = await importRepoFromGithub(item.url);
      setCurrentRepo(result.info);
      setTree(result.tree);
      setView("repo");
      setSelectedPath("");
      setFileContent(null);
      setInput("");
      await loadRecentRepos();
    } catch (err) {
      setTrendingError(String(err));
    } finally {
      setImportingTrending(null);
    }
  };

  const handleFavoriteOpen = async (item: FavoriteRepo) => {
    setFavoritesError("");

    try {
      const result = await importRepoFromGithub(item.url);
      setCurrentRepo(result.info);
      setTree(result.tree);
      setView("repo");
      setSelectedPath("");
      setFileContent(null);
      setInput("");
      await loadRecentRepos();
    } catch (err) {
      setFavoritesError(String(err));
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
      // Update last opened time and refresh list
      await updateRepoLastOpened(repo.key);
      await loadRecentRepos();
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

  const openFile = useCallback(
    async (path: string, recordHistory = true) => {
      if (!currentRepo || !path) return;

      setSelectedPath(path);
      setIsLoadingFile(true);

      try {
        const content = await readTextFile(currentRepo.key, path);
        setFileContent(content);

        // Add to file history
        if (currentRepo.url) {
          await addFileHistory(currentRepo.url, path);
          // Refresh history
          const history = await getFileHistory(currentRepo.url);
          setFileHistory(history);
        }
      } catch (err) {
        setError(String(err));
        setFileContent(null);
      } finally {
        setIsLoadingFile(false);
      }

      if (recordHistory) {
        setNavState((prev) => {
          const trimmed = prev.history.slice(0, prev.index + 1);
          if (trimmed[trimmed.length - 1] === path) {
            return { history: trimmed, index: trimmed.length - 1 };
          }
          return { history: [...trimmed, path], index: trimmed.length };
        });
      }
    },
    [currentRepo]
  );

  const handleFileSelect = useCallback(
    async (path: string) => {
      await openFile(path, true);
    },
    [openFile]
  );

  const handleContentResultSelect = useCallback(
    async (path: string, line: number) => {
      await openFile(path, true);
      setPendingReveal({ path, line });
    },
    [openFile]
  );

  const readFileContentForSearch = useCallback(
    async (path: string) => {
      if (!currentRepo) throw new Error("No repo loaded");
      return readTextFile(currentRepo.key, path);
    },
    [currentRepo]
  );

  const handleRevealInTree = useCallback(() => {
    if (!selectedPath) return;
    setRevealRequestId((prev) => prev + 1);
  }, [selectedPath]);

  const handleNavigateBack = useCallback(() => {
    if (navState.index <= 0) return;
    const nextIndex = navState.index - 1;
    const path = navState.history[nextIndex];
    setNavState((prev) => ({ ...prev, index: nextIndex }));
    void openFile(path, false);
  }, [navState, openFile]);

  const handleNavigateForward = useCallback(() => {
    if (navState.index < 0 || navState.index >= navState.history.length - 1) return;
    const nextIndex = navState.index + 1;
    const path = navState.history[nextIndex];
    setNavState((prev) => ({ ...prev, index: nextIndex }));
    void openFile(path, false);
  }, [navState, openFile]);

  const handleBack = () => {
    setView("home");
    setCurrentRepo(null);
    setTree(null);
    setFileContent(null);
    setSelectedPath("");
    setError("");
    setPendingReveal(null);
  };

  const handleSaveSettings = async (newSettings: AppSettings) => {
    await updateSettings(newSettings);
    setSettings(newSettings);
  };

  const handleInterpret = async () => {
    if (!settings.openrouter_api_key) {
      setInterpretError("Please set your OpenRouter API key in Settings first.");
      setInterpretModalOpen(true);
      return;
    }

    const selectedText = codeViewerRef.current?.getSelectedText() || "";
    if (!selectedText.trim()) {
      setInterpretError("Please select some code first.");
      setInterpretModalOpen(true);
      return;
    }

    setInterpretResult(null);
    setInterpretError(null);
    setInterpretLoading(true);
    setInterpretModalOpen(true);

    try {
      const language = fileContent?.language || "unknown";
      const project = currentRepo ? `${currentRepo.owner}/${currentRepo.repo}` : "unknown";
      const result = await interpretCode(
        settings.openrouter_api_key,
        settings.interpret_prompt,
        selectedText,
        language,
        project,
        settings.interpret_model
      );
      setInterpretResult(result);
    } catch (err) {
      setInterpretError(String(err));
    } finally {
      setInterpretLoading(false);
    }
  };

  const handleCreateGist = async () => {
    if (!settings.github_token) {
      setToastMessage("Please set GitHub token in Settings first");
      return;
    }

    const selectedText = codeViewerRef.current?.getSelectedText() || "";
    if (!selectedText.trim()) {
      setToastMessage("Please select some code first");
      return;
    }

    setCreatingGist(true);

    try {
      const filename = selectedPath ? selectedPath.split("/").pop() || "snippet.txt" : "snippet.txt";
      const project = currentRepo ? `${currentRepo.owner}/${currentRepo.repo}` : "RepoRead";
      const description = `Code snippet from ${project}`;

      const result = await createGist(
        settings.github_token,
        filename,
        selectedText,
        description,
        false // private gist
      );

      // Open the gist URL in browser
      await openUrl(result.html_url);
      setToastMessage("Gist created successfully");
    } catch (err) {
      setToastMessage(`Failed to create gist: ${String(err)}`);
    } finally {
      setCreatingGist(false);
    }
  };

  const handleAddFavorite = async (item: TrendingRepo) => {
    setFavoritesError("");
    const exists = favorites.some(
      (fav) => fav.owner === item.owner && fav.repo === item.repo
    );
    if (exists) {
      setToastMessage("Already in favorites");
      return;
    }

    const next: FavoriteRepo[] = [
      {
        owner: item.owner,
        repo: item.repo,
        url: item.url,
        description: item.description ?? null,
        language: item.language ?? null,
        stars: typeof item.stars === "number" ? item.stars : null,
        added_at: new Date().toISOString(),
      },
      ...favorites,
    ];

    try {
      await saveFavorites(next);
      setFavorites(next);
      setToastMessage("Added to favorites");
    } catch (err) {
      setFavoritesError(String(err));
    }
  };

  const handleRemoveFavorite = async (item: FavoriteRepo) => {
    setFavoritesError("");
    const next = favorites.filter(
      (fav) => !(fav.owner === item.owner && fav.repo === item.repo)
    );
    try {
      await saveFavorites(next);
      setFavorites(next);
    } catch (err) {
      setFavoritesError(String(err));
    }
  };

  const handleExportFavorites = async (format: "json" | "markdown") => {
    if (exporting) return;
    setFavoritesError("");
    setExporting(true);

    try {
      const timestamp = formatExportTimestamp(new Date());
      const extension = format === "json" ? "json" : "md";
      const defaultPath = `reporead-favorites-${timestamp}.${extension}`;
      const path = await save({
        defaultPath,
        filters: [
          {
            name: format === "json" ? "JSON" : "Markdown",
            extensions: [extension],
          },
        ],
      });

      if (!path) return;
      await exportFavorites(format, path);
    } catch (err) {
      setFavoritesError(String(err));
    } finally {
      setExporting(false);
    }
  };

  // Settings view
  if (view === "settings") {
    return (
      <SettingsPage
        settings={settings}
        onSave={handleSaveSettings}
        onBack={() => setView("home")}
        favoritesCount={favorites.length}
        onExport={handleExportFavorites}
        exporting={exporting}
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

    const renderHomeContent = () => {
      if (homeTab === "home") {
        return (
          <>
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
          </>
        );
      }

      if (homeTab === "trending") {
        const timeframeLabels: Record<string, string> = {
          daily: "Today",
          weekly: "This Week",
          monthly: "This Month",
        };

        return (
          <div className="trending-view">
            <div className="trending-header">
              <div className="trending-header-left">
                <h3>GitHub Trending</h3>
                <p>Explore what's popular and open repositories instantly.</p>
              </div>
              <div className="trending-header-controls">
                <Select.Root
                  value={trendingLanguage || "all"}
                  onValueChange={(val) => setTrendingLanguage(val === "all" ? "" : val)}
                >
                  <Select.Trigger className="SelectTrigger">
                    <Select.Value placeholder="All Languages" />
                    <Select.Icon className="SelectIcon">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="SelectContent" position="popper" sideOffset={4}>
                      <Select.Viewport className="SelectViewport">
                        <Select.Item value="all" className="SelectItem">
                          <Select.ItemText>All Languages</Select.ItemText>
                        </Select.Item>
                        <Select.Separator className="SelectSeparator" />
                        {popularLanguages.map((lang) => (
                          <Select.Item key={lang} value={lang} className="SelectItem">
                            <Select.ItemText>{lang}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>

                <Select.Root value={trendingSince} onValueChange={setTrendingSince}>
                  <Select.Trigger className="SelectTrigger">
                    <Select.Value>{timeframeLabels[trendingSince]}</Select.Value>
                    <Select.Icon className="SelectIcon">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="SelectContent" position="popper" sideOffset={4}>
                      <Select.Viewport className="SelectViewport">
                        <Select.Item value="daily" className="SelectItem">
                          <Select.ItemText>Today</Select.ItemText>
                        </Select.Item>
                        <Select.Item value="weekly" className="SelectItem">
                          <Select.ItemText>This Week</Select.ItemText>
                        </Select.Item>
                        <Select.Item value="monthly" className="SelectItem">
                          <Select.ItemText>This Month</Select.ItemText>
                        </Select.Item>
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>

                <button
                  className="trending-refresh"
                  onClick={loadTrending}
                  disabled={trendingLoading}
                >
                  {trendingLoading ? "..." : "↻"}
                </button>
              </div>
            </div>
            {trendingError && <p className="input-error">{trendingError}</p>}
            {trendingLoading ? (
              <p className="loading-state">Loading trending repositories...</p>
            ) : (
              <TrendingList
                items={trendingItems.slice(0, 20)}
                onImport={handleTrendingImport}
                onFavorite={handleAddFavorite}
                importingRepo={importingTrending}
                favoriteKeys={favoriteKeys}
              />
            )}
          </div>
        );
      }

      return (
        <div className="favorites-view">
          {favoritesError && <p className="input-error">{favoritesError}</p>}
          <FavoritesList
            items={favorites}
            onOpen={handleFavoriteOpen}
            onRemove={handleRemoveFavorite}
          />
        </div>
      );
    };

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
            <h1>RepoRead</h1>
          </div>
          <p className="tagline">Read GitHub repositories. No clone. No setup. Just code.</p>
        </header>

        <main className="home-content">
          <div className="home-tabs">
            <button
              className={`home-tab ${homeTab === "home" ? "active" : ""}`}
              onClick={() => setHomeTab("home")}
            >
              Home
            </button>
            <button
              className={`home-tab ${homeTab === "trending" ? "active" : ""}`}
              onClick={() => setHomeTab("trending")}
            >
              Trending
            </button>
            <button
              className={`home-tab ${homeTab === "favorites" ? "active" : ""}`}
              onClick={() => setHomeTab("favorites")}
            >
              Favorites
            </button>
          </div>

          {renderHomeContent()}
        </main>

        {toastMessage && (
          <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
        )}
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
        <div className="repo-header-actions">
          <button
            className="toolbar-button"
            onClick={() => setContentSearchOpen(true)}
            title="Find in files (⌘⇧F)"
          >
            🔎 Find Content
          </button>
          <button
            className="toolbar-button"
            onClick={() => setFileSearchOpen(true)}
            title="Quick open file (⌘P)"
          >
            🔍 Find File
          </button>
          <FileHistory history={fileHistory} onFileSelect={handleFileSelect} />
          <button
            className="toolbar-button"
            onClick={handleInterpret}
            disabled={!fileContent || fileContent.is_binary}
            title="Interpret selected code"
          >
            💡 Interpret
          </button>
          <button
            className="toolbar-button"
            onClick={handleCreateGist}
            disabled={!fileContent || fileContent.is_binary || creatingGist}
            title="Create GitHub Gist from selected code"
          >
            {creatingGist ? "Creating..." : "📋 Create Gist"}
          </button>
          <button
            className="toolbar-button"
            onClick={() => setIsCapturing(true)}
            disabled={!fileContent || fileContent.is_binary}
            title="Take screenshot"
          >
            📷 Screenshot
          </button>
          <button
            className="toolbar-button chat-toggle-btn"
            onClick={() => {
              setSelectedText(codeViewerRef.current?.getSelectedText() || "");
              setChatOpen(!chatOpen);
            }}
            title="Chat about this code"
          >
            💬 Chat
          </button>
        </div>
      </header>

      <div className="repo-content">
        <ResizableSidebar>
          {tree && (
            <FileTree
              tree={tree}
              onFileSelect={handleFileSelect}
              selectedPath={selectedPath}
              revealPath={selectedPath}
              revealRequestId={revealRequestId}
              onNavigateBack={handleNavigateBack}
              onNavigateForward={handleNavigateForward}
              canNavigateBack={navState.index > 0}
              canNavigateForward={
                navState.index >= 0 && navState.index < navState.history.length - 1
              }
            />
          )}
        </ResizableSidebar>

        <main className="main-content">
          <CodeViewer
            ref={codeViewerRef}
            content={fileContent}
            filePath={selectedPath}
            isLoading={isLoadingFile}
            repoInfo={currentRepo}
            onRevealInTree={handleRevealInTree}
            revealLine={pendingReveal?.path === selectedPath ? pendingReveal.line : undefined}
            onRevealComplete={() => setPendingReveal(null)}
            copyScreenshotToClipboard={settings.copy_screenshot_to_clipboard}
            isCapturing={isCapturing}
            onCaptureComplete={() => setIsCapturing(false)}
            onScreenshotSaved={(copied) => setToastMessage(
              copied ? "Screenshot saved & copied" : "Screenshot saved"
            )}
          />
        </main>

        {chatOpen && chatPinned && (
          <ChatSidebar
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
            pinned
            onTogglePin={() => setChatPinned(false)}
            filePath={selectedPath}
            fileContent={fileContent}
            repoInfo={currentRepo}
            selectedText={selectedText}
            apiKey={settings.openrouter_api_key}
            model={settings.interpret_model}
          />
        )}
      </div>

      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}

      <InterpretModal
        isOpen={interpretModalOpen}
        isLoading={interpretLoading}
        result={interpretResult}
        error={interpretError}
        onClose={() => {
          setInterpretModalOpen(false);
          setInterpretResult(null);
          setInterpretError(null);
        }}
      />

      <FileSearch
        isOpen={fileSearchOpen}
        onClose={() => setFileSearchOpen(false)}
        tree={tree}
        onFileSelect={handleFileSelect}
      />

      <ContentSearch
        isOpen={contentSearchOpen}
        onClose={() => setContentSearchOpen(false)}
        tree={tree}
        readFileContent={readFileContentForSearch}
        onResultSelect={handleContentResultSelect}
      />

      <ChatSidebar
        isOpen={chatOpen && !chatPinned}
        onClose={() => setChatOpen(false)}
        pinned={false}
        onTogglePin={() => {
          setChatPinned(true);
          setChatOpen(true);
        }}
        filePath={selectedPath}
        fileContent={fileContent}
        repoInfo={currentRepo}
        selectedText={selectedText}
        apiKey={settings.openrouter_api_key}
        model={settings.interpret_model}
      />
    </div>
  );
}

export default App;
