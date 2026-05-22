# USACO Sync

USACO Sync is an unofficial Chrome Manifest V3 extension that annotates
Codeforces problem links on [USACO Guide](https://usaco.guide/) with your
solved or attempted status.

## Current providers

- Codeforces: uses the official anonymous `user.status` API.

## Features

- Marks solved Codeforces links with a green badge.
- Marks attempted but unsolved Codeforces links with a yellow badge.
- Syncs manually from the popup/options page.
- Can sync automatically on an hourly interval.
- Stores all settings and progress locally in Chrome extension storage.

## Install locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Open the extension options, add your Codeforces handle, then click **Sync now**.
6. Visit `https://usaco.guide/` and problem links should show badges:
   - `✓` means solved.
   - `!` means attempted but not accepted.

## Project Structure

```text
assets/                 Extension icons
scripts/                Validation, release, and icon-generation scripts
src/background.js       Codeforces sync and Chrome extension message handling
src/content.js          USACO Guide link annotation
src/options.*           Options page
src/popup.*             Browser action popup
manifest.json           Chrome extension manifest
```

## Development

The extension is plain JavaScript with no build step.

```bash
npm run check
npm test
```

Regenerate icon PNGs from the drawing script:

```bash
node scripts/generate-icons.js
```

## Release Build

Create a production zip:

```bash
npm run prepare-release
```

The packaged extension is written to `dist/usaco-sync-vVERSION.zip`.

## GitHub Release Checklist

1. Update `manifest.json`, `package.json`, and `CHANGELOG.md` with the same version.
2. Run `npm run prepare-release`.
3. Load the unpacked extension in Chrome and run a manual sync.
4. Create a Git tag, for example `v1.0.0`.
5. Upload the zip from `dist/` to the GitHub release.

## Privacy

See [PRIVACY.md](PRIVACY.md). In short: the extension stores your Codeforces
handle and cached progress locally, and sends the handle only to the official
Codeforces API.

## Adding another provider

To add another provider later, add a public API syncer in `src/background.js` that returns:

```js
{
  provider: "provider-name",
  handle,
  status: "ok",
  solved: {
    "provider-name:problem-id": {
      provider: "provider-name",
      status: "solved",
      solvedAt: "2026-05-21T00:00:00.000Z",
      name: "Problem name",
      url: "https://example.com/problem"
    }
  },
  attempted: {}
}
```

Then teach `src/content.js` how to convert problem links from that site into
the same key format.
