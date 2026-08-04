import { describe, expect, it } from "vitest";
import {
  createTemplate,
  defaultElement,
  ensureBodyPages,
  hydrateTemplateElement,
  makeElement,
  type TemplateControlType,
} from "@/lib/report-template/model";
import {
  defaultLayoutZoneElement,
  hydrateLayoutZoneElement,
  makeLayoutZoneElement,
  type LayoutControlType,
} from "@/lib/report-template/layout-zone-element";
import {
  chromeBorderCss,
  hideBordersOnLayoutPresetBands,
  hideBordersOnTemplateSheet,
  hideShowBordersInElements,
  sheetShowBorderSnapshot,
} from "@/lib/report-template/show-border";
import { templateElementFromZoneElement } from "@/lib/report-template/layout-apply";
import { blankZonesSnapshot } from "@/lib/report-template/layout-model";

const TPL_NON_TABLE: TemplateControlType[] = [
  "image",
  "text",
  "box",
  "date",
  "parameter",
  "chart",
  "signature",
];

const ZONE_NON_TABLE: LayoutControlType[] = [
  "image",
  "text",
  "box",
  "date",
  "parameter",
  "pageNumber",
];

describe("showBorder · 新建默认（A）", () => {
  it("A1 makeElement 非表格默认 false", () => {
    for (const type of TPL_NON_TABLE) {
      expect(makeElement(type).showBorder, type).toBe(false);
    }
  });

  it("A2 makeLayoutZoneElement 非表格默认 false", () => {
    for (const type of ZONE_NON_TABLE) {
      expect(makeLayoutZoneElement(type).showBorder, type).toBe(false);
    }
  });

  it("A3 default* 与 make 一致", () => {
    for (const type of TPL_NON_TABLE) {
      expect(defaultElement(type).showBorder, type).toBe(false);
    }
    for (const type of ZONE_NON_TABLE) {
      expect(defaultLayoutZoneElement(type).showBorder, type).toBe(false);
    }
  });

  it("A4 表格默认保持 true（本需求不碰）", () => {
    expect(makeElement("table").showBorder).toBe(true);
    expect(defaultElement("table").showBorder).toBe(true);
    expect(makeLayoutZoneElement("table").showBorder).toBe(true);
    expect(defaultLayoutZoneElement("table").showBorder).toBe(true);
  });
});

describe("showBorder · 加载兼容（B）", () => {
  it("B1/B6 hydrate 模版缺字段 → true（即使新建默认已是 false）", () => {
    const el = hydrateTemplateElement({ type: "image", id: "x" });
    expect(el.showBorder).toBe(true);
    expect(defaultElement("image").showBorder).toBe(false);
  });

  it("B2 hydrate 版式缺字段 → true", () => {
    expect(hydrateLayoutZoneElement({ type: "image", id: "x" }).showBorder).toBe(true);
  });

  it("B3/B4 显式 true/false", () => {
    expect(hydrateTemplateElement({ type: "text", id: "a", showBorder: false }).showBorder).toBe(false);
    expect(hydrateTemplateElement({ type: "text", id: "b", showBorder: true }).showBorder).toBe(true);
    expect(hydrateLayoutZoneElement({ type: "text", id: "c", showBorder: false }).showBorder).toBe(false);
    expect(hydrateLayoutZoneElement({ type: "text", id: "d", showBorder: true }).showBorder).toBe(true);
  });

  it("B5 字符串/数字边界", () => {
    expect(hydrateTemplateElement({ type: "box", id: "e", showBorder: "false" as unknown as boolean }).showBorder).toBe(
      false,
    );
    expect(hydrateTemplateElement({ type: "box", id: "f", showBorder: 0 as unknown as boolean }).showBorder).toBe(
      false,
    );
    expect(hydrateTemplateElement({ type: "box", id: "g", showBorder: "true" as unknown as boolean }).showBorder).toBe(
      true,
    );
  });
});

describe("showBorder · 一键隐藏（E）", () => {
  it("E1 混合元素：非表格改 false，表格不变", () => {
    const els = [
      { type: "image", showBorder: true },
      { type: "text", showBorder: true },
      { type: "table", showBorder: true },
    ];
    const n = hideShowBordersInElements(els);
    expect(n).toBe(2);
    expect(els[0].showBorder).toBe(false);
    expect(els[1].showBorder).toBe(false);
    expect(els[2].showBorder).toBe(true);
  });

  it("E2 已全部 false → 修改数 0", () => {
    const els = [
      { type: "image", showBorder: false },
      { type: "text", showBorder: false },
    ];
    expect(hideShowBordersInElements(els)).toBe(0);
  });

  it("E3 仅 table → 0", () => {
    const els = [{ type: "table", showBorder: true }];
    expect(hideShowBordersInElements(els)).toBe(0);
    expect(els[0].showBorder).toBe(true);
  });

  it("E4 版式 zone 形状同样适用", () => {
    const zones = [
      { type: "pageNumber", showBorder: true },
      { type: "table", showBorder: true },
    ];
    expect(hideShowBordersInElements(zones)).toBe(1);
    expect(zones[0].showBorder).toBe(false);
    expect(zones[1].showBorder).toBe(true);
  });
});

describe("showBorder · 传递（C1）", () => {
  it("版式 zone → 模版元素拷贝 showBorder", () => {
    const zone = makeLayoutZoneElement("image");
    zone.showBorder = false;
    const te = templateElementFromZoneElement(zone);
    expect(te).toBeTruthy();
    expect(te!.showBorder).toBe(false);
  });
});

describe("showBorder · Chromium/Mini CSS 契约（F）", () => {
  it("F1 showBorder false → none；true/undefined → 可见边框串", () => {
    const visible = "1px solid rgb(24 24 27 / 0.15)";
    expect(chromeBorderCss(false, visible)).toBe("none");
    expect(chromeBorderCss(true, visible)).toBe(visible);
    expect(chromeBorderCss(undefined, visible)).toBe(visible);
  });
});

function fixtureTemplate() {
  const z = blankZonesSnapshot();
  const t = createTemplate({
    name: "040-hide-borders",
    paperKind: "A4",
    orientation: "portrait",
    layoutPresetId: null,
    layoutSnapshot: z.layoutSnapshot,
    headerText: "",
    footerText: "",
    headerElements: [],
    footerElements: [],
    coverLayoutPresetId: "cover-preset",
    coverLayoutSnapshot: z.layoutSnapshot,
    coverHeaderText: "",
    coverFooterText: "",
    coverHeaderElements: [],
    coverFooterElements: [],
    coverBodyZoneElements: [],
    backLayoutPresetId: "back-preset",
    backLayoutSnapshot: z.layoutSnapshot,
    backHeaderText: "",
    backFooterText: "",
    backHeaderElements: [],
    backFooterElements: [],
    backBodyZoneElements: [],
  });
  return t;
}

describe("showBorder · 模版一键覆盖页眉页脚（040 · G）", () => {
  it("G1 回归：旧逻辑只改正文时页眉仍 true（对照）", () => {
    const t = fixtureTemplate();
    const h = makeLayoutZoneElement("text");
    h.id = "ch";
    h.showBorder = true;
    h.text = "Hdr";
    t.coverHeaderElements.push(h);
    const body = makeElement("text");
    body.id = "cb";
    body.showBorder = true;
    t.coverElements.push(body);

    // 旧路径：仅 body
    expect(hideShowBordersInElements(t.coverElements)).toBe(1);
    expect(t.coverElements[0]!.showBorder).toBe(false);
    expect(t.coverHeaderElements[0]!.showBorder).toBe(true);
  });

  it("G2 封面 sheet：页眉+正文+页脚+装饰全 false；table 跳过", () => {
    const t = fixtureTemplate();
    const mk = (type: "text" | "table" | "parameter", id: string, border = true) => {
      const el = makeLayoutZoneElement(
        type === "table" ? "table" : type === "parameter" ? "parameter" : "text",
      );
      el.id = id;
      el.showBorder = border;
      el.text = id;
      return el;
    };
    t.coverHeaderElements.push(mk("text", "h1"), mk("table", "ht"));
    t.coverFooterElements.push(mk("parameter", "f1"));
    t.coverBodyZoneElements.push(mk("text", "d1"));
    const body = makeElement("text");
    body.id = "b1";
    body.showBorder = true;
    t.coverElements.push(body);
    const bodyTbl = makeElement("table");
    bodyTbl.id = "bt";
    bodyTbl.showBorder = true;
    t.coverElements.push(bodyTbl);

    const n = hideBordersOnTemplateSheet(t, "cover");
    expect(n).toBe(4); // h1, f1, d1, b1 — 两张 table 跳过
    const snap = sheetShowBorderSnapshot(t, "cover");
    expect(snap.header.find((x) => x.id === "h1")!.showBorder).toBe(false);
    expect(snap.header.find((x) => x.id === "ht")!.showBorder).toBe(true);
    expect(snap.footer[0]!.showBorder).toBe(false);
    expect(snap.bodyDecor[0]!.showBorder).toBe(false);
    expect(snap.body.find((x) => x.id === "b1")!.showBorder).toBe(false);
    expect(snap.body.find((x) => x.id === "bt")!.showBorder).toBe(true);
  });

  it("G3 正文多页：只改当前页 + 共享眉脚；其它正文页与其它 sheet 不动", () => {
    const t = fixtureTemplate();
    const pages = ensureBodyPages(t);
    while (pages.length < 2) pages.push([]);

    const h = makeLayoutZoneElement("text");
    h.id = "bh";
    h.showBorder = true;
    t.headerElements.push(h);
    const f = makeLayoutZoneElement("text");
    f.id = "bf";
    f.showBorder = true;
    t.footerElements.push(f);

    const p0 = makeElement("text");
    p0.id = "p0";
    p0.showBorder = true;
    pages[0]!.push(p0);
    const p1 = makeElement("text");
    p1.id = "p1";
    p1.showBorder = true;
    pages[1]!.push(p1);

    const ch = makeLayoutZoneElement("text");
    ch.id = "cover-h";
    ch.showBorder = true;
    t.coverHeaderElements.push(ch);

    expect(hideBordersOnTemplateSheet(t, "body", 0)).toBe(3); // header+footer+p0
    expect(t.headerElements[0]!.showBorder).toBe(false);
    expect(t.footerElements[0]!.showBorder).toBe(false);
    expect(pages[0]![0]!.showBorder).toBe(false);
    expect(pages[1]![0]!.showBorder).toBe(true);
    expect(t.coverHeaderElements[0]!.showBorder).toBe(true);

    expect(hideBordersOnTemplateSheet(t, "body", 1)).toBe(1); // 仅 p1；眉脚已 false
    expect(pages[1]![0]!.showBorder).toBe(false);
  });

  it("G4 封尾 sheet 独立；幂等第二次为 0", () => {
    const t = fixtureTemplate();
    const h = makeLayoutZoneElement("text");
    h.id = "xh";
    h.showBorder = true;
    t.backHeaderElements.push(h);
    const n1 = hideBordersOnTemplateSheet(t, "back");
    expect(n1).toBe(1);
    expect(hideBordersOnTemplateSheet(t, "back")).toBe(0);
  });

  it("G5 版式三带 helper 与模版语义一致", () => {
    const bands = {
      headerElements: [{ type: "text", showBorder: true }],
      bodyElements: [
        { type: "text", showBorder: true },
        { type: "table", showBorder: true },
      ],
      footerElements: [{ type: "pageNumber", showBorder: true }],
    };
    expect(hideBordersOnLayoutPresetBands(bands)).toBe(3);
    expect(bands.headerElements[0]!.showBorder).toBe(false);
    expect(bands.bodyElements[0]!.showBorder).toBe(false);
    expect(bands.bodyElements[1]!.showBorder).toBe(true);
    expect(bands.footerElements[0]!.showBorder).toBe(false);
  });

  it("G6 040 JSON 样例：修好前→修好后", () => {
    const t = fixtureTemplate();
    for (const [arr, id] of [
      [t.coverHeaderElements, "h1"],
      [t.coverHeaderElements, "h2"],
      [t.headerElements, "bh1"],
    ] as const) {
      const el = makeLayoutZoneElement(id === "h2" ? "parameter" : "text");
      el.id = id;
      el.showBorder = true;
      arr.push(el);
    }
    const c1 = makeElement("text");
    c1.id = "c1";
    c1.showBorder = true;
    t.coverElements.push(c1);
    const b1 = makeElement("text");
    b1.id = "b1";
    b1.showBorder = true;
    ensureBodyPages(t)[0]!.push(b1);

    hideBordersOnTemplateSheet(t, "cover");
    hideBordersOnTemplateSheet(t, "body", 0);

    expect(t.coverHeaderElements.every((e) => e.showBorder === false)).toBe(true);
    expect(t.coverElements.every((e) => e.type === "table" || e.showBorder === false)).toBe(true);
    expect(t.headerElements.every((e) => e.showBorder === false)).toBe(true);
    expect(ensureBodyPages(t)[0]!.every((e) => e.showBorder === false)).toBe(true);
  });
});
