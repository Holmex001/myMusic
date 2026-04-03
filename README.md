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

## Auto Push From Local Folder

Start the watcher once:

```powershell
./scripts/watch-and-publish.ps1
```

or double-click `start-auto-publish.cmd`.

After that, when you add, remove, or rename supported audio files in `audio/originals/` or `audio/covers/`, the script will automatically rebuild `audio/playlist.json`, run `git add`, create a commit, and push to GitHub.

Keep that terminal window open while auto-publish is enabled.

GitHub rejects files larger than 100 MB, so oversized tracks will be reported and skipped until you compress or replace them.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. Open `Settings > Pages`.
3. Choose `Deploy from a branch`.
4. Select branch `main` and folder `/ (root)`.
5. Wait for the site to publish.

After that, adding or removing files in `audio/originals/` or `audio/covers/` and pushing the change is enough for the playlist to update on the live site.

## Custom Domain Note

Automatic repository detection works best on standard `github.io` addresses. If you later bind a custom domain, fill in the `github-owner` and `github-repo` meta tags in `index.html` so the player still knows which repository folders to scan. You can also override the folder paths with `github-original-audio-path` and `github-cover-audio-path`.
