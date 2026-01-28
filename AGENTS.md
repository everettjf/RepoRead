# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the React 19 + TypeScript frontend. Entry points are `src/main.tsx` and `src/App.tsx`; shared types live in `src/types.ts`; IPC wrappers are in `src/api.ts`.
- `src/components/` holds UI building blocks such as `FileTree.tsx`, `CodeViewer.tsx`, `RepoList.tsx`, and `UrlInput.tsx`.
- `src-tauri/` contains the Rust backend and Tauri config. Core logic lives in `src-tauri/src/lib.rs` (commands) and `src-tauri/src/repo.rs` (GitHub fetch, ZIP extraction, tree building).
- Static assets live in `public/` and `src/assets/`. Built artifacts are in `dist/`.

## Build, Test, and Development Commands
- `bun run dev`: start the Vite frontend only.
- `bun run tauri dev`: start the full Tauri app (frontend + Rust backend).
- `bun run build`: type-check and build the frontend (`tsc && vite build`).
- `bun run tauri build`: produce a production Tauri build.

## Coding Style & Naming Conventions
- TypeScript/React uses 2-space indentation and double quotes (see `src/App.tsx`).
- Components are PascalCase (`CodeViewer.tsx`, `FileTree.tsx`).
- No JS/TS formatter or linter is configured in `package.json`; keep formatting consistent with existing files.
- Rust follows standard `cargo fmt`/`rustfmt` defaults unless a local config is introduced.

## Testing Guidelines
- No automated test framework is present in this repo. If you add tests, document the runner and conventions in this file and update scripts accordingly.

## Commit & Pull Request Guidelines
- Recent commit messages are short and informal (e.g., “refactor”, “good for search”). There is no enforced convention.
- For PRs, include: a brief summary, key UI changes (screenshots or GIFs when applicable), and any Tauri/Rust changes or migration notes.

## Architecture Overview
- Tauri IPC commands are defined in `src-tauri/src/lib.rs` and called from `src/api.ts`.
- Data is cached per-repo under the Tauri data directory (see `src-tauri/src/repo.rs` for paths and metadata files).
