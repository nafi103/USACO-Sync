const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME_FILES = [
  "manifest.json",
  "assets/icon-16.png",
  "assets/icon-32.png",
  "assets/icon-48.png",
  "assets/icon-128.png",
  "src/background.js",
  "src/content.css",
  "src/content.js",
  "src/options.css",
  "src/options.html",
  "src/options.js",
  "src/popup.css",
  "src/popup.html",
  "src/popup.js"
];
const JS_FILES = [
  "src/background.js",
  "src/content.js",
  "src/options.js",
  "src/popup.js",
  "scripts/build-release.js",
  "scripts/generate-icons.js",
  "scripts/smoke-tests.js",
  "scripts/validate-extension.js"
];

main();

function main() {
  const manifest = readJson("manifest.json");
  const packageJson = readJson("package.json");

  assert(manifest.manifest_version === 3, "Manifest must use Manifest V3.");
  assert(isChromeVersion(manifest.version), "Manifest version must be Chrome-compatible.");
  assert(manifest.version === packageJson.version, "package.json and manifest.json versions must match.");
  assert(manifest.description.length <= 132, "Manifest description must fit Chrome's 132 character limit.");
  assert(Array.isArray(manifest.permissions), "Manifest permissions must be an array.");
  assert(manifest.permissions.includes("storage"), "Manifest must include storage permission.");
  assert(manifest.permissions.includes("alarms"), "Manifest must include alarms permission.");
  assertDeepEqual(manifest.host_permissions, ["https://codeforces.com/api/*"], "Host permissions must stay Codeforces-only.");

  for (const file of RUNTIME_FILES) {
    assertFile(file);
  }

  validateManifestReferences(manifest);
  validateIcons();
  validateHtmlFiles();
  runSyntaxChecks();

  console.log("Extension validation passed.");
}

function validateManifestReferences(manifest) {
  for (const icon of Object.values(manifest.icons || {})) {
    assertFile(icon);
  }

  for (const icon of Object.values((manifest.action && manifest.action.default_icon) || {})) {
    assertFile(icon);
  }

  assertFile(manifest.background.service_worker);
  assertFile(manifest.action.default_popup);
  assertFile(manifest.options_page);

  for (const script of manifest.content_scripts || []) {
    for (const file of script.js || []) assertFile(file);
    for (const file of script.css || []) assertFile(file);
  }
}

function validateIcons() {
  for (const size of [16, 32, 48, 128]) {
    const dimensions = readPngDimensions(`assets/icon-${size}.png`);
    assert(dimensions.width === size && dimensions.height === size, `icon-${size}.png must be ${size}x${size}.`);
  }
}

function validateHtmlFiles() {
  for (const file of ["src/options.html", "src/popup.html"]) {
    const html = readText(file);
    assert(!/<script[^>]+src=["']https?:\/\//i.test(html), `${file} must not load remote scripts.`);
    assert(!/<link[^>]+href=["']https?:\/\//i.test(html), `${file} must not load remote stylesheets.`);
    assert(!/\son\w+=/i.test(html), `${file} must not use inline event handlers.`);
  }
}

function runSyntaxChecks() {
  for (const file of JS_FILES) {
    childProcess.execFileSync(process.execPath, ["--check", path.join(ROOT, file)], {
      stdio: "inherit"
    });
  }
}

function readPngDimensions(file) {
  const buffer = fs.readFileSync(path.join(ROOT, file));
  const signature = "89504e470d0a1a0a";
  assert(buffer.subarray(0, 8).toString("hex") === signature, `${file} is not a PNG.`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function assertFile(file) {
  assert(fs.existsSync(path.join(ROOT, file)), `Missing file: ${file}`);
}

function readJson(file) {
  return JSON.parse(readText(file));
}

function readText(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function isChromeVersion(version) {
  return /^\d+(?:\.\d+){0,3}$/.test(version);
}

function assertDeepEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
