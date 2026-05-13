<template>
  <section class="msec">
    <h3 class="mtitle">浏览器数据迁移</h3>
    <p class="mtx">
      若早年只在浏览器本地（localStorage）里存过模版或版式，可在此一次性上传到后端磁盘，便于备份、换电脑与多人共用同一 FastAPI 服务。
      <strong>不是</strong>
      与数据库或 OPC 的实时同步；日常编辑直接走「保存」即可。
    </p>
    <div class="mbox">
      <button type="button" class="b" @click="doTemplates" :disabled="busy">上传本地模版到服务器</button>
      <button type="button" class="b" @click="doLayouts" :disabled="busy">上传本地版式预设（rptp-layout-presets）到服务器</button>
    </div>
    <p v-if="line" class="mline">{{ line }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { pushLocalTemplatesToApi } from "@/composables/pushLocalTemplatesToApi";
import * as layoutsApi from "@/api/layoutPresets";
import { loadLayoutPresets, hydrateLayoutPreset } from "@/lib/report-template/layout-model";
import { refreshLayoutPresets } from "@/lib/report-template/layout-registry";

const busy = ref(false);
const line = ref("");

async function doTemplates() {
  busy.value = true;
  line.value = "";
  try {
    const { ok, fail } = await pushLocalTemplatesToApi();
    line.value = `模版：已尝试 ${ok + fail} 条，成功 ${ok}，失败 ${fail}。`;
  } catch (e) {
    line.value = "模版上传失败：" + String((e as Error).message || e);
  } finally {
    busy.value = false;
  }
}

async function doLayouts() {
  busy.value = true;
  line.value = "";
  try {
    const raw = loadLayoutPresets().map((p) => hydrateLayoutPreset(p));
    if (!raw.length) {
      line.value = "本地未发现版式数据（或无 rptp-layout-presets 键）。";
      return;
    }
    const res = await layoutsApi.importLayoutsBulk(raw);
    await refreshLayoutPresets();
    line.value = `版式：已导入 ${res.imported ?? raw.length} 条（服务端可能跳过无效项）。`;
  } catch (e) {
    line.value = "版式导入失败：" + String((e as Error).message || e);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.msec {
  margin-top: 2rem;
  padding: 1rem 1.25rem;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  background: #fafafa;
}
.mtitle {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}
.mtx {
  margin: 0 0 0.85rem;
  font-size: 13px;
  color: #3f3f46;
  line-height: 1.5;
}
.mbox {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.b {
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
}
.b:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.mline {
  margin: 12px 0 0;
  font-size: 12px;
  color: #a16207;
}
</style>
