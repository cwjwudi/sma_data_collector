import * as templatesApi from "@/api/templates";
import { loadTemplates } from "@/lib/report-template/model";

/** 将 localStorage 中的模版逐条 PUT 到后端（迁移用） */
export async function pushLocalTemplatesToApi(): Promise<{ ok: number; fail: number }> {
  const list = loadTemplates();
  let ok = 0;
  let fail = 0;
  for (const t of list) {
    try {
      await templatesApi.putTemplate(t.id, t);
      ok += 1;
    } catch {
      fail += 1;
    }
  }
  return { ok, fail };
}
