# Repository Guidelines

## Project Structure & Module Organization
This repository is a static GitHub Pages music player. Keep the layout simple and file-based:

- `index.html` contains the single-page shell
- `styles.css` contains theme, layout, and responsive rules
- `script.js` contains playlist loading and playback behavior
- `audio/tracks/` stores committed audio files
- `audio/playlist.json` is an optional local fallback manifest
- `scripts/build-playlist.ps1` rebuilds the fallback manifest from the audio folder
- `scripts/watch-and-publish.ps1` watches `audio/tracks/` and auto-pushes audio updates

Keep asset paths relative so the site works from the repository root on GitHub Pages.

## Build, Test, and Development Commands
There is no required build step. Use these commands during development:

- `./scripts/build-playlist.ps1` scans `audio/tracks/` and regenerates the fallback `audio/playlist.json`
- `./scripts/watch-and-publish.ps1` monitors `audio/tracks/` and pushes audio changes automatically
- `python -m http.server 8080` serves the site locally at `http://localhost:8080`
- `git diff` reviews final HTML, CSS, JS, and manifest changes

If additional tooling is added later, keep it optional unless the project moves beyond static hosting.

## Coding Style & Naming Conventions
Use 2-space indentation in HTML, CSS, and JavaScript. Prefer descriptive names and keep files focused.

- Use `camelCase` for JavaScript variables and functions
- Use `kebab-case` for asset filenames such as `night-drive.mp3`
- Keep CSS class names readable and grouped by component

## Testing Guidelines
There is no automated test suite yet. Before opening a PR:

- Run the site locally with a static server
- Verify GitHub Pages auto-discovery after adding or renaming audio files
- If using local fallback, verify `audio/playlist.json` generation
- Check playback, seek, next/previous, shuffle, repeat, and mobile layout manually

## Commit & Pull Request Guidelines
Use short, imperative commit messages such as `Add playlist generator`. Keep commits focused and reference issues when applicable.

Pull requests should include a short summary, local verification notes, and screenshots when the UI changes.

## Agent-Specific Notes
Preserve the static-site approach, keep GitHub Pages auto-discovery working, and update this guide whenever the deployment workflow or file layout changes.
