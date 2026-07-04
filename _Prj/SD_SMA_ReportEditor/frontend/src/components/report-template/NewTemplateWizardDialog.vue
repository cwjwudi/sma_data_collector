<template>
  <div v-if="modelValue" class="nt-overlay" @click.self="cancel">
    <div class="nt-dialog" role="dialog" aria-modal="true">
      <h2 class="nt-h2">新建模版</h2>
      <form class="nt-form" @submit.prevent="submit">
        <label class="nt-label">模版名称<input v-model.trim="name" class="nt-input" type="text" required /></label>

        <h3 class="nt-h3">封面</h3>
        <p class="nt-hint">先选封面；不需要封面时选「不使用」。</p>
        <div class="nt-tabs">
          <button type="button" class="nt-tab" :class="{ active: coverMode === 'none' }" @click="coverMode = 'none'">
            不使用封面版式
          </button>
          <button
            type="button"
            class="nt-tab"
            :class="{ active: coverMode === 'preset' }"
            :disabled="coverPresets.length === 0"
            @click="coverMode = 'preset'"
          >
            选用封面版式
          </button>
        </div>
        <p v-if="coverPresets.length === 0" class="nt-warn">
          暂无封面版式。
          <a href="#/layouts" class="nt-a">前往「版式与页眉页脚」</a>
          新建一条页面用途为「封面」的记录。
        </p>
        <div v-if="coverMode === 'preset'" class="nt-grid-scroll nt-grid-scroll--thumbs">
          <div class="nt-grid nt-grid--thumbs">
            <button
              v-for="(p, i) in coverPresets"
              :key="p.id"
              type="button"
              class="nt-thumb-card"
              :class="{ sel: selCover === p.id }"
              @click="selCover = p.id"
            >
              <div class="nt-thumb-wrap">
                <LayoutPresetMiniPage :preset="p" :max-width-px="thumbMaxW" :max-height-px="thumbMaxH" />
              </div>
              <div class="nt-thumb-meta">
                <span class="nt-thumb-title">{{ i + 1 }}. {{ p.name }}</span>
                <small>{{ paperShort(p.paperKind) }} · {{ ori(p.orientation) }}</small>
              </div>
            </button>
          </div>
        </div>

        <h3 class="nt-h3">正文</h3>
        <div class="nt-tabs">
          <button type="button" class="nt-tab" :class="{ active: bodyMode === 'preset' }" @click="bodyMode = 'preset'">
            自定义版式
          </button>
          <button type="button" class="nt-tab" :class="{ active: bodyMode === 'blank' }" @click="bodyMode = 'blank'">
            空白纸张
          </button>
        </div>
        <p class="nt-hint">{{ bodyHint }}</p>
        <div v-show="bodyMode === 'preset'" class="nt-grid-scroll nt-grid-scroll--thumbs">
          <div class="nt-grid nt-grid--thumbs">
            <button
              v-for="(p, i) in bodyPresets"
              :key="p.id"
              type="button"
              class="nt-thumb-card"
              :class="{ sel: selBodyPreset === p.id }"
              @click="selBodyPreset = p.id"
            >
              <div class="nt-thumb-wrap">
                <LayoutPresetMiniPage :preset="p" :max-width-px="thumbMaxW" :max-height-px="thumbMaxH" />
              </div>
              <div class="nt-thumb-meta">
                <span class="nt-thumb-title">{{ i + 1 }}. {{ p.name }}</span>
                <small>{{ paperShort(p.paperKind) }} · {{ ori(p.orientation) }}</small>
              </div>
            </button>
          </div>
        </div>
        <div v-show="bodyMode === 'blank'" class="nt-grid-scroll nt-grid-scroll--thumbs">
          <div class="nt-grid nt-grid--thumbs">
            <button
              v-for="c in blanks"
              :key="`${c.pk}:${c.o}`"
              type="button"
              class="nt-thumb-card nt-thumb-card--blank"
              :class="{ sel: selBlankKey === `${c.pk}:${c.o}` }"
              @click="selBlankKey = `${c.pk}:${c.o}`"
            >
              <div class="nt-blank-preview" :class="'nt-blank-preview--' + c.o">
                <span class="nt-blank-ph">{{ paperShort(c.pk) }}</span>
              </div>
              <div class="nt-thumb-meta">
                <span class="nt-thumb-title">{{ paperShort(c.pk) }} 空白</span>
                <small>{{ ori(c.o) }}</small>
              </div>
            </button>
          </div>
        </div>

        <h3 class="nt-h3">末页</h3>
        <div class="nt-tabs">
          <button type="button" class="nt-tab" :class="{ active: backMode === 'none' }" @click="backMode = 'none'">
            不使用末页版式
          </button>
          <button
            type="button"
            class="nt-tab"
            :class="{ active: backMode === 'preset' }"
            :disabled="backPresets.length === 0"
            @click="backMode = 'preset'"
          >
            选用末页版式
          </button>
        </div>
        <p v-if="backPresets.length === 0" class="nt-warn">
          暂无末页版式。
          <a href="#/layouts" class="nt-a">前往「版式与页眉页脚」</a>
          新建「末页」用途记录。
        </p>
        <div v-if="backMode === 'preset'" class="nt-grid-scroll nt-grid-scroll--thumbs">
          <div class="nt-grid nt-grid--thumbs">
            <button
              v-for="(p, i) in backPresets"
              :key="p.id"
              type="button"
              class="nt-thumb-card"
              :class="{ sel: selBack === p.id }"
              @click="selBack = p.id"
            >
              <div class="nt-thumb-wrap">
                <LayoutPresetMiniPage :preset="p" :max-width-px="thumbMaxW" :max-height-px="thumbMaxH" />
              </div>
              <div class="nt-thumb-meta">
                <span class="nt-thumb-title">{{ i + 1 }}. {{ p.name }}</span>
                <small>{{ paperShort(p.paperKind) }} · {{ ori(p.orientation) }}</small>
              </div>
            </button>
          </div>
        </div>

        <div class="nt-actions">
          <button type="button" class="btn" @click="cancel">取消</button>
          <button type="submit" class="btn btn-primary">创建</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { PaperKind } from "@/lib/report-template/paper";
import { PAPER_KIND_SHORT } from "@/lib/report-template/paper";
import {
  hydrateLayoutPreset,
  presetZonesSnapshot,
  blankZonesSnapshot,
  type LayoutPreset,
  type LayoutPageRole,
} from "@/lib/report-template/layout-model";
import {
  createTemplate,
  type NewTemplateOptions,
  type ReportTemplate,
} from "@/lib/report-template/model";
import { getLayoutPresetById } from "@/lib/report-template/layout-presets-api";
import { layoutPresetsForRoleOrdered } from "@/lib/layout-display-order";
import { ensureLayoutPresetsLoaded } from "@/lib/report-template/layout-registry";
import LayoutPresetMiniPage from "@/components/report-template/LayoutPresetMiniPage.vue";

const props = defineProps<{ modelValue: boolean }>();

/** 向导内版式卡片缩略图最大尺寸（与 LayoutPresetMiniPage 默认成比例略小，便于一屏多列） */
const thumbMaxW = 112;
const thumbMaxH = 150;

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "created", tpl: ReportTemplate): void;
}>();

const name = ref("新建模版");
const bodyMode = ref<"preset" | "blank">("blank");
const coverMode = ref<"none" | "preset">("none");
const backMode = ref<"none" | "preset">("none");
const selBodyPreset = ref<string | null>(null);
const selBlankKey = ref<string>("A4:portrait");
const selCover = ref<string | null>(null);
const selBack = ref<string | null>(null);

const bodyPresets = ref<LayoutPreset[]>([]);
const coverPresets = ref<LayoutPreset[]>([]);
const backPresets = ref<LayoutPreset[]>([]);

async function refreshPresets() {
  const all = (await ensureLayoutPresetsLoaded()).map((p) => hydrateLayoutPreset(p));
  bodyPresets.value = layoutPresetsForRoleOrdered(all, "normal");
  coverPresets.value = layoutPresetsForRoleOrdered(all, "cover");
  backPresets.value = layoutPresetsForRoleOrdered(all, "back");
}

const papers = ["A5", "A4", "A3", "Letter"] as PaperKind[];
const orients = ["portrait", "landscape"] as const;
const blanks = computed(() => {
  const out: { pk: PaperKind; o: (typeof orients)[number] }[] = [];
  for (const pk of papers) {
    for (const o of orients) out.push({ pk, o });
  }
  return out;
});

watch(
  () => props.modelValue,
  async (v) => {
    if (!v) return;
    await refreshPresets();
    if (bodyPresets.value.length > 0 && bodyMode.value === "blank") bodyMode.value = "preset";
    if (bodyMode.value === "preset" && !selBodyPreset.value && bodyPresets.value.length) {
      selBodyPreset.value = bodyPresets.value[0]!.id;
    }
    if (bodyPresets.value.length === 0) bodyMode.value = "blank";
  },
);

watch(bodyMode, (m) => {
  if (m === "preset" && !selBodyPreset.value && bodyPresets.value.length) {
    selBodyPreset.value = bodyPresets.value[0]!.id;
  }
});

watch(coverMode, (m) => {
  if (m === "preset" && coverPresets.value.length) {
    if (!selCover.value || !coverPresets.value.some((p) => p.id === selCover.value)) {
      selCover.value = coverPresets.value[0]!.id;
    }
  }
});

watch(backMode, (m) => {
  if (m === "preset" && backPresets.value.length) {
    if (!selBack.value || !backPresets.value.some((p) => p.id === selBack.value)) {
      selBack.value = backPresets.value[0]!.id;
    }
  }
});

const bodyHint = computed(() =>
  bodyPresets.value.length === 0
    ? "暂无「正文页」版式。请先在侧栏打开「版式与页眉页脚」新建并保存正文用途的记录，再回到此处选用。"
    : "选择正文：页眉页脚与所选正文版式一致；或使用空白纸张（无页眉页脚区内容）。",
);

function paperShort(pk: PaperKind) {
  return PAPER_KIND_SHORT[pk];
}
function ori(o: string) {
  return o === "landscape" ? "横向" : "纵向";
}

function cancel() {
  emit("update:modelValue", false);
}

function submit() {
  type BodyPick = Pick<
    NewTemplateOptions,
    | "paperKind"
    | "orientation"
    | "layoutPresetId"
    | "layoutSnapshot"
    | "headerText"
    | "footerText"
    | "headerElements"
    | "footerElements"
  >;
  let body: BodyPick;
  if (bodyMode.value === "preset") {
    const pid = selBodyPreset.value;
    if (!pid) {
      alert("请选择一个正文版式卡片。");
      return;
    }
    const preset = getLayoutPresetById(pid);
    if (!preset) {
      alert("所选版式不存在。");
      return;
    }
    const z = presetZonesSnapshot(hydrateLayoutPreset(preset));
    body = {
      paperKind: preset.paperKind,
      orientation: preset.orientation,
      layoutPresetId: preset.id,
      layoutSnapshot: z.layoutSnapshot,
      headerText: z.headerText,
      footerText: z.footerText,
      headerElements: z.headerElements.map((x) => ({ ...x })),
      footerElements: z.footerElements.map((x) => ({ ...x })),
    };
  } else {
    const [pk, oo] = (selBlankKey.value || "").split(":");
    const pk2 = (papers.includes(pk as PaperKind) ? pk : "A4") as PaperKind;
    const oriV = oo === "landscape" ? "landscape" : "portrait";
    const z = blankZonesSnapshot();
    body = {
      paperKind: pk2,
      orientation: oriV,
      layoutPresetId: null,
      layoutSnapshot: z.layoutSnapshot,
      headerText: z.headerText,
      footerText: z.footerText,
      headerElements: z.headerElements.map((x) => ({ ...x })),
      footerElements: z.footerElements.map((x) => ({ ...x })),
    };
  }

  let coverId: string | null = null;
  let coverZ = blankZonesSnapshot();
  if (coverMode.value === "preset") {
    const cid = selCover.value;
    if (!cid) {
      alert("请选择封面版式。");
      return;
    }
    const cp = getLayoutPresetById(cid);
    if (!cp) {
      alert("封面版式不存在。");
      return;
    }
    coverId = cp.id;
    coverZ = presetZonesSnapshot(hydrateLayoutPreset(cp));
  }

  let backId: string | null = null;
  let backZ = blankZonesSnapshot();
  if (backMode.value === "preset") {
    const bid = selBack.value;
    if (!bid) {
      alert("请选择末页版式。");
      return;
    }
    const bp = getLayoutPresetById(bid);
    if (!bp) {
      alert("末页版式不存在。");
      return;
    }
    backId = bp.id;
    backZ = presetZonesSnapshot(hydrateLayoutPreset(bp));
  }

  const opts: NewTemplateOptions = {
    name: name.value || "新建模版",
    ...body,
    coverLayoutPresetId: coverId,
    coverLayoutSnapshot: coverZ.layoutSnapshot,
    coverHeaderText: coverZ.headerText,
    coverFooterText: coverZ.footerText,
    coverHeaderElements: coverZ.headerElements,
    coverFooterElements: coverZ.footerElements,
    coverBodyZoneElements: coverZ.bodyElements,
    backLayoutPresetId: backId,
    backLayoutSnapshot: backZ.layoutSnapshot,
    backHeaderText: backZ.headerText,
    backFooterText: backZ.footerText,
    backHeaderElements: backZ.headerElements,
    backFooterElements: backZ.footerElements,
    backBodyZoneElements: backZ.bodyElements,
  };

  const t = createTemplate(opts);
  emit("created", t);
  emit("update:modelValue", false);
}
</script>

<style scoped>
.nt-overlay {
  position: fixed;
  inset: 0;
  background: rgb(24 24 27 / 0.45);
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.nt-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  width: min(780px, 100%);
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.nt-h2 {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
}
.nt-h3 {
  margin: 0.85rem 0 0.4rem;
  font-size: 0.92rem;
}
.nt-form {
  overflow: auto;
  padding-right: 4px;
}
.nt-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #3f3f46;
}
.nt-input {
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
}
.nt-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.nt-tab {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fafafa;
  cursor: pointer;
  font-size: 12px;
}
.nt-tab.active {
  border-color: #6366f1;
  background: rgb(238 242 255);
  color: #4338ca;
}
.nt-tab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.nt-hint {
  margin: 0 0 0.5rem;
  font-size: 12px;
  color: #52525b;
}
.nt-warn {
  margin: 0 0 0.5rem;
  font-size: 12px;
  color: #b45309;
}
.nt-a {
  color: #4338ca;
}
.nt-grid-scroll {
  max-height: 160px;
  overflow: auto;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  padding: 6px;
  margin-bottom: 0.35rem;
}
.nt-grid-scroll--thumbs {
  max-height: 280px;
}
.nt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
  gap: 6px;
}
.nt-grid--thumbs {
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
}
.nt-thumb-card {
  text-align: center;
  padding: 6px 6px 8px;
  border-radius: 10px;
  border: 1px solid #e4e4e7;
  background: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  min-height: 0;
  touch-action: manipulation;
}
.nt-thumb-card:hover {
  border-color: #c4c4cc;
}
.nt-thumb-card.sel {
  outline: 2px solid #6366f1;
  border-color: #6366f1;
}
.nt-thumb-wrap {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 1px;
  pointer-events: none;
}
.nt-thumb-wrap :deep(.mpc-tag) {
  display: none;
}
.nt-thumb-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-width: 0;
}
.nt-thumb-title {
  font-size: 12px;
  font-weight: 600;
  color: #18181b;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.nt-thumb-meta small {
  color: #71717a;
  font-size: 10px;
}
.nt-thumb-card--blank .nt-blank-preview {
  margin-top: 4px;
}
.nt-blank-preview {
  width: 88px;
  height: 118px;
  border-radius: 4px;
  border: 2px dashed #d4d4d8;
  background: linear-gradient(180deg, #fafafa 0%, #f4f4f5 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.nt-blank-preview--landscape {
  width: 118px;
  height: 88px;
}
.nt-blank-ph {
  font-size: 11px;
  font-weight: 700;
  color: #a1a1aa;
}
.nt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f4f4f5;
}
.btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fafafa;
  cursor: pointer;
  font-size: 13px;
  touch-action: manipulation;
}
.btn-primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4338ca;
}
</style>
