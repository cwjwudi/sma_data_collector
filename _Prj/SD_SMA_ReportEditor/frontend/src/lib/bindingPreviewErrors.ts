import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";

const BINDING_ERR_PREFIX = /^（(?:OPC|SQL|填充)）/;

export function collectBindingPreviewIssues(
  values: Record<string, BindingPreviewCell>,
): string[] {
  const issues: string[] = [];
  for (const [key, cell] of Object.entries(values)) {
    const text = (cell.text || "").trim();
    if (BINDING_ERR_PREFIX.test(text) && text.length > 4) {
      issues.push(`${key}：${text}`);
    }
    if (cell.tableSqlFill?.error) {
      issues.push(`${key}（表格填充）：${cell.tableSqlFill.error}`);
    }
  }
  return issues;
}

export function summarizeBindingPreviewIssues(issues: string[]): string {
  if (!issues.length) return "";
  const shown = issues.slice(0, 5);
  const more = issues.length > shown.length ? `\n…另有 ${issues.length - shown.length} 处绑定报错` : "";
  return `数据源填充失败（${issues.length} 处）：\n${shown.join("\n")}${more}`;
}
