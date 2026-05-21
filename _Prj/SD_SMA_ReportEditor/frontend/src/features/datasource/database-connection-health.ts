import { ref, computed } from 'vue'
import { apiFetch } from '@/api/client.js'
import {
  probeConnectionIds,
  probeDatabaseConnection,
  summarizeConnectionHealth,
  type ConnectionHealthState,
  type ConnectionHealthSummary,
} from '@/features/datasource/connection-tab-health'

const EMPTY_SUMMARY: ConnectionHealthSummary = { ok: 0, fail: 0, total: 0 }

const dbHealthSummary = ref<ConnectionHealthSummary>({ ...EMPTY_SUMMARY })

export const dbConnectionHealth = computed(() => dbHealthSummary.value)

/** 侧边栏「数据源配置」红点：存在至少一条探测结果为失败的数据库连接 */
export const dbHasFailedConnections = computed(() => dbHealthSummary.value.fail > 0)

export function setDbHealthSummary(summary: ConnectionHealthSummary) {
  dbHealthSummary.value = summary
}

/** 拉取全部已保存连接并后台探测（供主导航轮询；在数据源页内由工作台更新同一状态） */
export async function probeAllDatabaseConnectionsForNav() {
  try {
    const data = (await apiFetch('/database/connections')) as {
      connections?: Array<{ id?: string }>
    }
    const ids = (data.connections || []).map((c) => c.id).filter(Boolean) as string[]
    if (!ids.length) {
      setDbHealthSummary({ ...EMPTY_SUMMARY })
      return
    }
    const healthById: Record<string, ConnectionHealthState> = {}
    await probeConnectionIds(
      ids,
      probeDatabaseConnection,
      (id, state) => {
        healthById[id] = state
      },
      'nav-db-health',
    )
    setDbHealthSummary(summarizeConnectionHealth(ids, healthById))
  } catch {
    /* 保留上次结果，避免网络抖动时红点误闪 */
  }
}
