/** 数据源配置变更通知：AI 工具 / 外部 API 改 config 后刷新 UI，无需手动 reload。 */

export type DatasourceSyncScope = 'db' | 'opcua' | 'all'

export const DATASOURCE_CHANGED_EVENT = 'report-editor-datasource-changed'

export type DatasourceChangedDetail = {
  scope?: DatasourceSyncScope
  reason?: string
}

export function notifyDatasourceChanged(
  scope: DatasourceSyncScope = 'all',
  reason?: string,
): void {
  window.dispatchEvent(
    new CustomEvent<DatasourceChangedDetail>(DATASOURCE_CHANGED_EVENT, {
      detail: { scope, reason },
    }),
  )
}

export function fingerprintDatasourceLists(
  db: Array<{ id?: string }>,
  opc: Array<{ id?: string }>,
): string {
  const dbIds = db
    .map((x) => x.id)
    .filter(Boolean)
    .sort()
    .join(',')
  const opcIds = opc
    .map((x) => x.id)
    .filter(Boolean)
    .sort()
    .join(',')
  return `${dbIds}|${opcIds}`
}

export function scopeMatches(
  eventScope: DatasourceSyncScope | undefined,
  target: 'db' | 'opcua',
): boolean {
  return !eventScope || eventScope === 'all' || eventScope === target
}
