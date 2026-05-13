<template>
  <MiniPreviewChrome variant="normal" :show-tag="false">
    <div class="msx-wrap">
    <template v-if="chunks.length === 0">
      <div class="msx-empty">无签字控件</div>
      <small class="msx-h">正文 / 封面 / 末页画布</small>
    </template>
    <div v-else class="msx-grid">
      <div v-for="(c, ix) in chunks" :key="ix" class="msx-cell">
        <div class="msx-label">{{ whereLabel[c.where] }}</div>
        <div class="msx-tile">
          <img v-if="c.imageSrc" class="msx-img" :src="c.imageSrc" alt="" />
          <span v-else class="msx-ph">{{ c.signerLabel || "签字" }}</span>
        </div>
      </div>
      <div v-if="totalCount > chunks.length" class="msx-more">+{{ totalCount - chunks.length }}</div>
    </div>
    </div>
  </MiniPreviewChrome>
</template>

<script setup lang="ts">
import MiniPreviewChrome from "@/components/report-template/MiniPreviewChrome.vue";
import { computed } from "vue";
import type { TemplateElement } from "@/lib/report-template/model";
import type { ReportTemplate } from "@/lib/report-template/model";

const props = defineProps<{ template: ReportTemplate }>();

const whereLabel = { body: "正文", cover: "封面", back: "末页" } as const;

type Where = keyof typeof whereLabel;

interface SigChunk {
  where: Where;
  imageSrc: string;
  signerLabel: string;
}

function sigs(arr: TemplateElement[], where: Where): SigChunk[] {
  return arr
    .filter((e) => e.type === "signature")
    .map((e) => ({ where, imageSrc: e.imageSrc || "", signerLabel: e.signerLabel || "" }));
}

const allSigs = computed(() => [
  ...sigs(props.template.elements, "body"),
  ...sigs(props.template.coverElements, "cover"),
  ...sigs(props.template.backElements, "back"),
]);

const totalCount = computed(() => allSigs.value.length);

const chunks = computed(() => allSigs.value.slice(0, 4));
</script>

<style scoped>
.msx-wrap {
  min-height: 120px;
  width: 100%;
  padding: 6px;
  box-sizing: border-box;
}
.msx-empty {
  font-size: 12px;
  color: #71717a;
  text-align: center;
  margin-top: 20px;
}
.msx-h {
  display: block;
  text-align: center;
  color: #a1a1aa;
  font-size: 10px;
  margin-top: 4px;
}
.msx-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.msx-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.msx-label {
  font-size: 9px;
  color: #71717a;
}
.msx-tile {
  height: 48px;
  border-radius: 4px;
  background: #fff;
  border: 1px solid #e4e4e7;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 2px;
}
.msx-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.msx-ph {
  font-size: 10px;
  color: #52525b;
}
.msx-more {
  grid-column: 1 / -1;
  text-align: center;
  font-size: 11px;
  color: #6366f1;
}
</style>
