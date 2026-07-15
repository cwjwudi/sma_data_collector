import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const transfer = require(join(here, "../../electron/history-transfer.cjs")) as {
  allocateRenamePath: (dest: string, fsMod?: unknown, pathMod?: unknown) => string;
  transferHistoryItems: (opts: Record<string, unknown>) => {
    ok: boolean;
    error?: string;
    needsConflictDecision?: boolean;
    conflicts?: Array<{ name: string }>;
    copied?: number;
    moved?: number;
    skipped?: number;
    failed?: number;
    results?: Array<{ status: string; error?: string }>;
  };
};

function makeMemFs(initial: Record<string, { kind: "dir" | "file"; content?: string; children?: string[] }>) {
  const tree: Record<string, { kind: "dir" | "file"; content?: string; children?: string[] }> = { ...initial };
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "") || "/";

  const ensureParent = (p: string) => {
    const n = norm(p);
    const parent = n.includes("/") ? n.slice(0, n.lastIndexOf("/")) || "/" : "/";
    if (parent === n) return;
    if (!tree[parent]) {
      ensureParent(parent);
      tree[parent] = { kind: "dir", children: [] };
    }
    const name = n.slice(n.lastIndexOf("/") + 1);
    const ch = tree[parent].children || (tree[parent].children = []);
    if (!ch.includes(name)) ch.push(name);
  };

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
      };
    },
    cpSync(src: string, dest: string) {
      const s = tree[norm(src)];
      if (!s) throw new Error("ENOENT src");
      ensureParent(dest);
      if (s.kind === "file") {
        tree[norm(dest)] = { kind: "file", content: s.content };
        return;
      }
      tree[norm(dest)] = { kind: "dir", children: [] };
      for (const child of s.children || []) {
        const childSrc = `${norm(src)}/${child}`;
        const childDest = `${norm(dest)}/${child}`;
        this.cpSync(childSrc, childDest);
      }
    },
    rmSync(p: string) {
      const n = norm(p);
      const node = tree[n];
      if (!node) return;
      if (node.kind === "dir") {
        for (const child of [...(node.children || [])]) {
          this.rmSync(`${n}/${child}`);
        }
      }
      delete tree[n];
      const parent = n.includes("/") ? n.slice(0, n.lastIndexOf("/")) || "/" : "/";
      if (tree[parent]?.children) {
        tree[parent].children = tree[parent].children!.filter((c) => c !== n.slice(n.lastIndexOf("/") + 1));
      }
    },
    _tree: tree,
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
  dirname: (p: string) => {
    const n = p.replace(/\\/g, "/").replace(/\/+$/, "");
    const i = n.lastIndexOf("/");
    return i <= 0 ? "/" : n.slice(0, i);
  },
  basename: (p: string) => {
    const n = p.replace(/\\/g, "/").replace(/\/+$/, "");
    const i = n.lastIndexOf("/");
    return i < 0 ? n : n.slice(i + 1);
  },
  extname: (p: string) => {
    const b = pathMod.basename(p);
    const i = b.lastIndexOf(".");
    return i > 0 ? b.slice(i) : "";
  },
  relative: (from: string, to: string) => {
    const a = pathMod.resolve(from).split("/").filter(Boolean);
    const b = pathMod.resolve(to).split("/").filter(Boolean);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const up = a.slice(i).map(() => "..");
    return [...up, ...b.slice(i)].join("/") || "";
  },
  isAbsolute: (p: string) => p.startsWith("/") || /^[A-Za-z]:/.test(p),
  sep: "/",
};

describe("history-transfer", () => {
  it("dryRun 报告冲突且不写盘", () => {
    const fsMod = makeMemFs({
      "/left": { kind: "dir", children: ["a.pdf"] },
      "/left/a.pdf": { kind: "file", content: "L" },
      "/right": { kind: "dir", children: ["a.pdf"] },
      "/right/a.pdf": { kind: "file", content: "R" },
    });
    const res = transfer.transferHistoryItems({
      sources: ["/left/a.pdf"],
      destDir: "/right",
      sourceRoot: "/left",
      destRoot: "/right",
      mode: "copy",
      dryRun: true,
      fsModule: fsMod,
      pathModule: pathMod,
    });
    expect(res.ok).toBe(true);
    expect(res.needsConflictDecision).toBe(true);
    expect(res.conflicts?.[0]?.name).toBe("a.pdf");
    expect(fsMod._tree["/right/a.pdf"].content).toBe("R");
  });

  it("skip 冲突后复制其余", () => {
    const fsMod = makeMemFs({
      "/left": { kind: "dir", children: ["a.pdf", "b.pdf"] },
      "/left/a.pdf": { kind: "file", content: "A" },
      "/left/b.pdf": { kind: "file", content: "B" },
      "/right": { kind: "dir", children: ["a.pdf"] },
      "/right/a.pdf": { kind: "file", content: "OLD" },
    });
    const res = transfer.transferHistoryItems({
      sources: ["/left/a.pdf", "/left/b.pdf"],
      destDir: "/right",
      sourceRoot: "/left",
      destRoot: "/right",
      mode: "copy",
      conflict: "skip",
      fsModule: fsMod,
      pathModule: pathMod,
    });
    expect(res.skipped).toBe(1);
    expect(res.copied).toBe(1);
    expect(fsMod._tree["/right/a.pdf"].content).toBe("OLD");
    expect(fsMod._tree["/right/b.pdf"].content).toBe("B");
  });

  it("overwrite 覆盖同名", () => {
    const fsMod = makeMemFs({
      "/left": { kind: "dir", children: ["a.pdf"] },
      "/left/a.pdf": { kind: "file", content: "NEW" },
      "/right": { kind: "dir", children: ["a.pdf"] },
      "/right/a.pdf": { kind: "file", content: "OLD" },
    });
    const res = transfer.transferHistoryItems({
      sources: ["/left/a.pdf"],
      destDir: "/right",
      sourceRoot: "/left",
      destRoot: "/right",
      mode: "copy",
      conflict: "overwrite",
      fsModule: fsMod,
      pathModule: pathMod,
    });
    expect(res.copied).toBe(1);
    expect(fsMod._tree["/right/a.pdf"].content).toBe("NEW");
  });

  it("rename 生成不冲突路径", () => {
    const fsMod = makeMemFs({
      "/left": { kind: "dir", children: ["a.pdf"] },
      "/left/a.pdf": { kind: "file", content: "NEW" },
      "/right": { kind: "dir", children: ["a.pdf"] },
      "/right/a.pdf": { kind: "file", content: "OLD" },
    });
    const res = transfer.transferHistoryItems({
      sources: ["/left/a.pdf"],
      destDir: "/right",
      sourceRoot: "/left",
      destRoot: "/right",
      mode: "copy",
      conflict: "rename",
      fsModule: fsMod,
      pathModule: pathMod,
    });
    expect(res.copied).toBe(1);
    expect(fsMod._tree["/right/a.pdf"].content).toBe("OLD");
    expect(fsMod._tree["/right/a (1).pdf"].content).toBe("NEW");
  });

  it("move 成功后删除源", () => {
    const fsMod = makeMemFs({
      "/left": { kind: "dir", children: ["a.pdf"] },
      "/left/a.pdf": { kind: "file", content: "X" },
      "/right": { kind: "dir", children: [] },
    });
    const res = transfer.transferHistoryItems({
      sources: ["/left/a.pdf"],
      destDir: "/right",
      sourceRoot: "/left",
      destRoot: "/right",
      mode: "move",
      fsModule: fsMod,
      pathModule: pathMod,
    });
    expect(res.moved).toBe(1);
    expect(fsMod.existsSync("/left/a.pdf")).toBe(false);
    expect(fsMod._tree["/right/a.pdf"].content).toBe("X");
  });

  it("拒绝写入逃出 destRoot", () => {
    const fsMod = makeMemFs({
      "/left": { kind: "dir", children: ["a.pdf"] },
      "/left/a.pdf": { kind: "file", content: "X" },
      "/right": { kind: "dir", children: [] },
      "/other": { kind: "dir", children: [] },
    });
    const res = transfer.transferHistoryItems({
      sources: ["/left/a.pdf"],
      destDir: "/other",
      sourceRoot: "/left",
      destRoot: "/right",
      mode: "copy",
      fsModule: fsMod,
      pathModule: pathMod,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/超出|非法/);
  });
});
