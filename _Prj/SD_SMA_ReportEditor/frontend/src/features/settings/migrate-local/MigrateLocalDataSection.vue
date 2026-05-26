<template>
  <section class="settings-section">
    <h3 class="settings-section__title">浏览器数据迁移</h3>
    <p class="settings-hint">
      若早年只在浏览器本地（localStorage）里存过模版或版式，可在此一次性上传到本机后端。
      推荐改用下方「模版与版式云端同步」备份到 Portal。
      <strong>不是</strong>
      与数据库或 OPC 的实时同步；日常编辑直接走「保存」即可。
    </p>
    <div class="settings-actions">
      <button type="button" class="settings-btn" @click="doTemplates" :disabled="busy">
        上传本地模版到服务器
      </button>
      <button type="button" class="settings-btn" @click="doLayouts" :disabled="busy">
        上传本地版式预设（rptp-layout-presets）到服务器
      </button>
    </div>
    <p v-if="line" class="settings-msg settings-msg--warn">{{ line }}</p>
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
