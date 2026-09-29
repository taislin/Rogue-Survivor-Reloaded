#!/usr/bin/env node
/**
 * Package the Neutralino desktop build into three per-platform release folders.
 *
 *   npm run build:release
 *
 * `npm run build:desktop` (vite + `neu build`) drops every platform's client
 * binary side by side in `dist/RogueSurvivorReloaded/`, which is fine for
 * testing and useless for shipping: you cannot attach one .exe to a Windows
 * release, and a Linux archive carrying three Mach-O binaries and a .exe is
 * 12 MB of dead weight. This script regroups that output into
 *
 *   dist-release/
 *     RogueSurvivorReloaded-windows/   RogueSurvivorReloaded-win_x64.exe
 *     RogueSurvivorReloaded-linux/     the three linux_{arm64,armhf,x64} binaries
 *     RogueSurvivorReloaded-macos/     the three mac_{arm64,universal,x64} binaries
 *
 * each with a `dist/` (the web payload) and `neutralino.config.json` beside it,
 * which is the layout `neu build` itself produces and the layout the runtime
 * expects: the config is read from the executable's own directory and
 * `documentRoot` is resolved relative to it. Those three folders are the whole
 * of `dist-release/` - each platform folder is the archive you zip and attach
 * to a release, so anything loose at the root would be something to remember to
 * delete before uploading. `dist-release/` is wiped first, so what you are
 * looking at afterwards is always a full regeneration of a current build and
 * never a mix of two.
 *
 * The binaries are named individually rather than copied wholesale, which is
 * also what keeps `resources.neu` - the auto-update manifest, holding the update
 * URLs of whichever machine ran the build - out of the release folders.
 *
 * Each folder is then zipped, named for the thing you attach to a release:
 *
 *   rogue_survivor_reloaded-<platform>-<version>-<commit>.zip
 *
 * with the version from package.json and the commit from HEAD, so an uploaded
 * archive identifies its own build. See `zipDirectory` for why the zip is
 * written here rather than shelled out to a `zip` binary.
 *
 * Requires Node 16.7+ (fs.cpSync), and network access on the first run of any
 * given machine: `neu update` downloads ~28 MB of Neutralino clients into
 * `web/bin/` (gitignored, per-architecture, and the reason a clean checkout
 * cannot produce a release on its own). That step is in `main()` rather than
 * left to the caller because `neu build` fails silently without it - see
 * `updateClients`.
 */

import { spawnSync } from "node:child_process";
import {
  closeSync,
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const neuOut = join(webRoot, "dist", "RogueSurvivorReloaded");
const neuBin = join(webRoot, "bin");
const webDist = join(webRoot, "dist");
const releaseDir = join(webRoot, "dist-release");

/**
 * Per-platform payload. Each folder gets exactly one set of binaries, and the
 * `dist/` beside them is a copy of the same web build - so the game code, the
 * assets and the client library can never drift between platforms.
 */
const PLATFORMS = [
  {
    dir: "RogueSurvivorReloaded-windows",
    slug: "win",
    binaries: ["RogueSurvivorReloaded-win_x64.exe"],
  },
  {
    dir: "RogueSurvivorReloaded-linux",
    slug: "linux",
    binaries: [
      "RogueSurvivorReloaded-linux_arm64",
      "RogueSurvivorReloaded-linux_armhf",
      "RogueSurvivorReloaded-linux_x64",
    ],
  },
  {
    dir: "RogueSurvivorReloaded-macos",
    slug: "mac",
    binaries: [
      "RogueSurvivorReloaded-mac_arm64",
      "RogueSurvivorReloaded-mac_universal",
      "RogueSurvivorReloaded-mac_x64",
    ],
  },
];

/** Copied into each platform's `dist/`. These are the whole `dist/`, minus `RogueSurvivorReloaded/` (the binaries, already placed one level up). */
const DIST_DIRS = ["assets", "fonts", "js"];

/**
 * Loose files in `dist/` that the game still asks for at runtime:
 *
 *   index.html              the document `url` in the config points at.
 *   manifest.webmanifest    linked from index.html, so leaving it out is a 404
 *                           on every launch. It has no effect in Neutralino -
 *                           there is no PWA install, and `display: fullscreen`
 *                           is ignored in favour of `modes.window` - but it is
 *                           878 bytes and it keeps the document consistent.
 *   icon-reloaded.png       `modes.window.icon` in the config resolves to
 *                           `dist/icon-reloaded.png`; without it the window
 *                           gets no icon at all. The rest are the favicon and
 *                           the manifest's declared icon set.
 *
 * `sw.js` is deliberately NOT here, even though `src/main.ts` registers it.
 * That is correct for the browser build and wrong for this one:
 *
 *   - It has nothing to do. Neutralino serves the whole game from this folder
 *     over localhost, so there is no network to be offline from.
 *   - It would do harm. The handler is cache-first for `/assets/*`, and asset
 *     paths are not content-hashed - only the JS bundle is. Replacing the app
 *     folder after an update would therefore keep serving the *old* sprites and
 *     audio out of Cache Storage while the new bundle loads. On the web that is
 *     handled by bumping CACHE_VERSION every release (see the note in sw.js);
 *     a player who unpacks a new build over the old one has no way to do that.
 *   - It would copy ~55 MB of assets into the Chromium profile's cache for files
 *     already on disk.
 *
 * What is left is one 404 and one console warning per launch, which the .catch
 * handles and nobody sees with `enableInspector: false`.
 */
const DIST_FILES = [
  "index.html",
  "manifest.webmanifest",
  "icon-reloaded.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
];

function run(tool, args, what) {
  // shell: true so Windows resolves `npm`/`npx` to their .cmd shims; without it
  // recent Node versions refuse to spawn a .cmd directly (EINVAL).
  const result = spawnSync(tool, args, {
    cwd: webRoot,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`${what} failed (exit ${result.status})`);
  }
}

/**
 * Every platform's Neutralino client, as `neu update` names them. The
 * suffixed application binary in each release folder is one of these renamed,
 * so this is also the list `neu build` has to be able to copy.
 */
const CLIENTS = [
  "neutralino-win_x64.exe",
  "neutralino-linux_arm64",
  "neutralino-linux_armhf",
  "neutralino-linux_x64",
  "neutralino-mac_arm64",
  "neutralino-mac_universal",
  "neutralino-mac_x64",
];

/**
 * Download the Neutralino clients for every platform into `web/bin/`.
 *
 * This is a prerequisite, not a nicety, and its absence is invisible. `neu
 * build` starts with "Copying binaries...", finds an empty or missing `bin/`,
 * has nothing to copy, and exits 0 having produced only `resources.neu` - a
 * build that looks complete and contains no executables. It is `build-release`
 * that notices, some seconds later, with "missing .../RogueSurvivorReloaded-
 * win_x64.exe", and by then the cause is two steps back.
 *
 * So it runs here, where the error can say what it means, rather than being left
 * to whoever runs the script to know. `web/bin/` is gitignored, which is the
 * right call (28 MB of binaries, per-architecture) and is exactly why a fresh
 * checkout - and every CI runner - starts without them.
 */
function updateClients() {
  console.log("> npx @neutralinojs/neu update");
  run("npx", ["@neutralinojs/neu", "update"], "neu update");
}

/**
 * Fail with the reason rather than the symptom. See `updateClients`.
 */
function checkClients() {
  const missing = CLIENTS.filter((c) => !existsSync(join(neuBin, c)));
  if (missing.length > 0) {
    throw new Error(
      `missing Neutralino clients in web/bin/: ${missing.join(", ")}\n` +
        `Run "npx @neutralinojs/neu update" (needs network access) and try again.`
    );
  }
}

function build() {
  console.log("> npm run build:desktop");
  run("npm", ["run", "build:desktop"], "build:desktop");
}

function copyWebDist(target) {
  mkdirSync(target, { recursive: true });
  for (const dir of DIST_DIRS) {
    const src = join(webDist, dir);
    if (!existsSync(src)) throw new Error(`missing ${src}`);
    cpSync(src, join(target, dir), { recursive: true });
  }
  for (const file of DIST_FILES) {
    const src = join(webDist, file);
    if (!existsSync(src)) throw new Error(`missing ${src}`);
    copyFileSync(src, join(target, file));
  }
}

function assemblePlatforms() {
  for (const { dir, binaries } of PLATFORMS) {
    const platformDir = join(releaseDir, dir);
    mkdirSync(platformDir, { recursive: true });

    for (const binary of binaries) {
      const src = join(neuOut, binary);
      if (!existsSync(src)) throw new Error(`missing ${src}`);
      copyFileSync(src, join(platformDir, binary));
    }

    // The runtime resolves resourcesPath and documentRoot against the
    // executable's directory, so the config sits next to the binaries and not
    // inside dist/.
    copyFileSync(join(webRoot, "neutralino.config.json"), join(platformDir, "neutralino.config.json"));

    copyWebDist(join(platformDir, "dist"));

    console.log(`  ${dir}: ${binaries.length} binary/binaries + dist/ + neutralino.config.json`);
  }
}

/*
 * ZIP WRITER
 *
 * Written here rather than shelled out to because no single command does this
 * on every platform: `zip` is not installed on Windows, Windows' tar is
 * bsdtar while most Linux boxes ship GNU tar, which cannot write zips at all,
 * and Compress-Archive is PowerShell-only. This is the one part of a release
 * build that must produce the same archive everywhere, so it is a few hundred
 * lines of zlib and struct packing instead of an OS branch and a new dependency.
 *
 * The one thing that is not incidental: Unix permissions. The linux and mac
 * binaries arrive in a zip with no exec bit, and `unzip` faithfully restores
 * what the archive says - so an archive written without one extracts to a
 * binary that cannot be run, and the failure looks like a broken build rather
 * than a broken archive. The mode goes in the high 16 bits of the external
 * attributes and "version made by" is set to Unix so extractors read them.
 */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const FLAG_UTF8_NAMES = 0x0800;
/** 3 = Unix host, 20 = spec 2.0. The host byte is what makes the mode bits count. */
const VERSION_MADE_BY = (3 << 8) | 20;
const VERSION_NEEDED = 20;
const MAX_UINT32 = 0xffffffff;
const MAX_UINT16 = 0xffff;

/**
 * CRC-32, which the format requires of every entry. Node's `zlib.crc32` only
 * arrived in 22.2 and this project supports Node 20, so the table is built here
 * rather than feature-detected.
 */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** The format's timestamp is DOS date/time pairs, so the year floors at 1980. */
function dosTimestamp(mtimeMs) {
  const d = new Date(mtimeMs);
  const year = Math.max(d.getFullYear(), 1980);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Every file under `dir`, as archive entries, with `prefix` prepended to each
 * name. Sorted, because readdir order is filesystem-dependent and an archive
 * whose entry order changes between builds is a nuisance to diff.
 */
function collectEntries(dir, prefix) {
  const entries = [];
  const walk = (current, nameInZip) => {
    entries.push({ name: `${nameInZip}/`, dir: true, mtime: statSync(current).mtimeMs });
    for (const item of readdirSync(current, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const source = join(current, item.name);
      if (item.isDirectory()) {
        walk(source, `${nameInZip}/${item.name}`);
      } else if (item.isFile()) {
        entries.push({ name: `${nameInZip}/${item.name}`, dir: false, source, mtime: statSync(source).mtimeMs });
      }
    }
  };
  walk(dir, prefix);
  return entries;
}

/**
 * Zips `sourceDir` into `outFile`, keeping the folder itself as the archive's
 * top-level entry so extracting it cannot scatter files into the current
 * directory. `execNames` are the files that get the exec bit.
 */
function zipDirectory(sourceDir, outFile, execNames) {
  const entries = collectEntries(sourceDir, basename(sourceDir));
  if (entries.length > MAX_UINT16) {
    // Past this the 16-bit entry counts in the central directory overflow and
    // the archive needs the Zip64 extension, which is not implemented here.
    throw new Error(`${entries.length} entries exceeds the 65535 this writer supports (needs Zip64)`);
  }

  const fd = openSync(outFile, "w");
  const centralChunks = [];
  let offset = 0;
  let centralSize = 0;

  try {
    for (const entry of entries) {
      const nameBuf = Buffer.from(entry.name, "utf8");
      const raw = entry.dir ? Buffer.alloc(0) : readFileSync(entry.source);
      const deflated = entry.dir ? null : deflateRawSync(raw, { level: 9 });
      // The .webp and .ogg assets are already compressed, so deflating them
      // costs CPU on ~1200 files and usually makes them bigger. Those are
      // stored as-is.
      const store = deflated === null || deflated.length >= raw.length;
      const data = store ? raw : deflated;
      const method = store ? 0 : 8;
      const crc = entry.dir ? 0 : crc32(raw);
      const { time, date } = dosTimestamp(entry.mtime);
      const mode = entry.dir || execNames.has(basename(entry.source)) ? 0o755 : 0o644;

      if (data.length > MAX_UINT32 || raw.length > MAX_UINT32) {
        throw new Error(`${entry.name} is over 4 GB, which needs Zip64 (not implemented)`);
      }

      const local = Buffer.alloc(30);
      local.writeUInt32LE(LOCAL_SIG, 0);
      local.writeUInt16LE(VERSION_NEEDED, 4);
      local.writeUInt16LE(FLAG_UTF8_NAMES, 6);
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(raw.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);

      const headerOffset = offset;
      writeSync(fd, local);
      writeSync(fd, nameBuf);
      writeSync(fd, data);
      offset += local.length + nameBuf.length + data.length;

      const central = Buffer.alloc(46);
      central.writeUInt32LE(CENTRAL_SIG, 0);
      central.writeUInt16LE(VERSION_MADE_BY, 4);
      central.writeUInt16LE(VERSION_NEEDED, 6);
      central.writeUInt16LE(FLAG_UTF8_NAMES, 8);
      central.writeUInt16LE(method, 10);
      central.writeUInt16LE(time, 12);
      central.writeUInt16LE(date, 14);
      central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(data.length, 20);
      central.writeUInt32LE(raw.length, 24);
      central.writeUInt16LE(nameBuf.length, 28);
      // Bit 4 of the low external-attribute byte marks a directory entry. The
      // >>> 0 is load-bearing: a mode like 0o100644 shifted left 16 is over
      // 2^31, and JS bitwise operators are signed, so without it this throws.
      const externalAttr = ((((entry.dir ? 0o40000 : 0o100000) | mode) << 16) | (entry.dir ? 0x10 : 0)) >>> 0;
      central.writeUInt32LE(externalAttr, 38);
      central.writeUInt32LE(headerOffset, 42);
      centralChunks.push(central, nameBuf);
      centralSize += central.length + nameBuf.length;
    }

    // The central directory is the index an unzip reads first, and it is also
    // the only place the Unix mode lives - the local header has no room for it.
    // Its size and offset go in the EOCD record after it, so it cannot be
    // streamed and has to be buffered; at ~135 bytes an entry that is ~160 KB
    // for this payload, against multi-megabyte file data that is written as it
    // is read.
    for (const chunk of centralChunks) writeSync(fd, chunk);

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(EOCD_SIG, 0);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralSize, 12);
    eocd.writeUInt32LE(offset, 16);
    writeSync(fd, eocd);
  } finally {
    closeSync(fd);
  }
}

function readVersion() {
  const { version } = JSON.parse(readFileSync(join(webRoot, "package.json"), "utf8"));
  if (typeof version !== "string" || version === "") {
    throw new Error(`no version in ${join(webRoot, "package.json")}`);
  }
  return version;
}

function readCommit() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: webRoot, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git rev-parse --short HEAD failed (exit ${result.status}) - is this a git checkout?`);
  }
  return result.stdout.trim();
}

function archivePlatforms(version, commit) {
  console.log(`\nzipping as ${version}-${commit}:`);
  for (const { dir, slug, binaries } of PLATFORMS) {
    const platformDir = join(releaseDir, dir);
    const outFile = join(releaseDir, `rogue_survivor_reloaded-${slug}-${version}-${commit}.zip`);
    zipDirectory(platformDir, outFile, new Set(binaries));
    const mb = (statSync(outFile).size / 1024 / 1024).toFixed(1);
    console.log(`  ${basename(outFile)} (${mb} MB)`);
  }
}

function main() {
  // Before the build, not after: `neu build` cannot tell you it had nothing to
  // copy, and the failure it produces is a renamed-binary error two steps later.
  updateClients();
  build();
  checkClients();

  // Full wipe, not a merge: a stale binary or a leftover asset from an earlier
  // build would ship invisibly, and there is no way to tell it apart from the
  // current one once it is in the folder.
  rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(releaseDir, { recursive: true });

  assemblePlatforms();
  archivePlatforms(readVersion(), readCommit());

  console.log(`\ndone -> ${releaseDir}`);
}

main();
