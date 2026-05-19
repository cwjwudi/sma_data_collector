/**
 * 可视化 SQL 填充：按连接/库/表拉取列清单（带内存缓存，供画布下拉与侧栏共用）。
 */

import { apiFetch } from "@/api/client.js";

export interface VisualSqlTableColumnMeta {
  name: string;
  type?: string;
}

const cache = new Map<string, VisualSqlTableColumnMeta[]>();

export function visualSqlColumnCatalogCacheKey(connectionId: string, database: string, table: string): string {
  return `${connectionId}\x1e${database}\x1e${table}`;
}

export async function loadVisualSqlTableColumnsCached(params: {
  connectionId: string;
  database?: string;
  table: string;
}): Promise<VisualSqlTableColumnMeta[]> {
  const cid = params.connectionId.trim();
  const tbl = params.table.trim();
  if (!cid || !tbl) return [];
  const db = (params.database ?? "").trim();
  const key = visualSqlColumnCatalogCacheKey(cid, db, tbl);
  const hit = cache.get(key);
  if (hit) return hit;

  const body = {
    connection_id: cid,
    database: db || undefined,
    table: tbl,
  };
  const data = await apiFetch("/database/table/columns", { method: "POST", body });
  const cols = (data.columns || []).map((x: { name?: string; type?: string }) => ({
    name: String(x.name ?? ""),
    type: typeof x.type === "string" ? x.type : "",
  }));
  cache.set(key, cols);
  return cols;
}

export function clearVisualSqlTableColumnCache(): void {
  cache.clear();
}
