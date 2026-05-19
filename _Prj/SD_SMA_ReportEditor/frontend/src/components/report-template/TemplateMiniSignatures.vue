<template>
  <MiniPreviewChrome variant="normal" :show-tag="false">
    <div class="msx-wrap">
    <template v-if="chunks.length === 0">
      <div class="msx-empty">无签字控件</div>
      <small class="msx-h">正文各页 / 封面 / 末页画布</small>
    </template>
    <div v-else class="msx-grid">
      <div v-for="(c, ix) in chunks" :key="ix" class="msx-cell">
        <div class="msx-label">{{ c.label }}</div>
        <div class="msx-tile">
          <div class="msx-sig-stack">
            <span
              v-if="signatureDisplayModeShowsWatermark(c.displayMode)"
              class="msx-sig-watermark"
              :class="{
                'msx-sig-watermark--behind':
                  signatureDisplayModeShowsHandwriting(c.displayMode) && c.imageSrc,
              }"
              >{{ (c.signerLabel || '').trim() || '签字' }}</span
            >
            <img
              v-if="signatureDisplayModeShowsHandwriting(c.displayMode) && c.imageSrc"
              class="msx-img"
              :class="{ 'msx-img--front': signatureDisplayModeShowsWatermark(c.displayMode) }"
              :src="c.imageSrc"
              alt=""
            />
            <span
              v-else-if="signatureDisplayModeShowsHandwriting(c.displayMode) && !c.imageSrc"
              class="msx-ph msx-handwriting-ph"
              >（无图）</span
            >
          </div>
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
import type { ReportTemplate, SignatureDisplayMode, TemplateElement } from "@/lib/report-template/model";
import {
  ensureBodyPages,
  normalizeSignatureDisplayMode,
  signatureDisplayModeShowsHandwriting,
  signatureDisplayModeShowsWatermark,
} from "@/lib/report-template/model";

const props = defineProps<{ template: ReportTemplate }>();

interface SigChunk {
  label: string;
  imageSrc: string;
  signerLabel: string;
  displayMode: SignatureDisplayMode;
}

function sigs(arr: TemplateElement[], label: string): SigChunk[] {
  return arr
    .filter((e) => e.type === "signature")
    .map((e) => ({
      label,
      imageSrc: e.imageSrc || "",
      signerLabel: e.signerLabel || "",
      displayMode: normalizeSignatureDisplayMode(e.signatureDisplayMode),
    }));
}

const allSigs = computed(() => {
  const t = props.template;
  const pages = ensureBodyPages(t);
  const out: SigChunk[] = [];
  pages.forEach((arr, i) => {
    out.push(...sigs(arr, pages.length > 1 ? `正文${i + 1}` : "正文"));
  });
  out.push(...sigs(t.coverElements, "封面"));
  out.push(...sigs(t.backElements, "末页"));
  return out;
});

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
.msx-sig-stack {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
}
.msx-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.msx-img--front {
  position: relative;
  z-index: 1;
}
.msx-ph {
  font-size: 10px;
}
.msx-handwriting-ph {
  opacity: 0.65;
  text-align: center;
  word-break: break-word;
  max-width: 100%;
}
.msx-sig-watermark {
  font-weight: 700;
  font-size: 11px;
  line-height: 1.2;
  text-align: center;
  word-break: break-word;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden;
  flex: 1;
  min-width: 0;
  min-height: 0;
  color: transparent;
  -webkit-text-stroke: 0.85px rgb(148 163 184 / 0.88);
  -webkit-text-fill-color: transparent;
}
.msx-sig-watermark--behind {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0 2px;
  z-index: 0;
  pointer-events: none;
}
@supports not (-webkit-text-stroke: 1px rgb(0 0 0)) {
  .msx-sig-watermark {
    color: rgb(148 163 184 / 0.5);
    -webkit-text-fill-color: currentcolor;
  }
}
.msx-more {
  grid-column: 1 / -1;
  text-align: center;
  font-size: 11px;
  color: #6366f1;
}
</style>
