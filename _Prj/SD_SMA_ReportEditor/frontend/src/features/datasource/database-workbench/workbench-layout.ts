/** 数据库工作台主区布局态（无连接 / 仅表单时不得用三列+min-height:0 把面板压没） */

export function workbenchMainLayoutClass(hasActiveConnection: boolean): string {
  return hasActiveConnection ? "main" : "main main--solo";
}
