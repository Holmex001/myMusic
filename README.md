# My Music

A static web music player designed for GitHub Pages, with paired original and cover tracks.

## How It Works

Put original tracks into `audio/originals/` and cover tracks into `audio/covers/`. Use the same filename for the same song on both sides. On a normal GitHub Pages URL such as `https://username.github.io/repo/`, the player reads both repository folders through the GitHub API, pairs matching files automatically, and builds the playlist without editing `audio/playlist.json` for deployed usage.

Supported formats include `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac`, and `.mp4`.

## Local Preview

Serve the repository root with a static server:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

For local preview, the player can still fall back to `audio/playlist.json`. If you want that fallback to match the paired folder contents, run:

```powershell
./scripts/build-playlist.ps1
```

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. Open `Settings > Pages`.
3. Choose `Deploy from a branch`.
4. Select branch `main` and folder `/ (root)`.
5. Wait for the site to publish.

After that, adding or removing files in `audio/originals/` or `audio/covers/`, regenerating `audio/playlist.json` if you use the local fallback, and pushing the change yourself is enough for the playlist to update on the live site.

## Custom Domain Note

Automatic repository detection works best on standard `github.io` addresses. If you later bind a custom domain, fill in the `github-owner` and `github-repo` meta tags in `index.html` so the player still knows which repository folders to scan. You can also override the folder paths with `github-original-audio-path` and `github-cover-audio-path`.
