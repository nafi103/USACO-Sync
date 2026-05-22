(function () {
  const BADGE_CLASS = "usaco-sync-badge";
  const LINK_CLASS = "usaco-sync-link";
  const ANNOTATED_ATTR = "data-usaco-sync-key";
  const PROGRESS_KEY = "usacoSync.progress";
  const SELECTOR = [
    'a[href*="codeforces.com/"]'
  ].join(",");

  let progress = null;
  let annotateTimer = null;

  init();

  async function init() {
    progress = await requestProgress();
    annotatePage();
    observePage();
    listenForSyncUpdates();
    listenForVisibilityRefresh();
  }

  async function requestProgress() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_PROGRESS" });
      return response && response.ok ? response.progress : emptyProgress();
    } catch (error) {
      console.warn("[USACO Sync] Could not load progress", error);
      return emptyProgress();
    }
  }

  function emptyProgress() {
    return {
      updatedAt: null,
      providers: {},
      problems: {}
    };
  }

  function observePage() {
    const observer = new MutationObserver(scheduleAnnotate);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function listenForVisibilityRefresh() {
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible") return;
      progress = await requestProgress();
      annotatePage();
    });
  }

  function listenForSyncUpdates() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[PROGRESS_KEY]) return;
      progress = changes[PROGRESS_KEY].newValue || emptyProgress();
      scheduleAnnotate();
    });
  }

  function scheduleAnnotate() {
    window.clearTimeout(annotateTimer);
    annotateTimer = window.setTimeout(annotatePage, 120);
  }

  function annotatePage() {
    if (!progress) return;

    const problems = progress.problems || {};
    for (const anchor of document.querySelectorAll(SELECTOR)) {
      const problem = parseProblemLink(anchor.href);
      if (!problem) continue;

      const status = problems[problem.key];
      anchor.setAttribute(ANNOTATED_ATTR, problem.key);
      anchor.classList.add(LINK_CLASS);
      setBadge(anchor, status, problem);
    }
  }

  function setBadge(anchor, status, problem) {
    let badge = getBadge(anchor);

    if (!status) {
      if (badge) badge.remove();
      anchor.classList.remove("usaco-sync-solved", "usaco-sync-attempted", "usaco-sync-unsupported");
      return;
    }

    if (!badge) {
      badge = document.createElement("span");
      badge.className = BADGE_CLASS;
      anchor.insertAdjacentElement("afterend", badge);
    }

    const state = status.status === "solved" ? "solved" : "attempted";
    const providerName = providerLabel(problem.provider);
    const time = status.solvedAt || status.attemptedAt || null;
    const action = state === "solved" ? "Solved" : "Attempted";

    badge.dataset.state = state;
    badge.textContent = state === "solved" ? "✓" : "!";
    badge.title = `${action} on ${providerName}${time ? ` (${new Date(time).toLocaleDateString()})` : ""}`;

    anchor.classList.toggle("usaco-sync-solved", state === "solved");
    anchor.classList.toggle("usaco-sync-attempted", state === "attempted");
    anchor.classList.remove("usaco-sync-unsupported");
  }

  function getBadge(anchor) {
    const next = anchor.nextElementSibling;
    return next && next.classList.contains(BADGE_CLASS) ? next : null;
  }

  function parseProblemLink(rawHref) {
    let url;
    try {
      url = new URL(rawHref);
    } catch {
      return null;
    }

    const host = url.hostname.replace(/^www\./, "");
    const parts = url.pathname.split("/").filter(Boolean);

    if (host === "codeforces.com") {
      return parseCodeforces(parts);
    }

    return null;
  }

  function parseCodeforces(parts) {
    let contestId = "";
    let index = "";

    if (parts[0] === "problemset" && parts[1] === "problem" && parts.length >= 4) {
      contestId = parts[2];
      index = parts[3];
    } else if (parts[0] === "contest" && parts[2] === "problem" && parts.length >= 4) {
      contestId = parts[1];
      index = parts[3];
    } else if (parts[0] === "gym" && parts[2] === "problem" && parts.length >= 4) {
      contestId = parts[1];
      index = parts[3];
    }

    if (!contestId || !index) return null;

    return {
      provider: "codeforces",
      key: `codeforces:${contestId}:${index.toUpperCase()}`
    };
  }

  function providerLabel(provider) {
    if (provider === "codeforces") return "Codeforces";
    return provider;
  }
})();
