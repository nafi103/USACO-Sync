const STORAGE_KEYS = {
  settings: "usacoSync.settings",
  progress: "usacoSync.progress"
};

const DEFAULT_SETTINGS = {
  autoSync: true,
  syncIntervalMinutes: 60,
  handles: {
    codeforces: ""
  }
};

const ALARM_NAME = "usacoSync.periodicSync";
const CODEFORCES_API = "https://codeforces.com/api/user.status";
const SUPPORTED_PROVIDERS = new Set(["codeforces"]);

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await ensureAlarm(settings);
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  await ensureAlarm(settings);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  const settings = await getSettings();
  if (!settings.autoSync) return;

  await syncAll({ reason: "alarm" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

async function handleMessage(message) {
  if (!message || typeof message.type !== "string") {
    return { ok: false, error: "Unknown message" };
  }

  if (message.type === "GET_SETTINGS") {
    return { ok: true, settings: await getSettings(), progress: await getProgress() };
  }

  if (message.type === "SAVE_SETTINGS") {
    const settings = normalizeSettings(message.settings);
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
    await ensureAlarm(settings);
    return { ok: true, settings };
  }

  if (message.type === "GET_PROGRESS") {
    return { ok: true, progress: await getProgress() };
  }

  if (message.type === "SYNC_NOW") {
    return { ok: true, progress: await syncAll({ reason: "manual" }) };
  }

  return { ok: false, error: `Unsupported message type: ${message.type}` };
}

async function getSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return normalizeSettings(stored[STORAGE_KEYS.settings]);
}

function normalizeSettings(value) {
  const raw = value && typeof value === "object" ? value : {};
  const rawHandles = raw.handles && typeof raw.handles === "object" ? raw.handles : {};
  const interval = Number(raw.syncIntervalMinutes);

  return {
    autoSync: raw.autoSync !== false,
    syncIntervalMinutes: Number.isFinite(interval) && interval >= 15 ? interval : DEFAULT_SETTINGS.syncIntervalMinutes,
    handles: {
      codeforces: cleanHandle(rawHandles.codeforces)
    }
  };
}

function cleanHandle(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function getProgress() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.progress);
  const progress = stored[STORAGE_KEYS.progress];
  if (!progress || typeof progress !== "object") {
    return emptyProgress();
  }

  return filterSupportedProgress({
    ...emptyProgress(),
    ...progress,
    providers: progress.providers && typeof progress.providers === "object" ? progress.providers : {},
    problems: progress.problems && typeof progress.problems === "object" ? progress.problems : {}
  });
}

function emptyProgress() {
  return {
    updatedAt: null,
    providers: {},
    problems: {}
  };
}

function filterSupportedProgress(progress) {
  const providers = {};
  const problems = {};

  for (const [provider, state] of Object.entries(progress.providers || {})) {
    if (SUPPORTED_PROVIDERS.has(provider)) {
      providers[provider] = state;
    }
  }

  for (const [key, problem] of Object.entries(progress.problems || {})) {
    if (problem && SUPPORTED_PROVIDERS.has(problem.provider)) {
      problems[key] = problem;
    }
  }

  return {
    ...progress,
    providers,
    problems
  };
}

async function ensureAlarm(settings) {
  await chrome.alarms.clear(ALARM_NAME);

  if (!settings.autoSync) return;

  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: settings.syncIntervalMinutes
  });
}

async function syncAll({ reason }) {
  const settings = await getSettings();
  const syncedAt = new Date().toISOString();
  const providerResults = [];

  if (settings.handles.codeforces) {
    providerResults.push(await safeSyncProvider("codeforces", settings.handles.codeforces, syncCodeforces));
  } else {
    providerResults.push(skippedProvider("codeforces", "Add a Codeforces handle in extension options."));
  }

  const problems = mergeProviderProblems(providerResults);
  const providers = {};

  for (const result of providerResults) {
    providers[result.provider] = {
      handle: result.handle || "",
      status: result.status,
      updatedAt: syncedAt,
      solvedCount: result.solved ? Object.keys(result.solved).length : 0,
      attemptedCount: result.attempted ? Object.keys(result.attempted).length : 0,
      error: result.error || "",
      note: result.note || ""
    };
  }

  const progress = {
    updatedAt: syncedAt,
    reason,
    providers,
    problems
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.progress]: progress });
  return progress;
}

async function safeSyncProvider(provider, handle, syncer) {
  try {
    return await syncer(handle);
  } catch (error) {
    return {
      provider,
      handle,
      status: "error",
      solved: {},
      attempted: {},
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function skippedProvider(provider, note) {
  return {
    provider,
    handle: "",
    status: "skipped",
    solved: {},
    attempted: {},
    note
  };
}

async function syncCodeforces(handle) {
  const url = new URL(CODEFORCES_API);
  url.searchParams.set("handle", handle);

  const data = await fetchJson(url.toString());
  if (data.status !== "OK") {
    throw new Error(data.comment || "Codeforces API returned a failed response.");
  }

  const solved = {};
  const attempted = {};

  for (const submission of Array.isArray(data.result) ? data.result : []) {
    const problem = submission.problem || {};
    if (!problem.contestId || !problem.index) continue;

    const key = codeforcesKey(problem.contestId, problem.index);
    if (!key) continue;

    if (submission.verdict === "OK") {
      solved[key] = {
        provider: "codeforces",
        status: "solved",
        solvedAt: epochToIso(submission.creationTimeSeconds),
        name: problem.name || "",
        url: codeforcesProblemUrl(problem.contestId, problem.index)
      };
      delete attempted[key];
    } else if (!solved[key] && !attempted[key]) {
      attempted[key] = {
        provider: "codeforces",
        status: "attempted",
        attemptedAt: epochToIso(submission.creationTimeSeconds),
        name: problem.name || "",
        url: codeforcesProblemUrl(problem.contestId, problem.index)
      };
    }
  }

  return {
    provider: "codeforces",
    handle,
    status: "ok",
    solved,
    attempted
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}.`);
  }

  return response.json();
}

function mergeProviderProblems(providerResults) {
  const problems = {};

  for (const result of providerResults) {
    for (const [key, value] of Object.entries(result.attempted || {})) {
      problems[key] = value;
    }

    for (const [key, value] of Object.entries(result.solved || {})) {
      problems[key] = value;
    }
  }

  return problems;
}

function codeforcesKey(contestId, index) {
  const cleanContest = String(contestId || "").trim();
  const cleanIndex = String(index || "").trim().toUpperCase();
  return cleanContest && cleanIndex ? `codeforces:${cleanContest}:${cleanIndex}` : null;
}

function codeforcesProblemUrl(contestId, index) {
  return `https://codeforces.com/problemset/problem/${encodeURIComponent(contestId)}/${encodeURIComponent(index)}`;
}

function epochToIso(epochSeconds) {
  const value = Number(epochSeconds);
  if (!Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}
