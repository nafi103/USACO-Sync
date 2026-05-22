const fields = {
  codeforces: document.getElementById("codeforces"),
  autoSync: document.getElementById("autoSync"),
  syncInterval: document.getElementById("syncInterval"),
  status: document.getElementById("status"),
  save: document.getElementById("save"),
  syncNow: document.getElementById("syncNow")
};

document.addEventListener("DOMContentLoaded", load);
fields.save.addEventListener("click", saveSettings);
fields.syncNow.addEventListener("click", syncNow);

async function load() {
  const response = await send({ type: "GET_SETTINGS" });
  if (!response.ok) {
    renderError(response.error || "Could not load settings.");
    return;
  }

  renderSettings(response.settings);
  renderProgress(response.progress);
}

function renderSettings(settings) {
  fields.codeforces.value = settings.handles.codeforces || "";
  fields.autoSync.checked = settings.autoSync;
  fields.syncInterval.value = settings.syncIntervalMinutes;
}

async function saveSettings() {
  setBusy(true);
  const settings = readSettings();
  const response = await send({ type: "SAVE_SETTINGS", settings });
  setBusy(false);

  if (!response.ok) {
    renderError(response.error || "Could not save settings.");
    return;
  }

  renderSettings(response.settings);
  fields.status.textContent = "Settings saved.";
}

async function syncNow() {
  setBusy(true);
  fields.status.textContent = "Syncing...";
  const saveResponse = await send({ type: "SAVE_SETTINGS", settings: readSettings() });
  if (!saveResponse.ok) {
    setBusy(false);
    renderError(saveResponse.error || "Could not save settings before sync.");
    return;
  }

  const syncResponse = await send({ type: "SYNC_NOW" });
  setBusy(false);

  if (!syncResponse.ok) {
    renderError(syncResponse.error || "Sync failed.");
    return;
  }

  renderProgress(syncResponse.progress);
}

function readSettings() {
  return {
    handles: {
      codeforces: fields.codeforces.value
    },
    autoSync: fields.autoSync.checked,
    syncIntervalMinutes: Number(fields.syncInterval.value)
  };
}

function renderProgress(progress) {
  if (!progress || !progress.updatedAt) {
    fields.status.textContent = "No sync has run yet.";
    return;
  }

  const providers = progress.providers || {};
  const problemCount = Object.keys(progress.problems || {}).length;
  const updated = new Date(progress.updatedAt).toLocaleString();

  fields.status.replaceChildren(
    textNode(`Last sync: ${updated}. Tracked problems: ${problemCount}.`),
    providerStatus("codeforces", providers.codeforces)
  );
}

function providerStatus(provider, state) {
  const node = document.createElement("div");
  const title = document.createElement("strong");
  const details = document.createElement("span");
  node.className = "provider";

  title.textContent = providerLabel(provider);
  if (!state) {
    details.textContent = "Not synced.";
  } else if (state.status === "ok") {
    details.textContent = `${state.solvedCount} solved, ${state.attemptedCount} attempted.`;
  } else {
    details.textContent = state.error || state.note || state.status;
  }

  node.append(title, details);
  return node;
}

function renderError(message) {
  fields.status.textContent = message;
}

function textNode(text) {
  const node = document.createElement("div");
  node.textContent = text;
  return node;
}

function providerLabel(provider) {
  if (provider === "codeforces") return "Codeforces";
  return provider;
}

function setBusy(isBusy) {
  fields.save.disabled = isBusy;
  fields.syncNow.disabled = isBusy;
}

async function send(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
