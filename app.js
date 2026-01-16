"use strict";

const PAGE_SIZE = 50;

const state = {
  posts: [],
  groups: new Map(),
  postById: new Map(),
  selectedYear: null,
  selectedMonth: null,
  selectedPostId: null,
  page: 1,
  summaryLength: 60,
  search: "",
  report: null,
  topPaths: [],
  mediaUrls: [],
  mediaIndex: new Map(),
};

const elements = {
  zipInput: document.getElementById("zipInput"),
  parseBtn: document.getElementById("parseBtn"),
  status: document.getElementById("status"),
  yearList: document.getElementById("yearList"),
  report: document.getElementById("report"),
  searchInput: document.getElementById("searchInput"),
  summaryLength: document.getElementById("summaryLength"),
  currentFilter: document.getElementById("currentFilter"),
  postsTableBody: document.getElementById("postsTableBody"),
  pagination: document.getElementById("pagination"),
  detailDate: document.getElementById("detailDate"),
  detailMedia: document.getElementById("detailMedia"),
  detailText: document.getElementById("detailText"),
  detailLink: document.getElementById("detailLink"),
  emptyPanel: document.getElementById("emptyPanel"),
  emptyMessage: document.getElementById("emptyMessage"),
  emptyPaths: document.getElementById("emptyPaths"),
};

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function resetState() {
  if (state.mediaUrls.length) {
    for (const url of state.mediaUrls) {
      URL.revokeObjectURL(url);
    }
  }
  state.posts = [];
  state.groups = new Map();
  state.postById = new Map();
  state.selectedYear = null;
  state.selectedMonth = null;
  state.selectedPostId = null;
  state.page = 1;
  state.search = "";
  state.report = null;
  state.topPaths = [];
  state.mediaUrls = [];
  state.mediaIndex = new Map();
  elements.searchInput.value = "";
  elements.detailDate.textContent = "投稿を選ぶと詳細が表示されます。";
  elements.detailMedia.innerHTML = "";
  elements.detailText.textContent = "";
  elements.detailLink.innerHTML = "";
  elements.postsTableBody.innerHTML = "";
  elements.pagination.innerHTML = "";
  elements.currentFilter.textContent = "未選択";
}

function fixMojibake(value) {
  if (typeof value !== "string") {
    return value;
  }
  if (!value) {
    return value;
  }
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i) & 0xff;
  }
  let decoded = value;
  try {
    decoded = new TextDecoder("utf-8").decode(bytes);
  } catch (err) {
    return value;
  }
  if (decoded === value) {
    return value;
  }
  let replacementCount = 0;
  for (let i = 0; i < decoded.length; i += 1) {
    if (decoded.charCodeAt(i) === 0xfffd) {
      replacementCount += 1;
    }
  }
  const limit = Math.max(1, Math.floor(decoded.length * 0.1));
  if (replacementCount > limit) {
    return value;
  }
  return decoded;
}

function normalizeText(text) {
  if (!text) {
    return "";
  }
  return String(text).replace(/\s+/g, " ").trim();
}

function buildSummary(text) {
  const normalized = normalizeText(text);
  return normalized.slice(0, state.summaryLength);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateParts(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

function formatLocalDate(date) {
  const parts = formatDateParts(date);
  return `${parts.year}/${pad2(parts.month)}/${pad2(parts.day)} ${pad2(
    parts.hour
  )}:${pad2(parts.minute)}`;
}

function formatMonthDay(date) {
  const parts = formatDateParts(date);
  return `${pad2(parts.month)}/${pad2(parts.day)}`;
}

function formatTime(date) {
  const parts = formatDateParts(date);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function hasHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function normalizePath(path) {
  return String(path || "").replace(/\\/g, "/");
}

function isMediaFile(path) {
  const lower = path.toLowerCase();
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".mp4") ||
    lower.endsWith(".mov") ||
    lower.endsWith(".m4v") ||
    lower.endsWith(".webm")
  );
}

function guessMime(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".mp4")) {
    return "video/mp4";
  }
  if (lower.endsWith(".mov")) {
    return "video/quicktime";
  }
  if (lower.endsWith(".m4v")) {
    return "video/x-m4v";
  }
  if (lower.endsWith(".webm")) {
    return "video/webm";
  }
  return "application/octet-stream";
}

function isTargetPostPath(path) {
  const lower = path.toLowerCase();
  return (
    lower.includes("your_facebook_activity/posts/") ||
    lower.includes("this_profile's_activity_across_facebook/posts/")
  );
}

function findPermalink(entry) {
  if (!entry || !Array.isArray(entry.attachments)) {
    return "";
  }
  for (const attachment of entry.attachments) {
    if (!attachment || !Array.isArray(attachment.data)) {
      continue;
    }
    for (const item of attachment.data) {
      const url = item && item.external_context && item.external_context.url;
      if (typeof url === "string") {
        const fixed = fixMojibake(url);
        if (hasHttpUrl(fixed)) {
          return fixed;
        }
      }
    }
  }
  return "";
}

function collectMediaItems(entry, mediaIndex) {
  if (!entry || !Array.isArray(entry.attachments)) {
    return [];
  }
  const items = [];
  for (const attachment of entry.attachments) {
    if (!attachment || !Array.isArray(attachment.data)) {
      continue;
    }
    for (const item of attachment.data) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const media = item.media || item.video || item.image || null;
      if (!media || typeof media !== "object") {
        continue;
      }
      const rawUri = media.uri || media.src || "";
      if (!rawUri) {
        continue;
      }
      const uri = normalizePath(fixMojibake(rawUri));
      const lookupKey = uri.toLowerCase();
      const mediaEntry = mediaIndex.get(lookupKey);
      let url = "";
      let mime = "";
      let type = "";
      if (mediaEntry) {
        if (!mediaEntry.url) {
          mime = guessMime(mediaEntry.path);
          mediaEntry.url = URL.createObjectURL(
            new Blob([mediaEntry.data], { type: mime })
          );
          mediaEntry.mime = mime;
          state.mediaUrls.push(mediaEntry.url);
        }
        url = mediaEntry.url;
        mime = mediaEntry.mime || guessMime(mediaEntry.path);
        type = mime.startsWith("video/") ? "video" : "image";
      }
      items.push({
        uri,
        url,
        type,
        mime,
        title: fixMojibake(media.title || item.title || ""),
        description: fixMojibake(media.description || item.description || ""),
      });
    }
  }
  return items;
}

function isPostLikeEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  if (Array.isArray(entry.data)) {
    return true;
  }
  if (typeof entry.title === "string") {
    return true;
  }
  if (Array.isArray(entry.attachments)) {
    return true;
  }
  return false;
}

function isPostArray(entries) {
  if (!Array.isArray(entries)) {
    return false;
  }
  for (const entry of entries) {
    if (isPostLikeEntry(entry)) {
      return true;
    }
  }
  return false;
}

async function sha1Hex(input) {
  const data = new TextEncoder().encode(input);
  if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
    try {
      const digest = await window.crypto.subtle.digest("SHA-1", data);
      return bufferToHex(new Uint8Array(digest));
    } catch (err) {
      return sha1Fallback(data);
    }
  }
  return sha1Fallback(data);
}

function bufferToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Minimal SHA-1 fallback for file:// contexts without crypto.subtle.
function sha1Fallback(bytes) {
  const words = [];
  const byteLength = bytes.length;
  const bitLength = byteLength * 8;
  for (let i = 0; i < byteLength; i += 1) {
    words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }
  words[bitLength >> 5] |= 0x80 << (24 - (bitLength % 32));
  words[((bitLength + 64 >> 9) << 4) + 15] = bitLength;

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;
  let e = 0xc3d2e1f0;

  const w = new Array(80);
  for (let i = 0; i < words.length; i += 16) {
    const oldA = a;
    const oldB = b;
    const oldC = c;
    const oldD = d;
    const oldE = e;

    for (let j = 0; j < 80; j += 1) {
      if (j < 16) {
        w[j] = words[i + j] | 0;
      } else {
        w[j] = rol(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
      }

      const k = j < 20 ? 0x5a827999 : j < 40 ? 0x6ed9eba1 : j < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const f =
        j < 20
          ? (b & c) | (~b & d)
          : j < 40
            ? b ^ c ^ d
            : j < 60
              ? (b & c) | (b & d) | (c & d)
              : b ^ c ^ d;

      const temp = (rol(a, 5) + f + e + k + w[j]) | 0;
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = temp;
    }

    a = (a + oldA) | 0;
    b = (b + oldB) | 0;
    c = (c + oldC) | 0;
    d = (d + oldD) | 0;
    e = (e + oldE) | 0;
  }

  return [a, b, c, d, e].map((val) => (val >>> 0).toString(16).padStart(8, "0")).join("");
}

function rol(value, shift) {
  return (value << shift) | (value >>> (32 - shift));
}

async function buildPost(entry, sourcePath, timestamp, report, mediaIndex) {
  try {
    const textParts = [];
    if (Array.isArray(entry.data)) {
      for (const item of entry.data) {
        if (item && typeof item.post === "string") {
          textParts.push(fixMojibake(item.post));
        }
      }
    }
    const title =
      entry && typeof entry.title === "string" ? fixMojibake(entry.title) : "";
    let text = textParts.join("\n").trim();
    if (!text) {
      text = title || "";
    }
    const permalink = findPermalink(entry);
    const mediaItems = collectMediaItems(entry, mediaIndex);
    const id = await sha1Hex(`${timestamp}\n${text}\n${permalink}`);
    return {
      id,
      createdAt: timestamp * 1000,
      text,
      title,
      permalink,
      media: mediaItems,
      sourcePath,
    };
  } catch (err) {
    report.errors.push(`Post build failed in ${sourcePath}: ${err.message}`);
    return null;
  }
}

function groupPosts(posts) {
  const groups = new Map();
  for (const post of posts) {
    const date = new Date(post.createdAt);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    if (!groups.has(year)) {
      groups.set(year, new Map());
    }
    const monthMap = groups.get(year);
    if (!monthMap.has(month)) {
      monthMap.set(month, []);
    }
    monthMap.get(month).push(post);
  }
  for (const monthMap of groups.values()) {
    for (const list of monthMap.values()) {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }
  }
  return groups;
}

function renderYearList() {
  elements.yearList.innerHTML = "";
  if (!state.groups.size) {
    elements.yearList.textContent = "投稿がありません。";
    return;
  }
  const years = Array.from(state.groups.keys()).sort((a, b) => b - a);
  for (const year of years) {
    const yearGroup = document.createElement("div");
    yearGroup.className = "year-group";
    const title = document.createElement("div");
    title.className = "year-title";
    title.textContent = `${year}年`;
    yearGroup.appendChild(title);

    const monthList = document.createElement("div");
    monthList.className = "month-list";
    const monthMap = state.groups.get(year);
    const months = Array.from(monthMap.keys()).sort((a, b) => b - a);
    for (const month of months) {
      const count = monthMap.get(month).length;
      const button = document.createElement("button");
      button.className = "month-button";
      if (state.selectedYear === year && state.selectedMonth === month) {
        button.classList.add("active");
      }
      button.dataset.year = String(year);
      button.dataset.month = String(month);
      button.textContent = `${month}月 (${count})`;
      monthList.appendChild(button);
    }
    yearGroup.appendChild(monthList);
    elements.yearList.appendChild(yearGroup);
  }
}

function getSelectedPosts() {
  if (!state.selectedYear || !state.selectedMonth) {
    return [];
  }
  const monthMap = state.groups.get(state.selectedYear);
  if (!monthMap) {
    return [];
  }
  return monthMap.get(state.selectedMonth) || [];
}

function applySearch(posts) {
  const term = state.search.trim().toLowerCase();
  if (!term) {
    return posts;
  }
  return posts.filter((post) => (post.text || "").toLowerCase().includes(term));
}

function renderPostsTable() {
  const monthPosts = getSelectedPosts();
  const filtered = applySearch(monthPosts);
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages);

  const start = (state.page - 1) * PAGE_SIZE;
  const pagePosts = filtered.slice(start, start + PAGE_SIZE);

  elements.postsTableBody.innerHTML = "";
  for (const post of pagePosts) {
    const row = document.createElement("tr");
    row.dataset.id = post.id;
    if (state.selectedPostId === post.id) {
      row.classList.add("active");
    }
    const date = new Date(post.createdAt);
    const dateCell = document.createElement("td");
    dateCell.textContent = formatMonthDay(date);
    const summaryCell = document.createElement("td");
    summaryCell.textContent = buildSummary(post.text || "（本文なし）");
    const timeCell = document.createElement("td");
    timeCell.textContent = formatTime(date);
    row.appendChild(dateCell);
    row.appendChild(summaryCell);
    row.appendChild(timeCell);
    elements.postsTableBody.appendChild(row);
  }

  if (!pagePosts.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.textContent = "この選択に投稿はありません。";
    row.appendChild(cell);
    elements.postsTableBody.appendChild(row);
  }

  renderPagination(totalCount, totalPages);
}

function renderPagination(totalCount, totalPages) {
  elements.pagination.innerHTML = "";
  const info = document.createElement("div");
  info.textContent = `合計 ${totalCount} 件`;
  elements.pagination.appendChild(info);

  const prev = document.createElement("button");
  prev.className = "page-button";
  prev.textContent = "前へ";
  prev.disabled = state.page <= 1;
  prev.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    renderPostsTable();
  });
  elements.pagination.appendChild(prev);

  const pageNumbers = buildPageNumbers(totalPages, state.page);
  for (const page of pageNumbers) {
    if (page === "...") {
      const dots = document.createElement("span");
      dots.textContent = "...";
      elements.pagination.appendChild(dots);
      continue;
    }
    const button = document.createElement("button");
    button.className = "page-button";
    if (page === state.page) {
      button.classList.add("active");
    }
    button.textContent = String(page);
    button.addEventListener("click", () => {
      state.page = page;
      renderPostsTable();
    });
    elements.pagination.appendChild(button);
  }

  const next = document.createElement("button");
  next.className = "page-button";
  next.textContent = "次へ";
  next.disabled = state.page >= totalPages;
  next.addEventListener("click", () => {
    state.page = Math.min(totalPages, state.page + 1);
    renderPostsTable();
  });
  elements.pagination.appendChild(next);
}

function buildPageNumbers(totalPages, currentPage) {
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set([1, totalPages]);
  for (let i = currentPage - 2; i <= currentPage + 2; i += 1) {
    if (i > 1 && i < totalPages) {
      pages.add(i);
    }
  }
  const ordered = Array.from(pages).sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < ordered.length; i += 1) {
    result.push(ordered[i]);
    if (i < ordered.length - 1 && ordered[i + 1] !== ordered[i] + 1) {
      result.push("...");
    }
  }
  return result;
}

function renderDetail(post) {
  if (!post) {
    elements.detailDate.textContent = "投稿を選ぶと詳細が表示されます。";
    elements.detailMedia.innerHTML = "";
    elements.detailText.textContent = "";
    elements.detailLink.innerHTML = "";
    return;
  }
  const date = new Date(post.createdAt);
  elements.detailDate.textContent = formatLocalDate(date);
  elements.detailMedia.innerHTML = "";
  if (Array.isArray(post.media) && post.media.length) {
    for (const media of post.media) {
      if (!media.url) {
        continue;
      }
      if (media.type === "video") {
        const video = document.createElement("video");
        video.controls = true;
        video.src = media.url;
        elements.detailMedia.appendChild(video);
      } else {
        const img = document.createElement("img");
        img.src = media.url;
        img.alt = media.title || media.description || "media";
        elements.detailMedia.appendChild(img);
      }
    }
  }
  elements.detailText.textContent = post.text || "（本文なし）";
  elements.detailLink.innerHTML = "";

  if (post.permalink) {
    const link = document.createElement("a");
    link.href = post.permalink;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "リンクを開く";
    elements.detailLink.appendChild(link);
  } else {
    elements.detailLink.textContent = "リンクなし";
  }
}

function renderReport() {
  elements.report.innerHTML = "";
  if (!state.report) {
    elements.report.textContent = "まだデータがありません。";
    return;
  }
  const report = state.report;
  const list = document.createElement("ul");
  list.innerHTML = `
    <li>ZIPファイル数: ${report.zipFiles}</li>
    <li>JSONファイル数: ${report.totalJson}</li>
    <li>投稿として採用: ${report.adopted}</li>
    <li>重複として除外: ${report.duplicates}</li>
    <li>スキップ（パス対象外）: ${report.skipped.path}</li>
    <li>スキップ（配列でない）: ${report.skipped.notArray}</li>
    <li>スキップ（投稿配列でない）: ${report.skipped.notPostArray}</li>
    <li>スキップ（timestampなし）: ${report.skipped.missingTimestamp}</li>
    <li>スキップ（パース失敗）: ${report.skipped.parseFail}</li>
  `;
  elements.report.appendChild(list);

  if (report.errors.length) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `エラー (${report.errors.length})`;
    details.appendChild(summary);
    const pre = document.createElement("pre");
    pre.textContent = report.errors.slice(0, 8).join("\n");
    details.appendChild(pre);
    elements.report.appendChild(details);
  }
}

function renderEmptyState() {
  const hasPosts = state.posts.length > 0;
  elements.emptyPanel.classList.toggle("hidden", hasPosts);
  if (hasPosts) {
    elements.emptyMessage.textContent = "";
    elements.emptyPaths.innerHTML = "";
    return;
  }
  elements.emptyMessage.textContent =
    "投稿データが見つかりませんでした。Facebookで“投稿”を含めてエクスポートしてください。";
  elements.emptyPaths.innerHTML = "";
  if (state.topPaths.length) {
    for (const path of state.topPaths) {
      const badge = document.createElement("span");
      badge.textContent = fixMojibake(path);
      elements.emptyPaths.appendChild(badge);
    }
  }
}

function updateFilterLabel() {
  if (!state.selectedYear || !state.selectedMonth) {
    elements.currentFilter.textContent = "未選択";
    return;
  }
  const count = getSelectedPosts().length;
  elements.currentFilter.textContent = `${state.selectedYear}/${pad2(
    state.selectedMonth
  )} (${count})`;
}

function refreshUI() {
  renderYearList();
  updateFilterLabel();
  renderPostsTable();
  renderDetail(state.postById.get(state.selectedPostId));
  renderReport();
  renderEmptyState();
}

async function parseZip(file) {
  if (!file) {
    return;
  }
  await parseZips([file]);
}

async function parseZips(files) {
  if (!files.length) {
    return;
  }
  if (!window.fflate || !window.fflate.unzipSync) {
    setStatus("fflateが読み込めません。vendor/fflate.min.jsを確認してください。", true);
    return;
  }
  resetState();
  setStatus(`ZIPを読み込み中... (${files.length}件)`);
  elements.parseBtn.disabled = true;

  const report = {
    zipFiles: files.length,
    totalJson: 0,
    adopted: 0,
    duplicates: 0,
    skipped: {
      path: 0,
      notArray: 0,
      notPostArray: 0,
      missingTimestamp: 0,
      parseFail: 0,
    },
    errors: [],
  };

  const postPromises = [];
  const topPaths = new Set();
  const mediaIndex = new Map();

  for (const file of files) {
    let entries;
    try {
      const buffer = await file.arrayBuffer();
      entries = window.fflate.unzipSync(new Uint8Array(buffer));
    } catch (err) {
      report.errors.push(`ZIP読み込み失敗: ${file.name} (${err.message})`);
      continue;
    }

    const fileNames = Object.keys(entries);
    // First pass: register all media files
    for (const rawPath of fileNames) {
      const path = normalizePath(rawPath);
      if (isMediaFile(path)) {
        const key = path.toLowerCase();
        if (!mediaIndex.has(key)) {
          mediaIndex.set(key, {
            path,
            data: entries[rawPath],
            url: "",
            mime: "",
          });
        }
      }
    }

    // Second pass: process JSON files
    for (const rawPath of fileNames) {
      const path = normalizePath(rawPath);
      const topSegment = path.split("/")[0];
      if (topSegment) {
        topPaths.add(topSegment);
      }
      if (!path.toLowerCase().endsWith(".json")) {
        continue;
      }
      report.totalJson += 1;
      if (!isTargetPostPath(path)) {
        report.skipped.path += 1;
        continue;
      }
      let jsonText = "";
      try {
        jsonText = new TextDecoder("utf-8").decode(entries[rawPath]);
      } catch (err) {
        report.skipped.parseFail += 1;
        report.errors.push(`デコード失敗: ${path}`);
        continue;
      }
      let parsed = null;
      try {
        parsed = JSON.parse(jsonText);
      } catch (err) {
        report.skipped.parseFail += 1;
        report.errors.push(`パース失敗: ${path}`);
        continue;
      }
      if (!Array.isArray(parsed)) {
        report.skipped.notArray += 1;
        continue;
      }
      if (!isPostArray(parsed)) {
        report.skipped.notPostArray += 1;
        continue;
      }
      for (const entry of parsed) {
        const rawTimestamp = entry && entry.timestamp;
        const timestamp =
          typeof rawTimestamp === "number" ? rawTimestamp : Number(rawTimestamp);
        if (!Number.isFinite(timestamp)) {
          report.skipped.missingTimestamp += 1;
          continue;
        }
        postPromises.push(buildPost(entry, path, timestamp, report, mediaIndex));
      }
    }
  }

  const rawPosts = (await Promise.all(postPromises)).filter(Boolean);
  const uniquePosts = [];
  const postById = new Map();
  for (const post of rawPosts) {
    if (postById.has(post.id)) {
      report.duplicates += 1;
      continue;
    }
    postById.set(post.id, post);
    uniquePosts.push(post);
  }

  uniquePosts.sort((a, b) => b.createdAt - a.createdAt);
  state.posts = uniquePosts;
  state.postById = postById;
  state.groups = groupPosts(uniquePosts);
  state.report = report;
  state.topPaths = Array.from(topPaths).sort();
  state.mediaIndex = mediaIndex;
  report.adopted = uniquePosts.length;

  const years = Array.from(state.groups.keys()).sort((a, b) => b - a);
  if (years.length) {
    state.selectedYear = years[0];
    const months = Array.from(state.groups.get(state.selectedYear).keys()).sort(
      (a, b) => b - a
    );
    state.selectedMonth = months[0];
  }

  setStatus(`投稿 ${uniquePosts.length} 件を読み込みました。`);
  elements.parseBtn.disabled = false;
  refreshUI();
}

elements.zipInput.addEventListener("change", () => {
  const files = Array.from(elements.zipInput.files || []);
  if (files.length) {
    const label =
      files.length === 1 ? files[0].name : `${files.length}件のZIP`;
    setStatus(`準備完了: ${label}`);
    elements.parseBtn.disabled = false;
  } else {
    setStatus("ZIP未選択");
    elements.parseBtn.disabled = true;
  }
});

elements.parseBtn.addEventListener("click", async () => {
  const files = Array.from(elements.zipInput.files || []);
  await parseZips(files);
});

elements.yearList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (!target.dataset.year || !target.dataset.month) {
    return;
  }
  state.selectedYear = Number(target.dataset.year);
  state.selectedMonth = Number(target.dataset.month);
  state.page = 1;
  state.selectedPostId = null;
  refreshUI();
});

elements.postsTableBody.addEventListener("click", (event) => {
  const target = event.target;
  const row = target instanceof HTMLElement ? target.closest("tr") : null;
  if (!row) {
    return;
  }
  const id = row.dataset.id;
  if (!id) {
    return;
  }
  state.selectedPostId = id;
  renderPostsTable();
  renderDetail(state.postById.get(id));
});

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value || "";
  state.page = 1;
  renderPostsTable();
  updateFilterLabel();
});

elements.summaryLength.addEventListener("change", (event) => {
  const value = Number(event.target.value);
  if (Number.isFinite(value) && value > 0) {
    state.summaryLength = value;
    renderPostsTable();
  }
});
