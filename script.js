const audio = document.querySelector("#audio-player");
const playButton = document.querySelector("#play-button");
const prevButton = document.querySelector("#prev-button");
const nextButton = document.querySelector("#next-button");
const shuffleButton = document.querySelector("#shuffle-button");
const repeatButton = document.querySelector("#repeat-button");
const autoplayButton = document.querySelector("#autoplay-button");
const seekBar = document.querySelector("#seek-bar");
const volumeBar = document.querySelector("#volume-bar");
const titleElement = document.querySelector("#track-title");
const artistElement = document.querySelector("#track-artist");
const albumElement = document.querySelector("#track-album");
const currentTimeElement = document.querySelector("#current-time");
const totalTimeElement = document.querySelector("#total-time");
const playlistElement = document.querySelector("#playlist");
const playlistEmptyElement = document.querySelector("#playlist-empty");
const trackCountElement = document.querySelector("#track-count");
const sourceNoteElement = document.querySelector("#playlist-source");
const pageShell = document.querySelector(".page-shell");

const AUDIO_FOLDER = "audio/tracks";
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".mp4"]);
const DEFAULT_ARTIST = "未知艺术家";
const DEFAULT_ALBUM = document.title.trim() || "我的音乐";

let tracks = [];
let currentIndex = 0;
let isShuffleEnabled = false;
let isRepeatEnabled = false;
let isAutoplayEnabled = false;

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readMetaContent(name) {
  return document.querySelector(`meta[name="${name}"]`)?.content.trim() || "";
}

function encodePath(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function joinUrlParts(...parts) {
  const cleaned = parts
    .filter(Boolean)
    .map((part, index) => {
      if (index === 0) {
        return part.replace(/\/+$/g, "");
      }

      return part.replace(/^\/+|\/+$/g, "");
    })
    .filter(Boolean);

  const joined = cleaned.join("/");
  return joined.startsWith("/") ? joined : `/${joined}`;
}

function filenameToTitle(filename) {
  const nameWithoutExtension = filename.replace(/\.[^.]+$/, "");
  const decodedName = safeDecodeURIComponent(nameWithoutExtension).replace(/[-_]+/g, " ").trim();

  return decodedName || "未命名曲目";
}

function getFilenameFromSource(src) {
  const cleanSource = String(src || "").split(/[?#]/, 1)[0];
  return cleanSource.split("/").filter(Boolean).pop() || "";
}

function normalizeTrack(track, fallback = {}) {
  const source = String(track?.src || fallback.src || "");
  const filename = fallback.filename || getFilenameFromSource(source);
  const title = String(track?.title || fallback.title || filenameToTitle(filename)).trim();
  const artist = String(track?.artist || fallback.artist || DEFAULT_ARTIST).trim();
  const album = String(track?.album || fallback.album || DEFAULT_ALBUM).trim();
  const duration = String(track?.duration || fallback.duration || "").trim();

  return {
    title: title || filenameToTitle(filename),
    artist: artist || DEFAULT_ARTIST,
    album: album || DEFAULT_ALBUM,
    src: source,
    duration
  };
}

function getGitHubContext() {
  const ownerOverride = readMetaContent("github-owner");
  const repoOverride = readMetaContent("github-repo");
  const branch = readMetaContent("github-branch") || "main";
  const audioPath = readMetaContent("github-audio-path") || AUDIO_FOLDER;

  if (ownerOverride && repoOverride) {
    return {
      owner: ownerOverride,
      repo: repoOverride,
      branch,
      audioPath,
      basePath: ""
    };
  }

  const host = window.location.hostname.toLowerCase();

  if (!host.endsWith(".github.io")) {
    return null;
  }

  const owner = host.split(".")[0];
  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const firstSegment = pathSegments[0];
  const looksLikeFile = firstSegment?.includes(".") ?? false;
  const repo = firstSegment && !looksLikeFile ? firstSegment : `${owner}.github.io`;
  const basePath = repo === `${owner}.github.io` ? "" : `/${repo}`;

  return {
    owner,
    repo,
    branch,
    audioPath,
    basePath
  };
}

function updateSourceNote(message) {
  sourceNoteElement.textContent = message;
}

function updateActiveTrack() {
  const items = playlistElement.querySelectorAll(".playlist-item");

  items.forEach((item, index) => {
    item.classList.toggle("active", index === currentIndex);
  });
}

function updateTrackInfo(track) {
  if (!track) {
    titleElement.textContent = "准备加载";
    artistElement.textContent = "请将音频文件放入 audio/tracks";
    albumElement.textContent = "播放列表";
    return;
  }

  titleElement.textContent = track.title;
  artistElement.textContent = track.artist || DEFAULT_ARTIST;
  albumElement.textContent = track.album || DEFAULT_ALBUM;
}

function loadTrack(index, { autoplay = false } = {}) {
  if (!tracks.length) {
    updateTrackInfo(null);
    audio.removeAttribute("src");
    audio.load();
    syncPlayState();
    return;
  }

  currentIndex = (index + tracks.length) % tracks.length;
  const track = tracks[currentIndex];
  audio.src = track.src;
  audio.load();

  updateTrackInfo(track);
  currentTimeElement.textContent = "0:00";
  totalTimeElement.textContent = track.duration || "--:--";
  seekBar.value = 0;
  updateActiveTrack();

  if (!autoplay) {
    syncPlayState();
    return;
  }

  audio
    .play()
    .then(() => {
      syncPlayState();
    })
    .catch(() => {
      syncPlayState();
    });
}

function syncPlayState() {
  const isPlaying = !audio.paused && !audio.ended;
  playButton.textContent = isPlaying ? "暂停" : "播放";
  playButton.setAttribute("aria-label", isPlaying ? "暂停" : "播放");
  pageShell.classList.toggle("is-playing", isPlaying);
}

function renderPlaylist() {
  playlistElement.innerHTML = "";
  trackCountElement.textContent = `${tracks.length} 首`;
  playlistEmptyElement.hidden = tracks.length > 0;

  tracks.forEach((track, index) => {
    const item = document.createElement("li");
    item.className = "playlist-item";

    const button = document.createElement("button");
    button.className = "playlist-button";
    button.type = "button";
    button.addEventListener("click", () => {
      loadTrack(index, { autoplay: true });
    });

    const meta = document.createElement("div");
    meta.className = "track-meta";
    meta.innerHTML = `
      <strong>${track.title}</strong>
      <span>${track.artist || DEFAULT_ARTIST}</span>
    `;

    button.appendChild(meta);

    const indexBadge = document.createElement("span");
    indexBadge.className = "track-index";
    indexBadge.textContent = String(index + 1).padStart(2, "0");

    const duration = document.createElement("span");
    duration.className = "track-time";
    duration.textContent = track.duration || "--:--";

    item.append(indexBadge, button, duration);
    playlistElement.appendChild(item);
  });

  updateActiveTrack();
}

function getNextIndex() {
  if (!tracks.length) {
    return 0;
  }

  if (isShuffleEnabled && tracks.length > 1) {
    let randomIndex = currentIndex;

    while (randomIndex === currentIndex) {
      randomIndex = Math.floor(Math.random() * tracks.length);
    }

    return randomIndex;
  }

  return (currentIndex + 1) % tracks.length;
}

function getPreviousIndex() {
  if (!tracks.length) {
    return 0;
  }

  return (currentIndex - 1 + tracks.length) % tracks.length;
}

async function loadTracksFromGitHub() {
  const context = getGitHubContext();

  if (!context) {
    throw new Error("GitHub repository context is unavailable.");
  }

  const apiUrl = `https://api.github.com/repos/${context.owner}/${context.repo}/contents/${encodePath(
    context.audioPath
  )}?ref=${encodeURIComponent(context.branch)}`;
  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status}`);
  }

  const items = await response.json();

  if (!Array.isArray(items)) {
    throw new Error("Unexpected GitHub API payload.");
  }

  return items
    .filter((item) => item.type === "file")
    .filter((item) => AUDIO_EXTENSIONS.has(item.name.slice(item.name.lastIndexOf(".")).toLowerCase()))
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .map((item) => {
      const relativeSource = joinUrlParts(context.basePath, context.audioPath, encodeURIComponent(item.name));

      return normalizeTrack(
        {
          src: relativeSource
        },
        {
          filename: item.name
        }
      );
    });
}

async function loadTracksFromManifest() {
  const response = await fetch("./audio/playlist.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Playlist request failed: ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data.tracks) ? data.tracks.map((track) => normalizeTrack(track)) : [];
}

async function loadPlaylist() {
  try {
    tracks = await loadTracksFromGitHub();
    updateSourceNote("已从 GitHub 仓库的音频目录自动加载。");
  } catch (githubError) {
    try {
      tracks = await loadTracksFromManifest();
      updateSourceNote("已从 audio/playlist.json 回退清单加载。");
    } catch (manifestError) {
      tracks = [];
      updateSourceNote(
        "未找到曲目。在 GitHub Pages 上，audio/tracks 中的文件会自动加载；如果使用自定义域名，请填写仓库 meta 标签或保留本地清单回退。"
      );
      console.error(githubError);
      console.error(manifestError);
    }
  }

  renderPlaylist();
  loadTrack(0);
}

playButton.addEventListener("click", async () => {
  if (!tracks.length) {
    return;
  }

  if (audio.paused) {
    try {
      await audio.play();
    } catch (error) {
      console.error(error);
    }
  } else {
    audio.pause();
  }

  syncPlayState();
});

prevButton.addEventListener("click", () => {
  if (!tracks.length) {
    return;
  }

  loadTrack(getPreviousIndex(), { autoplay: true });
});

nextButton.addEventListener("click", () => {
  if (!tracks.length) {
    return;
  }

  loadTrack(getNextIndex(), { autoplay: true });
});

shuffleButton.addEventListener("click", () => {
  isShuffleEnabled = !isShuffleEnabled;
  shuffleButton.setAttribute("aria-pressed", String(isShuffleEnabled));
});

repeatButton.addEventListener("click", () => {
  isRepeatEnabled = !isRepeatEnabled;
  repeatButton.setAttribute("aria-pressed", String(isRepeatEnabled));
});

autoplayButton.addEventListener("click", () => {
  isAutoplayEnabled = !isAutoplayEnabled;
  autoplayButton.setAttribute("aria-pressed", String(isAutoplayEnabled));
  autoplayButton.textContent = isAutoplayEnabled ? "自动播放：开" : "自动播放：关";
});

seekBar.addEventListener("input", () => {
  if (!Number.isFinite(audio.duration)) {
    return;
  }

  audio.currentTime = (Number(seekBar.value) / 100) * audio.duration;
});

volumeBar.addEventListener("input", () => {
  audio.volume = Number(volumeBar.value);
});

audio.addEventListener("timeupdate", () => {
  if (!Number.isFinite(audio.duration)) {
    return;
  }

  seekBar.value = String((audio.currentTime / audio.duration) * 100);
  currentTimeElement.textContent = formatTime(audio.currentTime);
});

audio.addEventListener("loadedmetadata", () => {
  totalTimeElement.textContent = formatTime(audio.duration);
});

audio.addEventListener("play", syncPlayState);
audio.addEventListener("pause", syncPlayState);

audio.addEventListener("ended", () => {
  if (isRepeatEnabled) {
    audio.currentTime = 0;
    audio.play().catch((error) => console.error(error));
    return;
  }

  if (isAutoplayEnabled || isShuffleEnabled) {
    loadTrack(getNextIndex(), { autoplay: true });
    return;
  }

  syncPlayState();
});

audio.volume = Number(volumeBar.value);
loadPlaylist();

