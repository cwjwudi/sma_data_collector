/** 客户端 localStorage 偏好镜像到后端，供 AI 工具读取输出目录、排序、触发、历史等。 */
import { apiFetch } from '@/api/client.js'
import { loadLayoutDisplayOrder, saveLayoutDisplayOrderMap } from '@/lib/layout-display-order'
import { loadReportExportPrefs } from '@/lib/report-export-prefs'
import { loadReportGeneratorPrefs, saveReportGeneratorPrefs } from '@/lib/report-generator-prefs'
import { loadTemplateDisplayOrder, saveTemplateDisplayOrder } from '@/lib/template-display-order'
import { notifyAssetsChanged, notifyDatasourceChanged } from '@/lib/datasource-sync-events'

async function buildExportHistorySummary(): Promise<Record<string, unknown> | null> {
  try {
    const prefs = loadReportExportPrefs()
    const dir = prefs.watchDir || loadReportGeneratorPrefs().autoExportDir || ''
    const api = window.electronAPI
    if (!dir || !api?.scanExportPdfs) return null
    const res = await api.scanExportPdfs({ dir })
    const rows = Array.isArray(res?.files) ? res.files : Array.isArray(res) ? res : []
    const totalBytes = rows.reduce((s: number, r: { sizeBytes?: number }) => s + (Number(r.sizeBytes) || 0), 0)
    const recent = rows.slice(0, 15).map((r: { name?: string; filePath?: string; sizeBytes?: number; modifiedAt?: string }) => ({
      name: r.name,
      filePath: r.filePath,
      sizeBytes: r.sizeBytes,
      modifiedAt: r.modifiedAt,
    }))
    return {
      watchDir: dir,
      count: rows.length,
      totalBytes,
      scannedAt: new Date().toISOString(),
      recent,
    }
  } catch {
    return null
  }
}

export async function syncPendingClientPrefsFromBackend(): Promise<void> {
  try {
    const data = (await apiFetch('/settings/client_prefs/mirror')) as {
      pending_apply?: boolean
      report_generator?: Record<string, unknown>
      report_export?: Record<string, unknown>
      template_display_order?: string[]
      layout_display_order?: Record<string, string[]>
      ui_reload?: { assets?: boolean; datasource?: boolean; connection_probe?: boolean; reason?: string }
    }
    if (data?.pending_apply) {
      applyPendingMirrorFromBackend(data)
      await apiFetch('/settings/client_prefs/mirror', {
        method: 'POST',
        body: { ...(await buildMirrorBody()), pending_apply: false, ui_reload: {} },
      })
    }
  } catch {
    /* 后端未起时静默 */
  }
}

async function buildMirrorBody(): Promise<Record<string, unknown>> {
  const report_generator = loadReportGeneratorPrefs()
  const report_export = loadReportExportPrefs()
  const template_display_order = loadTemplateDisplayOrder()
  const layout_display_order = loadLayoutDisplayOrder()
  const export_history_summary = await buildExportHistorySummary()
  return {
    report_generator,
    report_export,
    template_display_order,
    layout_display_order,
    ...(export_history_summary ? { export_history_summary } : {}),
  }
}

export async function mirrorClientPrefsToBackend(): Promise<void> {
  try {
    await syncPendingClientPrefsFromBackend()
    await apiFetch('/settings/client_prefs/mirror', {
      method: 'POST',
      body: await buildMirrorBody(),
    })
  } catch {
    /* 后端未起时静默 */
  }
}

export function applyPendingMirrorFromBackend(data: {
  report_generator?: Record<string, unknown>
  report_export?: Record<string, unknown>
  template_display_order?: string[]
  layout_display_order?: Record<string, string[]>
  pending_apply?: boolean
  ui_reload?: { assets?: boolean; datasource?: boolean; connection_probe?: boolean; reason?: string }
}): void {
  if (!data?.pending_apply) return
  try {
    if (data.report_generator) {
      // 合并写入，避免整对象覆盖丢字段
      const cur = loadReportGeneratorPrefs() as unknown as Record<string, unknown>
      const merged = { ...cur, ...data.report_generator }
      if (data.report_generator.auto && typeof data.report_generator.auto === 'object') {
        merged.auto = { ...(cur.auto as object), ...(data.report_generator.auto as object) }
      }
      localStorage.setItem('reportGeneratorPrefsV1', JSON.stringify(merged))
      try {
        saveReportGeneratorPrefs(loadReportGeneratorPrefs())
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent('report-generator-prefs-updated'))
    }
    if (data.report_export) {
      localStorage.setItem('reportExportPrefsV1', JSON.stringify(data.report_export))
    }
    if (Array.isArray(data.template_display_order)) {
      saveTemplateDisplayOrder(data.template_display_order.filter((x) => typeof x === 'string'))
      notifyAssetsChanged('template_order')
    }
    if (data.layout_display_order && typeof data.layout_display_order === 'object') {
      saveLayoutDisplayOrderMap(data.layout_display_order as Parameters<typeof saveLayoutDisplayOrderMap>[0])
      notifyAssetsChanged('layout_order')
    }
    const reload = data.ui_reload
    if (reload?.assets) {
      notifyAssetsChanged(reload.reason || 'ui_reload')
    }
    if (reload?.datasource) {
      notifyDatasourceChanged('all', reload.reason || 'ui_reload')
    }
    if (reload?.connection_probe) {
      window.dispatchEvent(
        new CustomEvent('report-editor-connection-probe-changed', {
          detail: { via: 'ai', reason: reload.reason || 'ui_reload' },
        }),
      )
    }
  } catch {
    /* ignore */
  }
}
