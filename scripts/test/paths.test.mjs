/** Save-location resolution with stubbed platform, env and commands. Run: node --test scripts/test/paths.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { slugify, resolveSaveRoots, planRun, expandUserPath, detectWSL } from "../lib/paths.mjs";

const stubExec = (map) => (cmd, args) => {
  const key = `${cmd} ${args.join(" ")}`;
  for (const [k, v] of Object.entries(map)) if (key.includes(k)) return v;
  return null;
};
const base = { cwd: "/w/proj", projectRoot: "/w/proj", projectName: "acme-portal", workspace: "/cache/etc", date: "2026-11-01" };

test("slugify transliterates Turkish and trims to 40 chars on a word boundary", () => {
  assert.equal(slugify("Kayıt formunda daha net hata mesajları"), "kayit-formunda-daha-net-hata-mesajlari");
  assert.equal(slugify("İĞÜŞÇÖ ığüşçö"), "igusco-igusco");
  assert.equal(slugify("Ödeme sayfasında çok daha hızlı ve güvenli kart doğrulaması"), "odeme-sayfasinda-cok-daha-hizli-ve");
  assert.ok(slugify("x".repeat(80)).length <= 40);
  assert.equal(slugify(""), "change");
  assert.equal(slugify("Straße & Œuvre"), "strasse-oeuvre");
});

test("macOS uses ~/Desktop and ~/Movies", () => {
  const { roots } = resolveSaveRoots({ ...base, platform: "darwin", home: "/Users/a", env: {}, exists: () => true });
  assert.equal(roots.desktop.base, "/Users/a/Desktop");
  assert.equal(roots.videos.base, "/Users/a/Movies");
  assert.equal(roots.videos.label, "Movies folder");
  assert.equal(roots.project.base, "/w/proj/customer-explainers");
});

test("Windows asks .NET for known folders and follows OneDrive redirection", () => {
  const exec = stubExec({ "GetFolderPath('Desktop')": "C:\\Users\\a\\OneDrive\\Masaüstü" });
  const { roots } = resolveSaveRoots({
    ...base,
    cwd: "C:\\w\\proj",
    projectRoot: "C:\\w\\proj",
    platform: "win32",
    home: "C:\\Users\\a",
    env: { USERPROFILE: "C:\\Users\\a" },
    exec,
    exists: () => true,
  });
  assert.equal(roots.desktop.base, "C:\\Users\\a\\OneDrive\\Masaüstü");
  assert.equal(roots.videos.base, "C:\\Users\\a\\Videos", "falls back to %USERPROFILE%\\Videos");
  assert.equal(roots.videos.label, "Videos folder");
  assert.equal(roots.project.base, "C:\\w\\proj\\customer-explainers");
});

test("Linux uses localized xdg-user-dir; a result equal to $HOME means not set", () => {
  const exec = stubExec({ "xdg-user-dir DESKTOP": "/home/a/Masaüstü", "xdg-user-dir VIDEOS": "/home/a" });
  const { roots, isWSL } = resolveSaveRoots({
    ...base,
    platform: "linux",
    home: "/home/a",
    env: {},
    exec,
    readFile: () => {
      throw new Error("none");
    },
    exists: (p) => p !== "/home/a/Videos",
  });
  assert.equal(isWSL, false);
  assert.equal(roots.desktop.base, "/home/a/Masaüstü");
  assert.equal(roots.videos.base, "/home/a/Videos");
  assert.equal(roots.videos.exists, false, "option is hidden when the folder does not exist");
});

test("Linux falls back to user-dirs.dirs when xdg-user-dir is missing", () => {
  const readFile = (f) =>
    f.endsWith("user-dirs.dirs")
      ? 'XDG_DESKTOP_DIR="$HOME/Schreibtisch"\nXDG_VIDEOS_DIR="$HOME/Videos"\n'
      : (() => {
          throw new Error("x");
        })();
  const { roots } = resolveSaveRoots({ ...base, platform: "linux", home: "/home/b", env: {}, exec: () => null, readFile, exists: () => true });
  assert.equal(roots.desktop.base, "/home/b/Schreibtisch");
  assert.equal(roots.videos.base, "/home/b/Videos");
});

test("WSL prefers the Windows-side Desktop and Videos", () => {
  const exec = stubExec({
    "GetFolderPath('Desktop')": "C:\\Users\\a\\Desktop",
    "wslpath -u C:\\Users\\a\\Desktop": "/mnt/c/Users/a/Desktop",
    "cmd.exe /c echo %USERPROFILE%": "C:\\Users\\a",
    "wslpath -u C:\\Users\\a\\Videos": "/mnt/c/Users/a/Videos",
  });
  const env = { WSL_DISTRO_NAME: "Ubuntu" };
  assert.equal(detectWSL({ platform: "linux", env }), true);
  const { roots, isWSL } = resolveSaveRoots({ ...base, platform: "linux", home: "/home/a", env, exec, exists: () => true });
  assert.equal(isWSL, true);
  assert.equal(roots.desktop.base, "/mnt/c/Users/a/Desktop");
  assert.equal(roots.videos.base, "/mnt/c/Users/a/Videos", "MyVideos lookup failed, so USERPROFILE\\Videos via cmd.exe");
});

test("project option: dated folder, never overwrites", () => {
  const { roots } = resolveSaveRoots({ ...base, platform: "darwin", home: "/Users/a", env: {}, exists: () => true });
  const taken = new Set(["/w/proj/customer-explainers/2026-11-01-net-hata", "/w/proj/customer-explainers/2026-11-01-net-hata-2"]);
  const plan = planRun({ choice: "project", roots, project: "acme-portal", date: "2026-11-01", title: "Net hata", existsFn: (p) => taken.has(p), platform: "darwin" });
  assert.equal(plan.folder, "/w/proj/customer-explainers/2026-11-01-net-hata-3");
  assert.equal(plan.src, "/w/proj/customer-explainers/2026-11-01-net-hata-3/_source");
  assert.equal(plan.layout.video, "net-hata.mp4");
});

test("desktop option: <project>-<date>-<slug>", () => {
  const { roots } = resolveSaveRoots({ ...base, platform: "darwin", home: "/Users/a", env: {}, exists: () => true });
  const plan = planRun({ choice: "desktop", roots, project: "Acme Portal", date: "2026-11-01", title: "Yeni düğme", existsFn: () => false, platform: "darwin" });
  assert.equal(plan.folder, "/Users/a/Desktop/acme-portal-2026-11-01-yeni-dugme");
});

test("current folder: flat deliverables with slug-prefixed names, sources in the tool workspace", () => {
  const { roots } = resolveSaveRoots({ ...base, platform: "darwin", home: "/Users/a", env: {}, exists: () => true });
  const taken = new Set(["/w/proj/net-hata.mp4"]);
  const plan = planRun({ choice: "cwd", roots, project: "acme-portal", date: "2026-11-01", title: "Net hata", existsFn: (p) => taken.has(p), platform: "darwin" });
  assert.equal(plan.folder, "/w/proj");
  assert.equal(plan.slug, "net-hata-2");
  assert.equal(plan.layout.message, "net-hata-2-message.md");
  assert.equal(plan.layout.images, "net-hata-2-images");
  assert.equal(plan.src, "/cache/etc/runs/acme-portal-2026-11-01-net-hata-2/_source");
});

test("custom path: ~ and env vars expand; empty folder used as is, non-empty gets a subfolder", () => {
  const { roots } = resolveSaveRoots({ ...base, platform: "darwin", home: "/Users/a", env: {}, exists: () => true });
  const empty = planRun({
    choice: "path",
    customPath: "~/Exports/acme",
    roots,
    project: "acme",
    date: "2026-11-01",
    title: "X",
    home: "/Users/a",
    env: {},
    existsFn: () => false,
    platform: "darwin",
  });
  assert.equal(empty.folder, "/Users/a/Exports/acme");
  const full = planRun({
    choice: "path",
    customPath: "$OUT/acme",
    roots,
    project: "acme",
    date: "2026-11-01",
    title: "X",
    home: "/Users/a",
    env: { OUT: "/data" },
    existsFn: (p) => p === "/data/acme",
    isEmptyDir: () => false,
    platform: "darwin",
  });
  assert.equal(full.folder, "/data/acme/acme-2026-11-01-x");
  assert.equal(expandUserPath("%USERPROFILE%\\Desktop\\x", { home: "C:\\Users\\a", env: { USERPROFILE: "C:\\Users\\a" }, platform: "win32" }), "C:\\Users\\a\\Desktop\\x");
  assert.equal(expandUserPath("${HOME}/x", { home: "/h", env: { HOME: "/h" }, platform: "linux" }), "/h/x");
});
