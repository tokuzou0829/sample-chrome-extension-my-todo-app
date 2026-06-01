const API_BASE_PATH = "/api/developer/v1";
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const elements = {
  form: document.getElementById("scrapForm"),
  title: document.getElementById("title"),
  maybeScrap: document.getElementById("maybeScrap"),
  comment: document.getElementById("comment"),
  sourceUrl: document.getElementById("sourceUrl"),
  images: document.getElementById("images"),
  imagePreview: document.getElementById("imagePreview"),
  imageCount: document.getElementById("imageCount"),
  isPrivate: document.getElementById("isPrivate"),
  saveButton: document.getElementById("saveButton"),
  message: document.getElementById("message"),
  setupNotice: document.getElementById("setupNotice"),
  setupButton: document.getElementById("setupButton"),
};

let settings = null;
let currentTab = null;
let selectedImages = [];
let objectUrls = [];
let maybeCoverObjectUrl = "";

document.addEventListener("DOMContentLoaded", init);
elements.form.addEventListener("submit", handleSubmit);
elements.images.addEventListener("change", handleImagesChange);
elements.setupButton.addEventListener("click", openOptionsPage);

async function init() {
  settings = await loadSettings();
  currentTab = await getCurrentTab();
  fillCurrentPage(currentTab);
  renderSetupState();
  await searchExistingScrap();
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(["appUrl", "apiKey", "user"]);
  return {
    appUrl: stored.appUrl || "",
    apiKey: stored.apiKey || "",
    user: stored.user || null,
  };
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function fillCurrentPage(tab) {
  const url = isHttpUrl(tab?.url) ? tab.url : "";

  elements.title.value = url;
  elements.sourceUrl.textContent = url || "このページはURL付きスクラップにできません";
  elements.sourceUrl.title = url;
}

function renderSetupState() {
  const isConfigured = Boolean(settings?.appUrl && settings?.apiKey);
  document.body.classList.toggle("needs-setup", !isConfigured);
  elements.setupNotice.classList.toggle("hidden", isConfigured);
  elements.saveButton.disabled = !isConfigured;
  if (!isConfigured) {
    setMessage("", "");
  }
}

async function searchExistingScrap() {
  const sourceUrl = isHttpUrl(currentTab?.url) ? currentTab.url : "";
  if (!settings?.appUrl || !settings?.apiKey || !sourceUrl) {
    renderMaybeScrap(null);
    return;
  }

  const youtubeId = extractYoutubeId(sourceUrl);
  const query = youtubeId || sourceUrl;

  const params = new URLSearchParams({
    page: "1",
    perPage: "3",
    q: query,
  });

  try {
    const response = await fetch(`${settings.appUrl}${API_BASE_PATH}/scraps?${params}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
      },
    });

    if (!response.ok) {
      renderMaybeScrap(null);
      return;
    }

    const json = await response.json();
    const scraps = Array.isArray(json?.scraps) ? json.scraps : [];
    const scrap = findBestScrapMatch(scraps, sourceUrl, youtubeId);
    await renderMaybeScrap(scrap);
  } catch {
    renderMaybeScrap(null);
  }
}

function findBestScrapMatch(scraps, sourceUrl, youtubeId) {
  if (youtubeId) {
    return scraps.find((item) => scrapContains(item, youtubeId)) || scraps[0] || null;
  }

  return scraps.find((item) => item.sourceUrl === sourceUrl || item.title === sourceUrl) || scraps[0] || null;
}

function scrapContains(scrap, value) {
  return [scrap.sourceUrl, scrap.title, scrap.body]
    .filter(Boolean)
    .some((text) => String(text).includes(value));
}

async function renderMaybeScrap(scrap) {
  revokeMaybeCoverObjectUrl();
  elements.maybeScrap.textContent = "";
  elements.maybeScrap.classList.toggle("hidden", !scrap);
  if (!scrap) {
    return;
  }

  const label = document.createElement("p");
  label.className = "maybe-label";
  label.textContent = "もしかしてこれ?";

  const link = document.createElement("a");
  link.className = "maybe-card";
  link.href = `${settings.appUrl}/scraps/${scrap.id}`;
  link.target = "_blank";
  link.rel = "noreferrer";

  const coverUrl = getScrapCoverUrl(scrap);
  const coverSrc = coverUrl ? await getDisplayableCoverSrc(coverUrl) : "";
  if (coverSrc) {
    const cover = document.createElement("img");
    cover.className = "maybe-cover";
    cover.src = coverSrc;
    cover.alt = scrap.linkPreview?.imageAlt || scrap.title || "スクラップのカバー画像";
    link.append(cover);
  }

  const body = document.createElement("span");
  body.className = "maybe-body";

  const title = document.createElement("strong");
  title.textContent = scrap.title || scrap.sourceUrl || "スクラップ";

  const meta = document.createElement("span");
  meta.textContent = [formatHost(scrap.sourceUrl || scrap.title), formatDate(scrap.createdAt)].filter(Boolean).join(" ・ ");

  body.append(title, meta);
  link.append(body);
  elements.maybeScrap.append(label, link);
}

function getScrapCoverUrl(scrap) {
  return scrap.linkPreview?.imageUrl || scrap.attachments?.[0]?.url || "";
}

async function getDisplayableCoverSrc(value) {
  const coverUrl = toAbsoluteUrl(value);
  if (!coverUrl) {
    return "";
  }

  if (!coverUrl.startsWith(settings.appUrl)) {
    return coverUrl;
  }

  try {
    const response = await fetch(coverUrl, {
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
      },
    });
    if (!response.ok) {
      return "";
    }

    const blob = await response.blob();
    maybeCoverObjectUrl = URL.createObjectURL(blob);
    return maybeCoverObjectUrl;
  } catch {
    return "";
  }
}

function toAbsoluteUrl(value) {
  if (!value) {
    return "";
  }
  if (isHttpUrl(value)) {
    return value;
  }

  try {
    return new URL(value, settings.appUrl).toString();
  } catch {
    return "";
  }
}

function revokeMaybeCoverObjectUrl() {
  if (!maybeCoverObjectUrl) {
    return;
  }
  URL.revokeObjectURL(maybeCoverObjectUrl);
  maybeCoverObjectUrl = "";
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!settings?.appUrl || !settings?.apiKey) {
    setMessage("設定が未完了です。", "error");
    openOptionsPage();
    return;
  }

  const sourceUrl = isHttpUrl(currentTab?.url) ? currentTab.url : "";
  const title = sourceUrl;
  const body = elements.comment.value.trim();

  if (!title && !body && !sourceUrl && selectedImages.length === 0) {
    setMessage("タイトル、コメント、URL、写真のいずれかを入力してください。", "error");
    return;
  }

  const formData = new FormData();
  if (title) formData.append("title", title);
  if (body) formData.append("body", body);
  if (sourceUrl) formData.append("sourceUrl", sourceUrl);
  formData.append("isPrivate", String(elements.isPrivate.checked));
  for (const image of selectedImages) {
    formData.append("images", image, image.name);
  }

  setSaving(true);
  setMessage("保存しています...", "");

  try {
    const response = await fetch(`${settings.appUrl}${API_BASE_PATH}/scraps`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, "スクラップの保存に失敗しました。"));
    }

    setMessage("スクラップに保存しました。", "success");
    elements.comment.value = "";
    elements.isPrivate.checked = false;
    selectedImages = [];
    elements.images.value = "";
    renderImages();
    await searchExistingScrap();
  } catch (error) {
    setMessage(error.message || "スクラップの保存に失敗しました。", "error");
  } finally {
    setSaving(false);
  }
}

function handleImagesChange(event) {
  const files = Array.from(event.target.files || []);
  const nextImages = [...selectedImages];
  let warning = "";

  for (const file of files) {
    if (!file.type.startsWith("image/") && !isHeicFile(file)) {
      warning = "画像ファイルだけ添付できます。";
      continue;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      warning = "画像は1枚あたり8MBまでです。";
      continue;
    }
    if (nextImages.length >= MAX_IMAGES) {
      warning = "画像は1投稿につき4枚までです。";
      break;
    }
    nextImages.push(file);
  }

  selectedImages = nextImages;
  elements.images.value = "";
  renderImages();

  if (warning) {
    setMessage(warning, "error");
  } else {
    setMessage("", "");
  }
}

function renderImages() {
  for (const url of objectUrls) {
    URL.revokeObjectURL(url);
  }
  objectUrls = [];
  elements.imagePreview.textContent = "";
  elements.imagePreview.classList.toggle("hidden", selectedImages.length === 0);
  elements.imageCount.textContent = selectedImages.length ? `${selectedImages.length}/4枚` : "最大4枚";

  selectedImages.forEach((file, index) => {
    const url = URL.createObjectURL(file);
    objectUrls.push(url);

    const card = document.createElement("div");
    card.className = "preview-card";

    const image = document.createElement("img");
    image.src = url;
    image.alt = file.name;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "remove-image";
    button.setAttribute("aria-label", `${file.name} を外す`);
    button.textContent = "×";
    button.addEventListener("click", () => {
      selectedImages = selectedImages.filter((_, currentIndex) => currentIndex !== index);
      renderImages();
    });

    card.append(image, button);
    elements.imagePreview.append(card);
  });
}

function setSaving(isSaving) {
  elements.saveButton.disabled = isSaving || !settings?.appUrl || !settings?.apiKey;
  elements.saveButton.textContent = isSaving ? "保存中..." : "保存";
}

function setMessage(text, type) {
  elements.message.textContent = text;
  elements.message.className = `message${type ? ` ${type}` : ""}`;
}

async function getErrorMessage(response, fallback) {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") {
    return body.error;
  }
  if (body?.error?.message && typeof body.error.message === "string") {
    return body.error.message;
  }
  return fallback;
}

function openOptionsPage() {
  chrome.runtime.openOptionsPage();
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function isHeicFile(file) {
  return /\.(heic|heif)$/i.test(file.name);
}

function extractYoutubeId(value) {
  if (!isHttpUrl(value)) {
    return "";
  }

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return sanitizeYoutubeId(url.pathname.split("/").filter(Boolean)[0] || "");
    }

    if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") {
      return "";
    }

    const watchId = url.searchParams.get("v");
    if (watchId) {
      return sanitizeYoutubeId(watchId);
    }

    const [firstSegment, secondSegment] = url.pathname.split("/").filter(Boolean);
    if (["shorts", "embed", "live"].includes(firstSegment)) {
      return sanitizeYoutubeId(secondSegment || "");
    }
  } catch {
    return "";
  }

  return "";
}

function sanitizeYoutubeId(value) {
  const match = value.match(/^[A-Za-z0-9_-]{6,}$/);
  return match ? match[0] : "";
}

function formatHost(value) {
  if (!isHttpUrl(value)) {
    return "";
  }

  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
