import { describe, expect, it } from "vitest";

import {
  isOpcReadableVariableNode,
  isOpcStructuredVariableNode,
  opcTreeNodeHasExpander,
  shouldShowOpcBrowseChild,
} from "./opcua-tree-utils.js";

describe("opcua tree structure handling", () => {
  it("keeps structure variables browseable under a scalar data type filter", () => {
    const node = {
      node_class: "Variable",
      valueDataTypeLabel: "ExtensionObject",
    };

    expect(isOpcStructuredVariableNode(node)).toBe(true);
    expect(isOpcReadableVariableNode(node)).toBe(false);
    expect(shouldShowOpcBrowseChild(node, "String")).toBe(true);
    expect(opcTreeNodeHasExpander(node)).toBe(true);
  });

  it("treats backend browse containers as structure variables", () => {
    const node = {
      node_class: "Variable",
      browse_container: true,
    };

    expect(isOpcStructuredVariableNode(node)).toBe(true);
    expect(isOpcReadableVariableNode(node)).toBe(false);
    expect(shouldShowOpcBrowseChild(node, "Boolean")).toBe(true);
  });

  it("still filters ordinary scalar variables by the requested data type", () => {
    const stringNode = {
      node_class: "Variable",
      valueDataTypeLabel: "String",
    };
    const intNode = {
      node_class: "Variable",
      valueDataTypeLabel: "Int32",
    };

    expect(isOpcReadableVariableNode(stringNode)).toBe(true);
    expect(shouldShowOpcBrowseChild(stringNode, "String")).toBe(true);
    expect(shouldShowOpcBrowseChild(intNode, "String")).toBe(false);
  });
});
