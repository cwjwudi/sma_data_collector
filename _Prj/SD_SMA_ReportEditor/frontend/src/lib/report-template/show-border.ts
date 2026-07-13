/** 预览/导出控件外框（showBorder）相关纯函数。 */

export type ShowBorderElementLike = {
  type: string;
  showBorder: boolean;
};

/**
 * 将当前列表中非表格控件的 showBorder 设为 false。
 * @returns 实际修改的个数（已是 false 的不计）
 */
export function hideShowBordersInElements(els: ShowBorderElementLike[]): number {
  let n = 0;
  for (const el of els) {
    if (el.type === "table") continue;
    if (el.showBorder === false) continue;
    el.showBorder = false;
    n += 1;
  }
  return n;
}
