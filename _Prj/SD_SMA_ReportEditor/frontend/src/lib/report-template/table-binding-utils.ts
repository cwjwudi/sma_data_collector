/** 表格单元格绑定与「整表 SQL 填充」互斥判断 */

export function gridHasNonNoneBinding(grid: { bindingKind: string }[][]): boolean {
  for (const row of grid) {
    for (const c of row) {
      if (c.bindingKind !== "none") return true;
    }
  }
  return false;
}

export function clearGridCellBindings(
  grid: { bindingKind: string; opcuaNodeId: string; sqlText: string }[][],
): void {
  for (const row of grid) {
    for (const c of row) {
      c.bindingKind = "none";
      c.opcuaNodeId = "";
      c.sqlText = "";
    }
  }
}
