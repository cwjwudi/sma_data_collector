const STORAGE_KEY = 'report_editor_setup_wizard'
const SCHEMA_VERSION = 1

export type SetupWizardState = {
  version: number
  /** 用户走完最后一步并完成向导 */
  completed: boolean
}

function read(): SetupWizardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { version: SCHEMA_VERSION, completed: false }
    }
    const o = JSON.parse(raw) as Partial<SetupWizardState>
    if (typeof o !== 'object' || o === null) {
      return { version: SCHEMA_VERSION, completed: false }
    }
    return {
      version: typeof o.version === 'number' ? o.version : SCHEMA_VERSION,
      completed: !!o.completed,
    }
  } catch {
    return { version: SCHEMA_VERSION, completed: false }
  }
}

export function setupWizardCompleted(): boolean {
  const s = read()
  if (s.version !== SCHEMA_VERSION) {
    return false
  }
  return s.completed === true
}

export function setupWizardMarkCompleted(completed = true): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: SCHEMA_VERSION,
    completed,
  } satisfies SetupWizardState))
}
