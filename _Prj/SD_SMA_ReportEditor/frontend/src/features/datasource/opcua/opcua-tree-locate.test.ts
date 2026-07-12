import { describe, expect, it } from "vitest";
import {
  findOpcChildByNodeId,
  mergeOpcTreeChildren,
  opcNodeIdsEqual,
} from "./opcua-tree-locate.js";

describe("opcua-tree-locate helpers", () => {
  it("opcNodeIdsEqual trims", () => {
    expect(opcNodeIdsEqual(" ns=2;s=A ", "ns=2;s=A")).toBe(true);
    expect(opcNodeIdsEqual("a", "b")).toBe(false);
  });

  it("findOpcChildByNodeId", () => {
    const nodes = [{ node_id: "ns=1;s=X" }, { node_id: "ns=2;s=Y" }];
    expect(findOpcChildByNodeId(nodes, "ns=2;s=Y")?.node_id).toBe("ns=2;s=Y");
    expect(findOpcChildByNodeId(nodes, "missing")).toBeNull();
  });

  it("mergeOpcTreeChildren keeps existing and appends new", () => {
    const a = { node_id: "a", expanded: true };
    const b = { node_id: "b" };
    const merged = mergeOpcTreeChildren([a], [a, b]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(a);
    expect(merged[1]).toBe(b);
  });
});
