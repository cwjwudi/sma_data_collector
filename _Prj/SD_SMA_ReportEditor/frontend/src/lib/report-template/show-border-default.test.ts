import { describe, expect, it } from "vitest";
import {
  defaultElement,
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
import { hideShowBordersInElements } from "@/lib/report-template/show-border";
import { templateElementFromZoneElement } from "@/lib/report-template/layout-apply";

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
