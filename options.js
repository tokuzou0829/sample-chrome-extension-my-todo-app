const API_BASE_PATH = "/api/developer/v1";

const elements = {
  form: document.getElementById("settingsForm"),
  appUrl: document.getElementById("appUrl"),
  apiKey: document.getElementById("apiKey"),
  saveButton: document.getElementById("saveButton"),
  revealButton: document.getElementById("revealButton"),
  message: document.getElementById("message"),
  userCard: document.getElementById("userCard"),
  userImage: document.getElementById("userImage"),
  userName: document.getElementById("userName"),
  userEmail: document.getElementById("userEmail"),
};

document.addEventListener("DOMContentLoaded", init);
elements.form.addEventListener("submit", handleSubmit);
elements.revealButton.addEventListener("click", toggleApiKeyVisibility);

async function init() {
  const stored = await chrome.storage.local.get(["appUrl", "apiKey", "user"]);
  elements.appUrl.value = stored.appUrl || "";
  elements.apiKey.value = stored.apiKey || "";
  renderUser(stored.user || null);
}

async function handleSubmit(event) {
  event.preventDefault();

  const appUrl = normalizeAppUrl(elements.appUrl.value);
  const apiKey = elements.apiKey.value.trim();

  if (!appUrl) {
    setMessage("有効なアプリケーションURLを入力してください。", "error");
    return;
  }
  if (!apiKey) {
    setMessage("APIキーを入力してください。", "error");
    return;
  }

  setSaving(true);
  setMessage("APIキーを確認しています...", "");
  renderUser(null);

  try {
    const user = await verifyApiKey(appUrl, apiKey);
    await chrome.storage.local.set({ appUrl, apiKey, user });
    elements.appUrl.value = appUrl;
    renderUser(user);
    setMessage("設定を保存しました。", "success");
  } catch (error) {
    await chrome.storage.local.remove(["user"]);
    setMessage(error.message || "APIキーの確認に失敗しました。", "error");
  } finally {
    setSaving(false);
  }
}

async function verifyApiKey(appUrl, apiKey) {
  const response = await fetch(`${appUrl}${API_BASE_PATH}/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "APIキーが無効、またはアプリケーションURLが正しくありません。"));
  }

  const json = await response.json();
  if (!json?.user?.id) {
    throw new Error("ユーザー情報を取得できませんでした。");
  }
  return json.user;
}

function renderUser(user) {
  elements.userCard.classList.toggle("hidden", !user);
  if (!user) {
    elements.userImage.removeAttribute("src");
    elements.userName.textContent = "";
    elements.userEmail.textContent = "";
    return;
  }

  elements.userImage.src = user.image || makeAvatarDataUrl(user.name || user.email || "User");
  elements.userName.textContent = user.name || "No name";
  elements.userEmail.textContent = user.email || "No email";
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

function normalizeAppUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function toggleApiKeyVisibility() {
  const shouldShow = elements.apiKey.type === "password";
  elements.apiKey.type = shouldShow ? "text" : "password";
  elements.revealButton.textContent = shouldShow ? "APIキーを隠す" : "APIキーを表示";
}

function setSaving(isSaving) {
  elements.saveButton.disabled = isSaving;
  elements.saveButton.textContent = isSaving ? "確認中..." : "保存して確認";
}

function setMessage(text, type) {
  elements.message.textContent = text;
  elements.message.className = `message${type ? ` ${type}` : ""}`;
}

function makeAvatarDataUrl(name) {
  const initial = Array.from(name.trim())[0] || "U";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#d9f99d"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="40" font-weight="700" fill="#1a2e05">${escapeSvg(initial.toUpperCase())}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeSvg(value) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}
