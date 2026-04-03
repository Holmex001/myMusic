# My Music

A static web music player designed for GitHub Pages, with paired original and cover tracks.

## How It Works

Put original tracks into `audio/originals/` and cover tracks into `audio/covers/`. Use the same filename for the same song on both sides. On a normal GitHub Pages URL such as `https://username.github.io/repo/`, the player reads both repository folders through the GitHub API, pairs matching files automatically, and builds the playlist without editing `audio/playlist.json` for deployed usage.

Supported formats include `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac`, and `.mp4`.

## Audio Strategy

Use a two-tier workflow for sound quality and playback smoothness:

- Keep archival masters outside the web playback path in a local `audio-masters/` folder that is ignored by git.
- Put only web playback versions into `audio/originals/` and `audio/covers/`.
- Use the same base filename for the same song on both sides so the player can pair them automatically.

Recommended web playback formats:

- `AAC (.m4a) 256 kbps` for the best quality-to-size balance
- `MP3 320 kbps` if you prefer maximum browser compatibility and simpler tooling

Example FFmpeg commands:

```powershell
ffmpeg -i "audio-masters/originals/song.flac" -c:a aac -b:a 256k -movflags +faststart "audio/originals/song.m4a"
ffmpeg -i "audio-masters/covers/song.wav" -c:a libmp3lame -b:a 320k "audio/covers/song.mp3"
```

`-movflags +faststart` is recommended for `.m4a` files so metadata is moved to the front of the file and web playback starts faster.

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
