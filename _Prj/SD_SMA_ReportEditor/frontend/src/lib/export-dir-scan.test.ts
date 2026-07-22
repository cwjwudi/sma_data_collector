import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const scan = require(join(here, "../../electron/export-dir-scan.cjs")) as {
  resolveExportCwd: (
    root: string,
    cwd?: string,
    pathMod?: unknown,
  ) => { ok: boolean; error?: string; root?: string; cwd?: string };
  pageExportEntries: (
    all: Array<{ kind: "dir" | "pdf"; name: string; modifiedAt?: string }>,
    opts?: { offset?: number; limit?: number; sort?: string },
  ) => { entries: unknown[]; total: number; offset: number; limit: number; hasMore: boolean };
  scanExportEntries: (opts: Record<string, unknown>) => {
    ok: boolean;
    error?: string;
    entries: Array<{ kind: string; name: string; path?: string; filePath?: string }>;
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
    rootDir?: string;
    cwd?: string;
  };
};

function makeDirent(name: string, kind: "dir" | "file") {
  return {
    name,
    isDirectory: () => kind === "dir",
    isFile: () => kind === "file",
    isSymbolicLink: () => false,
  };
}

/** 内存假 fs：仅支持本测所需 API */
function makeMemFs(tree: Record<string, { kind: "dir" | "file"; mtime?: string; size?: number; children?: string[] }>) {
  const norm = (p: string) => p.replace(/\\/g, "/");
  return {
    existsSync(p: string) {
      return Object.prototype.hasOwnProperty.call(tree, norm(p));
    },
    statSync(p: string) {
      const n = tree[norm(p)];
      if (!n) throw new Error("ENOENT");
      return {
        isDirectory: () => n.kind === "dir",
        isFile: () => n.kind === "file",
        size: n.size ?? 0,
        mtime: new Date(n.mtime || "2026-01-01T00:00:00.000Z"),
      };
    },
    readdirSync(p: string, opts?: { withFileTypes?: boolean }) {
      const n = tree[norm(p)];
      if (!n || n.kind !== "dir") throw new Error("ENOTDIR");
      const names = n.children || [];
      if (opts?.withFileTypes) {
        return names.map((name) => {
          const child = tree[norm(`${norm(p)}/${name}`)];
          return makeDirent(name, child?.kind === "dir" ? "dir" : "file");
        });
      }
      return names;
    },
  };
}

const pathMod = {
  resolve: (...parts: string[]) => {
    const joined = parts.join("/").replace(/\\/g, "/");
    const segs: string[] = [];
    for (const part of joined.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") segs.pop();
      else segs.push(part);
    }
    return "/" + segs.join("/");
  },
  join: (...parts: string[]) => pathMod.resolve(...parts),
  relative: (from: string, to: string) => {
    const f = pathMod.resolve(from).replace(/\/$/, "");
    const t = pathMod.resolve(to).replace(/\/$/, "");
    if (t === f) return "";
    if (t.startsWith(f + "/")) return t.slice(f.length + 1);
    return "..";
  },
  basename: (p: string) => p.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "",
  isAbsolute: (p: string) => p.startsWith("/") || /^[A-Za-z]:/.test(p),
  sep: "/",
};

describe("export-dir-scan (010)", () => {
  it("A4: cwd escapes rootDir → ok=false", () => {
    const r = scan.resolveExportCwd("/exports/root", "/exports/other", pathMod);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/超出/);
  });

  it("A4b: cwd inside root is ok", () => {
    const r = scan.resolveExportCwd("/exports/root", "/exports/root/2026-07", pathMod);
    expect(r.ok).toBe(true);
    expect(r.cwd).toBe("/exports/root/2026-07");
  });

  it("A2: pagination total=120 limit=50", () => {
    const all = Array.from({ length: 120 }, (_, i) => ({
      kind: "pdf" as const,
      name: `f${String(i).padStart(3, "0")}.pdf`,
      modifiedAt: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
    }));
    const p1 = scan.pageExportEntries(all, { offset: 0, limit: 50 });
    expect(p1.total).toBe(120);
    expect(p1.entries).toHaveLength(50);
    expect(p1.hasMore).toBe(true);
    const p3 = scan.pageExportEntries(all, { offset: 100, limit: 50 });
    expect(p3.entries).toHaveLength(20);
    expect(p3.hasMore).toBe(false);
  });

  it("A3: dirs before pdfs", () => {
    const page = scan.pageExportEntries(
      [
        { kind: "pdf", name: "a.pdf", modifiedAt: "2026-06-01T00:00:00.000Z" },
        { kind: "dir", name: "z-folder", modifiedAt: "2026-01-01T00:00:00.000Z" },
        { kind: "dir", name: "a-folder", modifiedAt: "2026-05-01T00:00:00.000Z" },
      ],
      { sort: "mtime_desc", limit: 10 },
    );
    expect(page.entries.map((e) => (e as { name: string }).name)).toEqual([
      "a-folder",
      "z-folder",
      "a.pdf",
    ]);
  });

  it("A1: one level — dirs + pdfs, no grandchild files", () => {
    const fsMod = makeMemFs({
      "/root": { kind: "dir", children: ["sub", "root.pdf", "notes.txt"] },
      "/root/sub": { kind: "dir", children: ["nested.pdf"], mtime: "2026-07-01T00:00:00.000Z" },
      "/root/sub/nested.pdf": { kind: "file", size: 10, mtime: "2026-07-02T00:00:00.000Z" },
      "/root/root.pdf": { kind: "file", size: 20, mtime: "2026-07-03T00:00:00.000Z" },
      "/root/notes.txt": { kind: "file", size: 1 },
    });
    const res = scan.scanExportEntries({
      rootDir: "/root",
      cwd: "/root",
      limit: 50,
      fsModule: fsMod,
      pathModule: pathMod,
    });
    expect(res.ok).toBe(true);
    expect(res.total).toBe(2);
    const names = res.entries.map((e) => e.name).sort();
    expect(names).toEqual(["root.pdf", "sub"]);
    expect(res.entries.some((e) => e.name === "nested.pdf")).toBe(false);
    expect(res.entries.some((e) => e.name === "notes.txt")).toBe(false);
  });

  it("A5: unreadable child skipped", () => {
    const base = makeMemFs({
      "/root": { kind: "dir", children: ["ok.pdf", "bad.pdf"] },
      "/root/ok.pdf": { kind: "file", size: 5, mtime: "2026-07-01T00:00:00.000Z" },
      "/root/bad.pdf": { kind: "file", size: 5 },
    });
    const fsMod = {
      ...base,
      statSync(p: string) {
        if (String(p).endsWith("bad.pdf")) throw new Error("EACCES");
        return base.statSync(p);
      },
    };
    const res = scan.scanExportEntries({
      rootDir: "/root",
      limit: 50,
      fsModule: fsMod,
      pathModule: pathMod,
    });
    expect(res.ok).toBe(true);
    expect(res.entries.map((e) => e.name)).toEqual(["ok.pdf"]);
  });
});
