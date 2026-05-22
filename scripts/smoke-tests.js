const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  await testCodeforcesSync();
  await testProgressFiltering();
  await testFailedSyncShape();
  console.log("Smoke tests passed.");
}

async function testCodeforcesSync() {
  const storage = {
    "usacoSync.settings": {
      autoSync: true,
      syncIntervalMinutes: 60,
      handles: {
        codeforces: "tourist"
      }
    }
  };
  const context = loadBackground({
    storage,
    fetch: async () => ({
      ok: true,
      json: async () => ({
        status: "OK",
        result: [
          {
            creationTimeSeconds: 1700000000,
            verdict: "WRONG_ANSWER",
            problem: {
              contestId: 1,
              index: "A",
              name: "Theatre Square"
            }
          },
          {
            creationTimeSeconds: 1700000123,
            verdict: "OK",
            problem: {
              contestId: 1,
              index: "A",
              name: "Theatre Square"
            }
          }
        ]
      })
    })
  });

  const progress = await context.syncAll({ reason: "manual" });
  assert.strictEqual(progress.providers.codeforces.status, "ok");
  assert.strictEqual(progress.providers.codeforces.solvedCount, 1);
  assert.strictEqual(progress.providers.codeforces.attemptedCount, 0);
  assert.strictEqual(progress.problems["codeforces:1:A"].status, "solved");
}

async function testProgressFiltering() {
  const storage = {
    "usacoSync.progress": {
      updatedAt: "2026-05-22T00:00:00.000Z",
      providers: {
        codeforces: { handle: "tourist", status: "ok" },
        legacy: { handle: "tourist", status: "ok" }
      },
      problems: {
        "codeforces:1:A": { provider: "codeforces", status: "solved" },
        "legacy:sample": { provider: "legacy", status: "solved" }
      }
    }
  };
  const context = loadBackground({ storage });
  const progress = await context.getProgress();

  assert(progress.providers.codeforces);
  assert(!progress.providers.legacy);
  assert(progress.problems["codeforces:1:A"]);
  assert(!progress.problems["legacy:sample"]);
}

async function testFailedSyncShape() {
  const storage = {
    "usacoSync.settings": {
      autoSync: true,
      syncIntervalMinutes: 60,
      handles: {
        codeforces: "missing"
      }
    }
  };
  const context = loadBackground({
    storage,
    fetch: async () => ({
      ok: true,
      json: async () => ({
        status: "FAILED",
        comment: "handle: User with handle missing not found"
      })
    })
  });

  const progress = await context.syncAll({ reason: "manual" });
  assert.strictEqual(progress.providers.codeforces.status, "error");
  assert.match(progress.providers.codeforces.error, /not found/i);
  assert.strictEqual(Object.keys(progress.problems).length, 0);
}

function loadBackground({ storage = {}, fetch = async () => ({ ok: false, status: 500 }) } = {}) {
  const noop = () => {};
  const context = {
    chrome: {
      runtime: {
        onInstalled: { addListener: noop },
        onStartup: { addListener: noop },
        onMessage: { addListener: noop }
      },
      alarms: {
        onAlarm: { addListener: noop },
        clear: async () => true,
        create: noop
      },
      storage: {
        local: {
          get: async (key) => ({ [key]: storage[key] }),
          set: async (value) => Object.assign(storage, value)
        }
      }
    },
    console,
    fetch,
    Set,
    URL
  };

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src/background.js"), "utf8"), context);
  return context;
}
