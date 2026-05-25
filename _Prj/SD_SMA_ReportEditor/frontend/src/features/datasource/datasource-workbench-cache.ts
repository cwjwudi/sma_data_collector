import type { ConnectionHealthState } from '@/features/datasource/connection-tab-health'

export type CatalogTable = { name: string; kind?: string }

export type WorkbenchCatalogSnapshot = {
  catalog: {
    databases: string[]
    tables: CatalogTable[]
    collections: string[]
  }
  activeDatabase: string
  activeTable: string
  activeCollection: string
  gridCols: unknown[]
  gridRows: unknown[]
  gridStatus: string
  previewPage: number
  previewTotal: number | null
  sub: string
  cachedAt: number
}

export type WorkbenchSessionSnapshot = {
  connections: Record<string, unknown>[]
  activeConnId: string
  creatingNew: boolean
  connHealth: Record<string, ConnectionHealthState>
  catalogsByConnId: Record<string, WorkbenchCatalogSnapshot>
  lastProbeAt: number
  connectionsFetchedAt: number
}

const STORAGE_KEY = 'sd-sma-report-editor.datasource-workbench.v2'
const CATALOG_TTL_MS = 12 * 60 * 60 * 1000
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PROBE_TTL_MS = 2 * 60 * 1000

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function hasCatalogData(cat: WorkbenchCatalogSnapshot | null | undefined): boolean {
  return Boolean(
    cat &&
      (cat.catalog.databases?.length || cat.catalog.tables?.length || cat.catalog.collections?.length),
  )
}

function readStoredSession(): WorkbenchSessionSnapshot | null {
  if (!canUseStorage()) return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WorkbenchSessionSnapshot
    if (!Array.isArray(parsed?.connections)) return null
    if (Date.now() - Number(parsed.connectionsFetchedAt || 0) > SESSION_TTL_MS) return null
    return {
      connections: parsed.connections || [],
      activeConnId: parsed.activeConnId || '',
      creatingNew: Boolean(parsed.creatingNew),
      connHealth: parsed.connHealth || {},
      catalogsByConnId: parsed.catalogsByConnId || {},
      lastProbeAt: Number(parsed.lastProbeAt || 0),
      connectionsFetchedAt: Number(parsed.connectionsFetchedAt || 0),
    }
  } catch {
    return null
  }
}

function persistStoredSession(snapshot: WorkbenchSessionSnapshot | null) {
  if (!canUseStorage()) return
  try {
    if (!snapshot) {
      window.localStorage.removeItem(STORAGE_KEY)
      return
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    /* localStorage may be full or unavailable; in-memory cache still works. */
  }
}

let session: WorkbenchSessionSnapshot | null = readStoredSession()

function emptySession(): WorkbenchSessionSnapshot {
  return {
    connections: [],
    activeConnId: '',
    creatingNew: false,
    connHealth: {},
    catalogsByConnId: {},
    lastProbeAt: 0,
    connectionsFetchedAt: 0,
  }
}

export function getWorkbenchSession(): WorkbenchSessionSnapshot | null {
  return session
}

export function saveWorkbenchSession(snapshot: WorkbenchSessionSnapshot) {
  session = snapshot
  persistStoredSession(snapshot)
}

export function clearWorkbenchSession() {
  session = null
  persistStoredSession(null)
}

export function getCatalogSnapshot(connId: string): WorkbenchCatalogSnapshot | null {
  const cat = session?.catalogsByConnId[connId]
  if (!cat) return null
  if (Date.now() - cat.cachedAt > CATALOG_TTL_MS) return null
  if (!hasCatalogData(cat)) return null
  return cat
}

export function setCatalogSnapshot(connId: string, snapshot: WorkbenchCatalogSnapshot) {
  if (!hasCatalogData(snapshot)) return
  if (!session) session = emptySession()
  session.catalogsByConnId[connId] = snapshot
  persistStoredSession(session)
}

export function deleteCatalogSnapshot(connId: string) {
  if (!session?.catalogsByConnId?.[connId]) return
  delete session.catalogsByConnId[connId]
  persistStoredSession(session)
}

export function isCatalogFresh(connId: string): boolean {
  return getCatalogSnapshot(connId) != null
}

export function shouldRefreshProbe(lastProbeAt: number): boolean {
  if (!lastProbeAt) return true
  return Date.now() - lastProbeAt > PROBE_TTL_MS
}

export function touchProbeTime() {
  if (!session) session = emptySession()
  session.lastProbeAt = Date.now()
  persistStoredSession(session)
}

export function getLastProbeAt(): number {
  return session?.lastProbeAt ?? 0
}
