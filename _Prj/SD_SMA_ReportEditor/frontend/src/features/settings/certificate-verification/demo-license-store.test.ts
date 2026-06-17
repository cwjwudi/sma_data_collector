import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEMO_LICENSE_DAYS_PER_ACTIVATION,
  DEMO_LICENSE_STORAGE_KEY,
  DEMO_LICENSE_VALID_CODE,
  getDemoLicenseStatus,
  remainingDaysFromExpiry,
  verifyDemoLicenseCode,
} from './demo-license-store'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 5, 17, 8, 0, 0)

function createLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  localStorage.removeItem(DEMO_LICENSE_STORAGE_KEY)
  vi.unstubAllGlobals()
})

describe('verifyDemoLicenseCode', () => {
  it('rejects invalid code', () => {
    expect(verifyDemoLicenseCode('wrong', NOW)).toEqual({ ok: false, reason: 'invalid_code' })
  })

  it('grants 400 days from now on first activation', () => {
    const result = verifyDemoLicenseCode(DEMO_LICENSE_VALID_CODE, NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.addedDays).toBe(DEMO_LICENSE_DAYS_PER_ACTIVATION)
    expect(result.remainingDays).toBe(400)
    expect(result.expiresAt).toBe(NOW + 400 * MS_PER_DAY)
  })

  it('accumulates from current expiry when still active', () => {
    verifyDemoLicenseCode(DEMO_LICENSE_VALID_CODE, NOW)
    const mid = NOW + 100 * MS_PER_DAY
    const result = verifyDemoLicenseCode(DEMO_LICENSE_VALID_CODE, mid)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.expiresAt).toBe(NOW + 800 * MS_PER_DAY)
    expect(result.remainingDays).toBe(700)
  })

  it('restarts from now when expired', () => {
    verifyDemoLicenseCode(DEMO_LICENSE_VALID_CODE, NOW)
    const afterExpiry = NOW + 401 * MS_PER_DAY
    const result = verifyDemoLicenseCode(DEMO_LICENSE_VALID_CODE, afterExpiry)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.expiresAt).toBe(afterExpiry + 400 * MS_PER_DAY)
  })
})

describe('getDemoLicenseStatus', () => {
  it('tracks activation count', () => {
    verifyDemoLicenseCode(DEMO_LICENSE_VALID_CODE, NOW)
    verifyDemoLicenseCode(DEMO_LICENSE_VALID_CODE, NOW)
    expect(getDemoLicenseStatus(NOW).activations).toBe(2)
  })
})

describe('remainingDaysFromExpiry', () => {
  it('returns zero when expired', () => {
    expect(remainingDaysFromExpiry(NOW - 1, NOW)).toBe(0)
  })
})
