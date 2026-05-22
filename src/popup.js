const statusNode = document.getElementById("status");
const syncButton = document.getElementById("syncNow");
const optionsButton = document.getElementById("options");

document.addEventListener("DOMContentLoaded", load);
syncButton.addEventListener("click", syncNow);
optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

async function load() {
  const response = await send({ type: "GET_SETTINGS" });
  if (!response.ok) {
    statusNode.textContent = response.error || "Could not load status.";
    return;
  }

  render(response.progress, response.settings);
}

async function syncNow() {
  syncButton.disabled = true;
  statusNode.textContent = "Syncing...";
  const response = await send({ type: "SYNC_NOW" });
  syncButton.disabled = false;

  if (!response.ok) {
    statusNode.textContent = response.error || "Sync failed.";
    return;
  }

  const settingsResponse = await send({ type: "GET_SETTINGS" });
  render(response.progress, settingsResponse.settings);
}

function render(progress, settings) {
  const handles = settings && settings.handles ? settings.handles : {};
  const active = [handles.codeforces].filter(Boolean).length;

  if (!progress || !progress.updatedAt) {
    statusNode.textContent = active ? "Ready to sync." : "Add handles in options.";
    return;
  }

  const solved = Object.values(progress.problems || {}).filter((problem) => problem.status === "solved").length;
  statusNode.textContent = `${solved} solved problems loaded. Last sync: ${new Date(progress.updatedAt).toLocaleString()}.`;
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
