<template>
  <div class="pdf-thumb">
    <img v-if="dataUrl" :src="dataUrl" class="pdf-thumb-img" alt="" draggable="false" />
    <div v-else-if="loading" class="pdf-thumb-ph">加载预览…</div>
    <div v-else class="pdf-thumb-ph" :title="error || ''">{{ error || "无法预览" }}</div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { renderPdfFirstPageThumbDataUrl } from "@/lib/pdf-thumb-render";

const props = defineProps<{
  filePath: string;
}>();

const dataUrl = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

let generation = 0;

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function loadThumb(): Promise<void> {
  const fp = props.filePath;
  const gen = ++generation;
  dataUrl.value = null;
  error.value = null;
  if (!fp) return;

  const api = window.electronAPI;
  if (!api?.getExportPdfThumbnail) {
    error.value = "无预览 API";
    return;
  }

  loading.value = true;
  try {
    const res = await api.getExportPdfThumbnail({ filePath: fp });
    if (gen !== generation) return;

    if (!res?.ok) {
      error.value = res?.error || "加载失败";
      return;
    }

    if (res.dataUrl) {
      dataUrl.value = res.dataUrl;
      return;
    }

    if (res.base64) {
      const bytes = base64ToUint8Array(res.base64);
      dataUrl.value = await renderPdfFirstPageThumbDataUrl(bytes, 360);
      return;
    }

    error.value = "无预览数据";
  } catch (e) {
    if (gen !== generation) return;
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (gen === generation) loading.value = false;
  }
}

watch(() => props.filePath, () => void loadThumb(), { immediate: true });

onBeforeUnmount(() => {
  generation++;
});
</script>

<style scoped>
.pdf-thumb {
  width: 100%;
  height: 100%;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pdf-thumb-img {
  max-width: 100%;
  max-height: 260px;
  object-fit: contain;
  display: block;
  background: #fff;
  box-shadow: 0 1px 4px rgb(24 24 27 / 0.08);
}
.pdf-thumb-ph {
  font-size: 12px;
  color: #a1a1aa;
  padding: 16px;
  text-align: center;
  line-height: 1.4;
}
</style>
