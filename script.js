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
const lyricsDisplayTitleTextElement = document.querySelector("#lyrics-display-title-text");
const lyricsDisplayTextElement = document.querySelector("#lyrics-display-text");
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
let lyricsEntries = [];
let selectedLyricsKey = null;
let lyricsRequestToken = 0;

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
  return String(path || "")
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
        return String(part).replace(/\/+$/g, "");
      }

      return String(part).replace(/^\/+|\/+$/g, "");
    })
    .filter(Boolean);

  if (!cleaned.length) {
    return "";
  }

  const joined = cleaned.join("/");
  return joined.startsWith("/") ? joined : `/${joined}`;
}

function getFilenameFromSource(src) {
  const cleanSource = String(src || "").split(/[?#]/, 1)[0];
  return cleanSource.split("/").filter(Boolean).pop() || "";
}

function filenameToTitle(filename) {
  const nameWithoutExtension = String(filename || "").replace(/\.[^.]+$/, "");
  const decodedName = safeDecodeURIComponent(nameWithoutExtension).replace(/[-_]+/g, " ").trim();
  return decodedName || "未命名曲目";
}

function getSongKey(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function getSongKeyFromFilename(filename) {
  return getSongKey(safeDecodeURIComponent(String(filename || "").replace(/\.[^.]+$/, "")));
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

function getLyricsContext() {
  const githubContext = getGitHubContext();

  return {
    basePath: githubContext?.basePath || "",
    lyricsPath: readMetaContent("github-lyrics-path") || githubContext?.lyricsPath || DEFAULT_LYRICS_PATH
  };
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

function updateSourceNote(message) {
  sourceNoteElement.textContent = message;
}

function renderLyricsMessage({ title, status, paragraphs }) {
  lyricsDisplayTitleTextElement.textContent = title;
  lyricsStatusElement.textContent = status;
  lyricsDisplayTextElement.innerHTML = "";

  paragraphs.forEach((paragraph) => {
    const element = document.createElement("p");
    const isBlank = !paragraph.trim();
    element.className = "lyrics-paragraph";

    if (isBlank) {
      element.classList.add("is-empty");
      element.textContent = " ";
    } else {
      element.textContent = paragraph;
    }

    lyricsDisplayTextElement.appendChild(element);
  });
}

function renderLyricsIntro() {
  const hasLyrics = lyricsEntries.length > 0;

  renderLyricsMessage({
    title: "未选择歌词",
    status: hasLyrics ? "请选择歌词" : "暂无歌词",
    paragraphs: hasLyrics
      ? ["左侧显示的是 TXT 歌词全文。", "请从右侧歌词单选择一份歌词，或点击“跳到当前歌词”。"]
      : ["还没有检测到可用的歌词文件。", "将歌词放入 lyrics/ 并使用与歌曲相同的文件名，例如 lyrics/泡沫.txt。"]
  });
}

function renderLyricsDirectoryLoading() {
  lyricsCountElement.textContent = "0 份";
  lyricsListElement.innerHTML = "";

  const item = document.createElement("li");
  item.className = "lyrics-directory-empty";
  item.textContent = "正在加载歌词目录";
  lyricsListElement.appendChild(item);
}

function renderLyricsDirectory() {
  lyricsListElement.innerHTML = "";
  lyricsCountElement.textContent = `${lyricsEntries.length} 份`;

  if (!lyricsEntries.length) {
    const item = document.createElement("li");
    item.className = "lyrics-directory-empty";
    item.textContent = "未找到歌词文件";
    lyricsListElement.appendChild(item);
    return;
  }

  lyricsEntries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "lyrics-entry";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "lyrics-entry-button";

    if (entry.key === selectedLyricsKey) {
      button.classList.add("active");
      button.setAttribute("aria-current", "true");
    }

    button.addEventListener("click", () => {
      void selectLyricsEntryByKey(entry.key);
    });

    const title = document.createElement("strong");
    title.className = "lyrics-entry-title";
    title.textContent = entry.title;

    const meta = document.createElement("span");
    meta.className = "lyrics-entry-meta";
    meta.textContent = `TXT 歌词 · ${entry.filename}`;

    button.append(title, meta);
    item.appendChild(button);
    lyricsListElement.appendChild(item);
  });
}

function decodeLyricsBuffer(buffer) {
  const utf8Text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

  if (!utf8Text.includes("\uFFFD")) {
    return utf8Text;
  }

  try {
    return new TextDecoder("gb18030", { fatal: false }).decode(buffer);
  } catch {
    return utf8Text;
  }
}

async function fetchLyricsTextByStem(stem) {
  const { basePath, lyricsPath } = getLyricsContext();
  const lyricsUrl = joinUrlParts(basePath, lyricsPath, `${encodeURIComponent(stem)}.txt`);
  const response = await fetch(lyricsUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Lyrics request failed: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return decodeLyricsBuffer(buffer);
}

function createLyricsEntry({ stem, filename, text = null }) {
  const resolvedFilename = filename || `${stem}.txt`;
  const resolvedStem = stem || safeDecodeURIComponent(resolvedFilename.replace(/\.txt$/i, ""));
  const title = safeDecodeURIComponent(resolvedStem).trim() || "未命名歌词";
  const key = getSongKey(resolvedStem);

  return {
    key,
    stem: resolvedStem,
    title,
    filename: resolvedFilename,
    text
  };
}

function dedupeLyricsEntries(entries) {
  const entryMap = new Map();

  entries.forEach((entry) => {
    if (!entry?.key) {
      return;
    }

    const existing = entryMap.get(entry.key);

    if (!existing) {
      entryMap.set(entry.key, entry);
      return;
    }

    if (!existing.text && entry.text) {
      existing.text = entry.text;
    }

    if (!existing.filename && entry.filename) {
      existing.filename = entry.filename;
    }

    if (!existing.stem && entry.stem) {
      existing.stem = entry.stem;
    }
  });

  return [...entryMap.values()].sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
}

function collectLyricsCandidateStems() {
  const stemMap = new Map();

  songs.forEach((song) => {
    [song.original?.basename, song.cover?.basename, song.title].forEach((candidate) => {
      const stem = String(candidate || "").trim();

      if (!stem) {
        return;
      }

      const key = getSongKey(stem);

      if (!stemMap.has(key)) {
        stemMap.set(key, stem);
      }
    });
  });

  return [...stemMap.values()].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

async function loadLyricsEntriesFromGitHub(context) {
  const apiUrl = `https://api.github.com/repos/${context.owner}/${context.repo}/contents/${encodePath(
    context.lyricsPath
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
    throw new Error(`GitHub lyrics request failed: ${response.status}`);
  }

  const items = await response.json();

  if (!Array.isArray(items)) {
    throw new Error("Unexpected GitHub lyrics payload.");
  }

  return items
    .filter((item) => item.type === "file" && /\.txt$/i.test(item.name))
    .map((item) =>
      createLyricsEntry({
        filename: item.name,
        stem: safeDecodeURIComponent(item.name.replace(/\.txt$/i, ""))
      })
    )
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
}

async function loadLyricsEntriesByProbing() {
  const candidates = collectLyricsCandidateStems();

  if (!candidates.length) {
    return [];
  }

  const results = await Promise.all(
    candidates.map(async (stem) => {
      try {
        const text = await fetchLyricsTextByStem(stem);
        return createLyricsEntry({ stem, text });
      } catch {
        return null;
      }
    })
  );

  return dedupeLyricsEntries(results.filter(Boolean));
}

async function loadLyricsDirectory() {
  renderLyricsDirectoryLoading();

  const githubContext = getGitHubContext();
  let entries = [];

  if (githubContext) {
    try {
      entries = await loadLyricsEntriesFromGitHub(githubContext);
    } catch (error) {
      console.error(error);
    }
  }

  if (!entries.length) {
    try {
      entries = await loadLyricsEntriesByProbing();
    } catch (error) {
      console.error(error);
    }
  }

  lyricsEntries = dedupeLyricsEntries(entries);

  if (selectedLyricsKey && !lyricsEntries.some((entry) => entry.key === selectedLyricsKey)) {
    selectedLyricsKey = null;
  }

  renderLyricsDirectory();

  if (!selectedLyricsKey) {
    renderLyricsIntro();
  }
}

function renderLyricsLoading(entry) {
  renderLyricsMessage({
    title: entry.title,
    status: "正在加载歌词",
    paragraphs: [`正在读取 lyrics/${entry.filename}`, "请稍候。"]
  });
}

function renderLyricsError(entry, message) {
  renderLyricsMessage({
    title: entry?.title || "未找到歌词",
    status: "歌词不可用",
    paragraphs: [message]
  });
}

function renderLyricsText(entry, text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\r/g, ""));

  renderLyricsMessage({
    title: entry.title,
    status: "TXT 歌词",
    paragraphs: lines.length ? lines : ["歌词文件为空。"]
  });
}

async function selectLyricsEntryByKey(key) {
  const entry = lyricsEntries.find((item) => item.key === key);

  if (!entry) {
    return;
  }

  selectedLyricsKey = entry.key;
  renderLyricsDirectory();

  if (typeof entry.text === "string") {
    renderLyricsText(entry, entry.text);
    return;
  }

  renderLyricsLoading(entry);
  const requestToken = ++lyricsRequestToken;

  try {
    const text = await fetchLyricsTextByStem(entry.stem);

    if (requestToken !== lyricsRequestToken) {
      return;
    }

    entry.text = text;
    renderLyricsText(entry, text);
  } catch (error) {
    if (requestToken !== lyricsRequestToken) {
      return;
    }

    console.error(error);
    renderLyricsError(entry, `未能读取 lyrics/${entry.filename}。`);
  }
}

function getLyricsStemFromSelection(selection) {
  const song = songs[selection.songIndex];

  return (
    selection.track.basename ||
    song?.original?.basename ||
    song?.cover?.basename ||
    song?.title ||
    selection.track.title
  );
}

function findLyricsEntryForSelection(selection) {
  const stem = getSongKey(getLyricsStemFromSelection(selection));
  return lyricsEntries.find((entry) => entry.key === stem || getSongKey(entry.stem) === stem) || null;
}

async function ensureLyricsEntryForSelection(selection) {
  const existingEntry = findLyricsEntryForSelection(selection);

  if (existingEntry) {
    return existingEntry;
  }

  const stem = getLyricsStemFromSelection(selection);

  if (!stem) {
    return null;
  }

  try {
    const text = await fetchLyricsTextByStem(stem);
    const entry = createLyricsEntry({ stem, text });
    lyricsEntries = dedupeLyricsEntries([...lyricsEntries, entry]);
    renderLyricsDirectory();
    return lyricsEntries.find((item) => item.key === entry.key) || entry;
  } catch {
    return null;
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

function syncPlayState() {
  const isPlaying = !audio.paused && !audio.ended;
  playButton.textContent = isPlaying ? "暂停" : "播放";
  playButton.setAttribute("aria-label", isPlaying ? "暂停" : "播放");
  pageShell.classList.toggle("is-playing", isPlaying);
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
  totalTimeElement.textContent = selection.track.duration || "0:00";
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
    .catch((error) => {
      console.error(error);
      syncPlayState();
    });
}

function createSlot(songIndex, role, track) {
  const cell = document.createElement("div");
  cell.className = "pair-cell";
  cell.dataset.label = VERSION_CONFIG[role].label;

  if (!track) {
    const placeholder = document.createElement("span");
    placeholder.className = "pair-slot missing";
    placeholder.textContent = "待补充";
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
  note.textContent = track.duration || `${track.roleLabel}已就绪`;

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
  const githubContext = getGitHubContext();
  const attempts = githubContext
    ? [
        {
          load: loadSongsFromGitHub,
          successMessage: "已从 GitHub 仓库中的原唱与翻唱目录自动加载。"
        },
        {
          load: loadSongsFromManifest,
          successMessage: "已从 audio/playlist.json 本地清单加载。"
        }
      ]
    : [
        {
          load: loadSongsFromManifest,
          successMessage: "已从 audio/playlist.json 本地清单加载。"
        }
      ];
  const errors = [];

  for (const attempt of attempts) {
    try {
      songs = await attempt.load();
      updateSourceNote(attempt.successMessage);
      break;
    } catch (error) {
      errors.push(error);
    }
  }

  if (!songs.length) {
    updateSourceNote(
      "未找到歌曲。请将原唱放入 audio/originals，将翻唱放入 audio/covers，并保持同名文件配对。"
    );
  }

  errors.forEach((error) => console.error(error));

  renderPlaylist();
  loadSelection(0, "cover");
  await loadLyricsDirectory();
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
  autoplayButton.textContent = isAutoplayEnabled ? "自动切歌：开" : "自动切歌：关";
});

lyricsFollowButton.addEventListener("click", async () => {
  const selection = resolveSelection(currentSongIndex, currentRole);

  if (!selection) {
    renderLyricsIntro();
    return;
  }

  const entry = await ensureLyricsEntryForSelection(selection);

  if (!entry) {
    renderLyricsError(
      { title: selection.track.title },
      `当前歌曲《${selection.track.title}》还没有对应的歌词文件。`
    );
    return;
  }

  await selectLyricsEntryByKey(entry.key);
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
renderLyricsDirectoryLoading();
renderLyricsMessage({
  title: "未选择歌词",
  status: "正在加载歌词目录",
  paragraphs: ["左侧会显示 TXT 歌词的完整文本。", "请稍候，正在读取歌词目录。"]
});
loadPlaylist();
