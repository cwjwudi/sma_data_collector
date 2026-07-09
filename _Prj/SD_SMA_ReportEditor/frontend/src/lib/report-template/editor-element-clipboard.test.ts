import { describe, expect, it, beforeEach } from "vitest";
import {
  clearEditorElementClipboard,
  copyLayoutZoneElementToClipboard,
  copyTemplateElementToClipboard,
  hasLayoutElementClipboard,
  hasTemplateElementClipboard,
  pasteLayoutZoneElementIntoPreset,
  takeTemplateElementPasteClone,
} from "@/lib/report-template/editor-element-clipboard";
import { makeElement } from "@/lib/report-template/model";
import { makeLayoutZoneElement } from "@/lib/report-template/layout-zone-element";
import { createEmptyLayoutPreset } from "@/lib/report-template/layout-model";

describe("editor-element-clipboard", () => {
  beforeEach(() => {
    clearEditorElementClipboard();
  });

  it("copies template element with bindings and pastes a new id with offset", () => {
    const src = makeElement("parameter");
    src.x = 40;
    src.y = 60;
    src.w = 120;
    src.h = 28;
    src.text = "批次号";
    src.bindingKind = "opcua";
    src.opcuaNodeId = "ns=2;s=Batch.Id";
    src.fontSize = 14;
    src.color = "#112233";

    copyTemplateElementToClipboard(src);
    expect(hasTemplateElementClipboard()).toBe(true);

    const pasted = takeTemplateElementPasteClone(800, 1000);
    expect(pasted).not.toBeNull();
    expect(pasted!.id).not.toBe(src.id);
    expect(pasted!.x).toBe(56);
    expect(pasted!.y).toBe(76);
    expect(pasted!.text).toBe("批次号");
    expect(pasted!.bindingKind).toBe("opcua");
    expect(pasted!.opcuaNodeId).toBe("ns=2;s=Batch.Id");
    expect(pasted!.fontSize).toBe(14);
    expect(pasted!.color).toBe("#112233");
  });

  it("pastes layout zone element into preferred zone with new id", () => {
    const preset = createEmptyLayoutPreset();
    const src = makeLayoutZoneElement("text");
    src.x = 10;
    src.y = 12;
    src.text = "页眉标题";
    src.fontFamily = "SimSun";
    preset.headerElements.push(src);

    copyLayoutZoneElementToClipboard(src, "header");
    expect(hasLayoutElementClipboard()).toBe(true);

    const newId = pasteLayoutZoneElementIntoPreset(preset, "body");
    expect(newId).toBeTruthy();
    expect(newId).not.toBe(src.id);
    const hit = preset.bodyElements.find((x) => x.id === newId);
    expect(hit).toBeTruthy();
    expect(hit!.text).toBe("页眉标题");
    expect(hit!.fontFamily).toBe("SimSun");
    expect(hit!.x).toBe(26);
    expect(hit!.y).toBe(28);
  });
});
