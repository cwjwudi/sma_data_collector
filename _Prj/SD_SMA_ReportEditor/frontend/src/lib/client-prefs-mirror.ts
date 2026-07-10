/** 客户端 localStorage 偏好镜像到后端，供 AI 工具读取输出目录等。 */
import { apiFetch } from '@/api/client.js'
import { loadReportExportPrefs } from '@/lib/report-export-prefs'
import { loadReportGeneratorPrefs } from '@/lib/report-generator-prefs'

export async function syncPendingClientPrefsFromBackend(): Promise<void> {
  try {
    const data = (await apiFetch('/settings/client_prefs/mirror')) as {
      pending_apply?: boolean
      report_generator?: Record<string, unknown>
      report_export?: Record<string, unknown>
    }
    if (data?.pending_apply) {
      applyPendingMirrorFromBackend(data)
      await apiFetch('/settings/client_prefs/mirror', {
        method: 'POST',
        body: {
          report_generator: loadReportGeneratorPrefs(),
          report_export: loadReportExportPrefs(),
        },
      })
    }
  } catch {
    /* 后端未起时静默 */
  }
}

export async function mirrorClientPrefsToBackend(): Promise<void> {
  try {
    await syncPendingClientPrefsFromBackend()
    const report_generator = loadReportGeneratorPrefs()
    const report_export = loadReportExportPrefs()
    await apiFetch('/settings/client_prefs/mirror', {
      method: 'POST',
      body: { report_generator, report_export },
    })
  } catch {
    /* 后端未起时静默 */
  }
}

export function applyPendingMirrorFromBackend(data: {
  report_generator?: Record<string, unknown>
  report_export?: Record<string, unknown>
  pending_apply?: boolean
}): void {
  if (!data?.pending_apply) return
  try {
    if (data.report_generator) {
      localStorage.setItem('reportGeneratorPrefsV1', JSON.stringify(data.report_generator))
    }
    if (data.report_export) {
      localStorage.setItem('reportExportPrefsV1', JSON.stringify(data.report_export))
    }
  } catch {
    /* ignore */
  }
}
