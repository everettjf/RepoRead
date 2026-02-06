# Development

This guide covers local development, contribution workflow, and Homebrew release steps.

## Prerequisites

- Rust (rustup)
- Bun
- macOS for building and testing the `.dmg` bundle

## Setup

```bash
git clone https://github.com/everettjf/RepoRead.git
cd RepoRead
bun install
```

## Run

```bash
# Tauri app (frontend + Rust backend)
bun run tauri dev

# Frontend only
bun run dev
```

## Build

```bash
# Production build (outputs .dmg to src-tauri/target/release/bundle/dmg/)
bun run tauri build
```

## Contributing

1. Fork the repo and create a feature branch.
2. Make changes with existing formatting (2-space indentation, double quotes).
3. Run the app locally to verify behavior.
4. Open a PR with a short summary and screenshots/GIFs for UI changes.

## Homebrew Release (Cask)

Tap repo: `https://github.com/everettjf/homebrew-tap`  
Cask: `Casks/reporead.rb`

1) Bump patch version:
```bash
./inc_patch_version.sh
```

2) Build `.dmg`:
```bash
bun run tauri build
```

3) Create GitHub release and upload the `.dmg`.

4) Compute SHA256 for the uploaded `.dmg`:
```bash
shasum -a 256 path/to/RepoRead.dmg
```

5) Update the cask in `homebrew-tap`:
```ruby
cask "reporead" do
  version "x.y.z"
  sha256 "PUT_SHA256_HERE"

  url "https://github.com/everettjf/RepoRead/releases/download/v#{version}/RepoRead.dmg"
  name "RepoRead"
  desc "Read GitHub repositories. No clone. No setup. Just code."
  homepage "https://github.com/everettjf/RepoRead"

  app "RepoRead.app"
end
```

6) Commit and push in the tap repo:
```bash
git add Casks/reporead.rb
git commit -m "bump reporead to x.y.z"
git push
```
