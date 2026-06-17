export const DEMO_LICENSE_STORAGE_KEY = 'report-editor-demo-license'

/** 演示用有效证书码；验证成功每次累加的天数 */
export const DEMO_LICENSE_VALID_CODE = 'BR54644800'
export const DEMO_LICENSE_DAYS_PER_ACTIVATION = 400

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type DemoLicenseState = {
  expiresAt: number
  activations: number
}

export type DemoLicenseStatus = {
  active: boolean
  expiresAt: number | null
  remainingDays: number
  activations: number
}

export type DemoLicenseVerifyResult =
  | { ok: true; addedDays: number; expiresAt: number; remainingDays: number }
  | { ok: false; reason: 'invalid_code' | 'storage_error' }

export function loadDemoLicenseState(): DemoLicenseState | null {
  try {
    const raw = localStorage.getItem(DEMO_LICENSE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DemoLicenseState>
    if (typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt)) return null
    return {
      expiresAt: parsed.expiresAt,
      activations: typeof parsed.activations === 'number' && parsed.activations >= 0 ? parsed.activations : 0,
    }
  } catch {
    return null
  }
}

export function saveDemoLicenseState(state: DemoLicenseState): boolean {
  try {
    localStorage.setItem(DEMO_LICENSE_STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function remainingDaysFromExpiry(expiresAt: number, now = Date.now()): number {
  if (expiresAt <= now) return 0
  return Math.ceil((expiresAt - now) / MS_PER_DAY)
}

export function getDemoLicenseStatus(now = Date.now()): DemoLicenseStatus {
  const state = loadDemoLicenseState()
  if (!state) {
    return { active: false, expiresAt: null, remainingDays: 0, activations: 0 }
  }
  const remainingDays = remainingDaysFromExpiry(state.expiresAt, now)
  return {
    active: remainingDays > 0,
    expiresAt: state.expiresAt,
    remainingDays,
    activations: state.activations,
  }
}

export function verifyDemoLicenseCode(code: string, now = Date.now()): DemoLicenseVerifyResult {
  if (code.trim() !== DEMO_LICENSE_VALID_CODE) {
    return { ok: false, reason: 'invalid_code' }
  }

  const current = loadDemoLicenseState()
  const base =
    current && current.expiresAt > now ? current.expiresAt : now
  const expiresAt = base + DEMO_LICENSE_DAYS_PER_ACTIVATION * MS_PER_DAY
  const saved = saveDemoLicenseState({
    expiresAt,
    activations: (current?.activations ?? 0) + 1,
  })
  if (!saved) {
    return { ok: false, reason: 'storage_error' }
  }

  return {
    ok: true,
    addedDays: DEMO_LICENSE_DAYS_PER_ACTIVATION,
    expiresAt,
    remainingDays: remainingDaysFromExpiry(expiresAt, now),
  }
}

export function formatDemoLicenseExpiry(expiresAt: number): string {
  return new Date(expiresAt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
