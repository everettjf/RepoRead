# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RepoView is a Tauri desktop application for browsing GitHub repositories without cloning. Built for iPad/tablet use with the tagline: "Read GitHub repositories. No clone. No setup. Just code."

## Development Commands

```bash
# Start development (frontend + Tauri backend)
bun run tauri dev

# Build production app
bun run build
bun run tauri build

# Frontend only (without Tauri)
bun run dev
```

## Architecture

**Two-layer Tauri desktop app:**

- **Frontend** (`/src`) - React 19 + TypeScript + Vite SPA, uses Monaco Editor for code viewing
- **Backend** (`/src-tauri/src`) - Rust business logic handling GitHub API, ZIP extraction, file caching

**Data Flow:**
1. User inputs GitHub URL → Frontend calls Tauri command via IPC
2. Backend downloads repo as ZIP → extracts → builds file tree → caches locally
3. Frontend displays tree and reads files on-demand via backend commands

## Key Files

| Frontend | Purpose |
|----------|---------|
| `src/App.tsx` | Main orchestrator, manages view state (home/repo) |
| `src/api.ts` | Tauri IPC function wrappers |
| `src/types.ts` | Shared TypeScript interfaces |
| `src/components/FileTree.tsx` | Recursive tree navigator with emoji icons |
| `src/components/CodeViewer.tsx` | Lazy-loaded Monaco Editor wrapper |

| Backend | Purpose |
|---------|---------|
| `src-tauri/src/lib.rs` | Tauri command handlers (7 commands exposed via IPC) |
| `src-tauri/src/repo.rs` | Core business logic: GitHub fetch, ZIP extraction, file tree building (~430 lines) |

## Tauri IPC Commands

Defined in `lib.rs`, called from `api.ts`:

- `import_repo_from_github(url)` - Parse URL → fetch default branch → download ZIP → extract → cache
- `read_text_file(repo_key, file_path)` - Read with truncation (3MB/50k line limits)
- `list_recent_repos()` - List cached repos sorted by import date
- `get_repo_tree(repo_key)` / `get_repo_info(repo_key)` - Return cached metadata
- `delete_repo(repo_key)` - Remove from cache
- `get_file_language(file_path)` - Detect language by extension for syntax highlighting

## Data Storage

Repos cached at OS-specific data directory:
- macOS: `~/Library/Application Support/com.xnu.RepoView/repos/`
- Linux: `~/.local/share/RepoView/data/repos/`
- Windows: `%APPDATA%/RepoView/data/repos/`

Per-repo structure:
```
repos/owner_repo/
├── _meta/
│   ├── info.json   # Repo metadata
│   └── tree.json   # File tree structure
└── [repo files]
```

## Conventions

- **Error handling:** Rust uses `thiserror` with custom `RepoError` enum serializable for IPC
- **File icons:** Emoji based on extension in `FileTree.tsx`
- **Language detection:** Extension → Monaco language ID mapping in `repo.rs`
- **Large files:** Truncated at 3MB/50k lines, shows first 1k lines with warning badge
- **Hidden files:** Filtered out (`.`, `node_modules`, `__pycache__`, `_meta`)
