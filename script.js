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
const lyricsStatusElement = document.querySelector("#lyrics-status");
const lyricsFollowButton = document.querySelector("#lyrics-follow-button");
const lyricsRoleElement = document.querySelector("#lyrics-role");
const lyricsCurrentLineElement = document.querySelector("#lyrics-current-line");
const lyricsSublineElement = document.querySelector("#lyrics-subline");
const lyricsCountElement = document.querySelector("#lyrics-count");
const lyricsListElement = document.querySelector("#lyrics-list");
const pageShell = document.querySelector(".page-shell");

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".mp4"]);
const VERSION_CONFIG = {
  original: {
    label: "原唱",
    folder: "audio/originals",
    metaName: "github-original-audio-path"
  },
  cover: {
    label: "翻唱",
    folder: "audio/covers",
    metaName: "github-cover-audio-path"
  }
};
const DEFAULT_ALBUM = document.title.trim() || "我的音乐";
const EMPTY_ARTIST_TEXT = "请将原唱放入 audio/originals，将翻唱放入 audio/covers";
const EMPTY_ALBUM_TEXT = "同名文件会自动配对";
const DEFAULT_LYRICS_PATH = "lyrics";

let songs = [];
let currentSongIndex = 0;
let currentRole = "cover";
let isShuffleEnabled = false;
let isRepeatEnabled = false;
let isAutoplayEnabled = false;
let lyricsRequestToken = 0;
let lyricsSelection = null;

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

function getSongKey(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function getSongKeyFromFilename(filename) {
  return getSongKey(safeDecodeURIComponent(filename.replace(/\.[^.]+$/, "")));
}

function getOtherRole(role) {
  return role === "original" ? "cover" : "original";
}

function createTrack(track, fallback = {}) {
  const role = fallback.role || track?.role || "cover";
  const source = String(track?.src || fallback.src || "");
  const filename = fallback.filename || getFilenameFromSource(source);
  const basename = safeDecodeURIComponent(filename.replace(/\.[^.]+$/, "")).trim();
  const title = String(track?.title || fallback.title || filenameToTitle(filename)).trim() || "未命名曲目";
  const artist = String(track?.artist || fallback.artist || VERSION_CONFIG[role].label).trim() || VERSION_CONFIG[role].label;
  const album = String(track?.album || fallback.album || DEFAULT_ALBUM).trim() || DEFAULT_ALBUM;
  const duration = String(track?.duration || fallback.duration || "").trim();
  const key =
    String(track?.key || fallback.key || getSongKeyFromFilename(filename) || getSongKey(title)).trim() ||
    getSongKey(title);

  return {
    key,
    title,
    artist,
    album,
    src: source,
    duration,
    role,
    roleLabel: VERSION_CONFIG[role].label,
    basename
  };
}

function buildSongPairs(roleTracks) {
  const songMap = new Map();

  roleTracks.forEach((track) => {
    if (!track?.key) {
      return;
    }

    const existing = songMap.get(track.key) || {
      key: track.key,
      title: track.title,
      original: null,
      cover: null
    };

    existing.title = existing.title || track.title;
    existing[track.role] = track;
    songMap.set(track.key, existing);
  });

  return [...songMap.values()].sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
}

function normalizeSongPair(song) {
  const title = String(song?.title || "").trim();
  const original = song?.original ? createTrack(song.original, { role: "original", title, key: song.key }) : null;
  const cover = song?.cover ? createTrack(song.cover, { role: "cover", title, key: song.key }) : null;
  const key = getSongKey(song?.key) || original?.key || cover?.key || getSongKey(title);

  if (!key || (!original && !cover)) {
    return null;
  }

  return {
    key,
    title: title || original?.title || cover?.title || "未命名曲目",
    original,
    cover
  };
}

function getLyricsContext() {
  const githubContext = getGitHubContext();

  return {
    basePath: githubContext?.basePath || "",
    lyricsPath: readMetaContent("github-lyrics-path") || githubContext?.lyricsPath || DEFAULT_LYRICS_PATH
  };
}

function getGitHubContext() {
  const ownerOverride = readMetaContent("github-owner");
  const repoOverride = readMetaContent("github-repo");
  const branch = readMetaContent("github-branch") || "main";
  const originalPath = readMetaContent(VERSION_CONFIG.original.metaName) || VERSION_CONFIG.original.folder;
  const coverPath = readMetaContent(VERSION_CONFIG.cover.metaName) || VERSION_CONFIG.cover.folder;
  const lyricsPath = readMetaContent("github-lyrics-path") || DEFAULT_LYRICS_PATH;

  if (ownerOverride && repoOverride) {
    return {
      owner: ownerOverride,
      repo: repoOverride,
      branch,
      originalPath,
      coverPath,
      lyricsPath,
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
    originalPath,
    coverPath,
    lyricsPath,
    basePath
  };
}

function updateSourceNote(message) {
  sourceNoteElement.textContent = message;
}

function getSongStatusText(song) {
  if (song.original && song.cover) {
    return "原唱与翻唱已配对";
  }

  if (song.cover) {
    return "只有翻唱，待补原唱";
  }

  if (song.original) {
    return "只有原唱，待补翻唱";
  }

  return "暂无可播放版本";
}

function getPlaceholderLyrics(selection) {
  if (!selection) {
    return {
      status: "暂无歌词",
      role: "等待播放",
      currentLine: "请选择一首歌曲开始播放",
      subline: "当前项目还没有接入逐行歌词文件，这里先展示当前歌曲和歌词占位信息。",
      lines: [
        "请选择一首歌曲开始播放",
        "原唱与翻唱会共用同名歌曲的歌词区域",
        "后续可继续接入 .lrc 或 JSON 歌词数据"
      ]
    };
  }

  const song = songs[selection.songIndex];
  const currentTitle = song?.title || selection.track.title;

  return {
    status: song?.original && song?.cover ? "等待歌词接入" : "歌词待补充",
    role: `${selection.track.roleLabel}版本`,
    currentLine: currentTitle,
    subline: `当前播放的是${selection.track.roleLabel}。后续接入歌词文件后，这里将显示实时高亮歌词。`,
    lines: [
      currentTitle,
      `当前版本：${selection.track.roleLabel}`,
      song ? getSongStatusText(song) : "暂无歌曲状态",
      "暂未检测到对应歌词文件",
      "可后续接入 .lrc 或 JSON 歌词数据"
    ]
  };
}

function renderLyricsPanelData(lyricsData) {
  lyricsStatusElement.textContent = lyricsData.status;
  lyricsRoleElement.textContent = lyricsData.role;
  lyricsCurrentLineElement.textContent = lyricsData.currentLine;
  lyricsSublineElement.textContent = lyricsData.subline;
  lyricsCountElement.textContent = `${lyricsData.lines.length} 行`;
  lyricsListElement.innerHTML = "";

  lyricsData.lines.forEach((line, index) => {
    const item = document.createElement("li");
    item.className = "lyrics-line";

    if (index === 0) {
      item.classList.add("active");
    }

    item.textContent = line;
    lyricsListElement.appendChild(item);
  });
}

function renderLyricsPanel(selection) {
  lyricsSelection = selection;
  renderLyricsPanelData(getPlaceholderLyrics(selection));
}

function getLyricsStem(selection) {
  const song = songs[selection.songIndex];

  return (
    selection.track.basename ||
    song?.original?.basename ||
    song?.cover?.basename ||
    song?.title ||
    selection.track.title
  );
}

function parseLyricsText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function fetchLyricsText(selection) {
  const stem = getLyricsStem(selection);
  const { basePath, lyricsPath } = getLyricsContext();
  const lyricsUrl = joinUrlParts(basePath, lyricsPath, `${encodeURIComponent(stem)}.txt`);
  const response = await fetch(lyricsUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Lyrics request failed: ${response.status}`);
  }

  return response.text();
}

async function loadLyricsForSelection(selection) {
  const requestToken = ++lyricsRequestToken;
  lyricsSelection = selection;
  const placeholder = getPlaceholderLyrics(selection);
  const stem = getLyricsStem(selection);

  renderLyricsPanelData({
    ...placeholder,
    status: "正在加载歌词",
    subline: `正在读取 lyrics/${stem}.txt`
  });

  try {
    const lyricsText = await fetchLyricsText(selection);

    if (requestToken !== lyricsRequestToken) {
      return;
    }

    const lines = parseLyricsText(lyricsText);

    if (!lines.length) {
      renderLyricsPanel(selection);
      return;
    }

    renderLyricsPanelData({
      status: "TXT 歌词",
      role: `${selection.track.roleLabel}版本`,
      currentLine: lines[0],
      subline: `已加载 lyrics/${stem}.txt，共 ${lines.length} 行`,
      lines
    });
  } catch {
    if (requestToken !== lyricsRequestToken) {
      return;
    }

    renderLyricsPanel(selection);
  }
}

function updateActiveTrack() {
  const slots = playlistElement.querySelectorAll(".pair-slot.available");
  const rows = playlistElement.querySelectorAll(".pair-item");

  rows.forEach((row, index) => {
    row.classList.toggle("active-row", index === currentSongIndex);
  });

  slots.forEach((slot) => {
    const songIndex = Number(slot.dataset.songIndex);
    const role = slot.dataset.role;
    const isActive = songIndex === currentSongIndex && role === currentRole;
    slot.classList.toggle("active", isActive);
    slot.setAttribute("aria-pressed", String(isActive));
  });
}

function updateTrackInfo(selection) {
  if (!selection) {
    titleElement.textContent = "准备加载";
    artistElement.textContent = EMPTY_ARTIST_TEXT;
    albumElement.textContent = EMPTY_ALBUM_TEXT;
    return;
  }

  const song = songs[selection.songIndex];
  titleElement.textContent = selection.track.title;
  artistElement.textContent = `当前版本：${selection.track.roleLabel}`;
  albumElement.textContent = getSongStatusText(song);
}

function resolveSelection(songIndex, preferredRole = currentRole) {
  const song = songs[songIndex];

  if (!song) {
    return null;
  }

  if (song[preferredRole]) {
    return {
      songIndex,
      role: preferredRole,
      track: song[preferredRole]
    };
  }

  const otherRole = getOtherRole(preferredRole);

  if (song[otherRole]) {
    return {
      songIndex,
      role: otherRole,
      track: song[otherRole]
    };
  }

  return null;
}

function loadSelection(songIndex, preferredRole, { autoplay = false } = {}) {
  if (!songs.length) {
    updateTrackInfo(null);
    audio.removeAttribute("src");
    audio.load();
    syncPlayState();
    return;
  }

  const selection = resolveSelection(songIndex, preferredRole);

  if (!selection) {
    return;
  }

  currentSongIndex = selection.songIndex;
  currentRole = selection.role;
  audio.src = selection.track.src;
  audio.load();

  updateTrackInfo(selection);
  currentTimeElement.textContent = "0:00";
  totalTimeElement.textContent = selection.track.duration || "--:--";
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

function createSlot(songIndex, role, track) {
  const cell = document.createElement("div");
  cell.className = "pair-cell";
  cell.dataset.label = VERSION_CONFIG[role].label;

  if (!track) {
    const placeholder = document.createElement("span");
    placeholder.className = "pair-slot missing";
    placeholder.textContent = "待添加";
    cell.appendChild(placeholder);
    return cell;
  }

  const button = document.createElement("button");
  button.className = "pair-slot available";
  button.type = "button";
  button.dataset.songIndex = String(songIndex);
  button.dataset.role = role;
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", `播放${track.roleLabel}：${track.title}`);
  button.addEventListener("click", () => {
    loadSelection(songIndex, role, { autoplay: true });
  });

  const action = document.createElement("strong");
  action.className = "pair-slot-action";
  action.textContent = "播放";

  const note = document.createElement("span");
  note.className = "pair-slot-note";
  note.textContent = track.duration || "已就绪";

  button.append(action, note);
  cell.appendChild(button);
  return cell;
}

function renderPlaylist() {
  playlistElement.innerHTML = "";
  trackCountElement.textContent = `${songs.length} 组`;
  playlistEmptyElement.hidden = songs.length > 0;

  songs.forEach((song, index) => {
    const item = document.createElement("li");
    item.className = "pair-item";

    const songCell = document.createElement("div");
    songCell.className = "pair-song";

    const indexBadge = document.createElement("span");
    indexBadge.className = "track-index";
    indexBadge.textContent = String(index + 1).padStart(2, "0");

    const songCopy = document.createElement("div");
    songCopy.className = "pair-song-copy";

    const title = document.createElement("strong");
    title.textContent = song.title;

    const status = document.createElement("span");
    status.textContent = getSongStatusText(song);

    songCopy.append(title, status);
    songCell.append(indexBadge, songCopy);

    item.append(songCell, createSlot(index, "original", song.original), createSlot(index, "cover", song.cover));
    playlistElement.appendChild(item);
  });

  updateActiveTrack();
}

function findAdjacentSelection(step) {
  if (!songs.length) {
    return null;
  }

  let fallbackSelection = null;

  for (let offset = 1; offset <= songs.length; offset += 1) {
    const index = (currentSongIndex + step * offset + songs.length) % songs.length;
    const selection = resolveSelection(index, currentRole);

    if (!selection) {
      continue;
    }

    if (selection.role === currentRole) {
      return selection;
    }

    if (!fallbackSelection) {
      fallbackSelection = selection;
    }
  }

  return fallbackSelection || resolveSelection(currentSongIndex, currentRole);
}

function getRandomSelection() {
  if (!songs.length) {
    return null;
  }

  if (songs.length === 1) {
    return resolveSelection(currentSongIndex, currentRole);
  }

  const availableIndexes = songs
    .map((song, index) => (song.original || song.cover ? index : -1))
    .filter((index) => index >= 0 && index !== currentSongIndex);

  while (availableIndexes.length) {
    const randomOffset = Math.floor(Math.random() * availableIndexes.length);
    const candidateIndex = availableIndexes.splice(randomOffset, 1)[0];
    const selection = resolveSelection(candidateIndex, currentRole);

    if (selection) {
      return selection;
    }
  }

  return resolveSelection(currentSongIndex, currentRole);
}

async function loadTracksForRoleFromGitHub(context, role) {
  const folderPath = context[`${role}Path`];
  const apiUrl = `https://api.github.com/repos/${context.owner}/${context.repo}/contents/${encodePath(
    folderPath
  )}?ref=${encodeURIComponent(context.branch)}`;
  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`GitHub API request failed for ${role}: ${response.status}`);
  }

  const items = await response.json();

  if (!Array.isArray(items)) {
    throw new Error(`Unexpected GitHub API payload for ${role}.`);
  }

  return items
    .filter((item) => item.type === "file")
    .filter((item) => AUDIO_EXTENSIONS.has(item.name.slice(item.name.lastIndexOf(".")).toLowerCase()))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
    .map((item) => {
      const relativeSource = joinUrlParts(context.basePath, folderPath, encodeURIComponent(item.name));

      return createTrack(
        {
          src: relativeSource
        },
        {
          filename: item.name,
          role
        }
      );
    });
}

async function loadSongsFromGitHub() {
  const context = getGitHubContext();

  if (!context) {
    throw new Error("GitHub repository context is unavailable.");
  }

  const [originalTracks, coverTracks] = await Promise.all([
    loadTracksForRoleFromGitHub(context, "original"),
    loadTracksForRoleFromGitHub(context, "cover")
  ]);

  return buildSongPairs([...originalTracks, ...coverTracks]);
}

async function loadSongsFromManifest() {
  const response = await fetch("./audio/playlist.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Playlist request failed: ${response.status}`);
  }

  const data = await response.json();

  if (Array.isArray(data.songs)) {
    return data.songs
      .map((song) => normalizeSongPair(song))
      .filter(Boolean)
      .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
  }

  if (Array.isArray(data.tracks)) {
    const coverTracks = data.tracks.map((track) => createTrack(track, { role: "cover" }));
    return buildSongPairs(coverTracks);
  }

  return [];
}

async function loadPlaylist() {
  try {
    songs = await loadSongsFromGitHub();
    updateSourceNote("已从 GitHub 仓库的原唱与翻唱目录自动加载。");
  } catch (githubError) {
    try {
      songs = await loadSongsFromManifest();
      updateSourceNote("已从 audio/playlist.json 本地配对清单加载。");
    } catch (manifestError) {
      songs = [];
      updateSourceNote(
        "未找到歌曲。请将原唱放入 audio/originals，将翻唱放入 audio/covers；使用自定义域名时，请填写仓库 meta 标签或保留本地清单回退。"
      );
      console.error(githubError);
      console.error(manifestError);
    }
  }

  renderPlaylist();
  loadSelection(0, "cover");
}

playButton.addEventListener("click", async () => {
  if (!songs.length) {
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
  const selection = findAdjacentSelection(-1);

  if (!selection) {
    return;
  }

  loadSelection(selection.songIndex, selection.role, { autoplay: true });
});

nextButton.addEventListener("click", () => {
  const selection = isShuffleEnabled ? getRandomSelection() : findAdjacentSelection(1);

  if (!selection) {
    return;
  }

  loadSelection(selection.songIndex, selection.role, { autoplay: true });
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
  autoplayButton.textContent = isAutoplayEnabled ? "自动切换：开" : "自动切换：关";
});

lyricsFollowButton.addEventListener("click", () => {
  const selection = resolveSelection(currentSongIndex, currentRole);

  if (!selection) {
    renderLyricsPanel(null);
    return;
  }

  void loadLyricsForSelection(selection);
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
    const selection = isShuffleEnabled ? getRandomSelection() : findAdjacentSelection(1);

    if (selection) {
      loadSelection(selection.songIndex, selection.role, { autoplay: true });
      return;
    }
  }

  syncPlayState();
});

audio.volume = Number(volumeBar.value);
renderLyricsPanel(null);
loadPlaylist();
