# My Music

A static web music player designed for GitHub Pages.

## How It Works

Put audio files directly into `audio/tracks/`. On a normal GitHub Pages URL such as `https://username.github.io/repo/`, the player reads the repository folder through the GitHub API and builds the playlist automatically. You do not need to edit `audio/playlist.json` for deployed usage.

Supported formats include `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, and `.aac`.

## Local Preview

Serve the repository root with a static server:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

For local preview, the player can still fall back to `audio/playlist.json`. If you want that fallback to match the folder contents, run:

```powershell
./scripts/build-playlist.ps1
```

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. Open `Settings > Pages`.
3. Choose `Deploy from a branch`.
4. Select branch `main` and folder `/ (root)`.
5. Wait for the site to publish.

After that, adding or removing files in `audio/tracks/` and pushing the change is enough for the playlist to update on the live site.

## Custom Domain Note

Automatic repository detection works best on standard `github.io` addresses. If you later bind a custom domain, fill in the `github-owner` and `github-repo` meta tags in `index.html` so the player still knows which repository folder to scan.
