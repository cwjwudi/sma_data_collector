<template>
  <div v-if="modelValue" class="nt-overlay" @click.self="cancel">
    <div class="nt-dialog" role="dialog" aria-modal="true">
      <h2 class="nt-h2">新建模版</h2>
      <form class="nt-form" @submit.prevent="submit">
        <label class="nt-label">模版名称<input v-model.trim="name" class="nt-input" type="text" required /></label>

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
        <div v-show="bodyMode === 'preset'" class="nt-grid-scroll">
          <div class="nt-grid">
            <button
              v-for="p in bodyPresets"
              :key="p.id"
              type="button"
              class="nt-card"
              :class="{ sel: selBodyPreset === p.id }"
              @click="selBodyPreset = p.id"
            >
              {{ p.name }}
              <small>{{ paperShort(p.paperKind) }} · {{ ori(p.orientation) }}</small>
            </button>
          </div>
        </div>
        <div v-show="bodyMode === 'blank'" class="nt-grid-scroll">
          <div class="nt-grid">
            <button
              v-for="c in blanks"
              :key="`${c.pk}:${c.o}`"
              type="button"
              class="nt-card"
              :class="{ sel: selBlankKey === `${c.pk}:${c.o}` }"
              @click="selBlankKey = `${c.pk}:${c.o}`"
            >
              {{ paperShort(c.pk) }}
              <small>{{ ori(c.o) }}</small>
            </button>
          </div>
        </div>

        <h3 class="nt-h3">封面</h3>
        <div class="nt-row">
          <label><input v-model="coverMode" type="radio" value="none" /> 不使用封面版式</label>
          <label><input v-model="coverMode" type="radio" value="preset" :disabled="coverPresets.length === 0" /> 选用封面版式</label>
        </div>
        <p v-if="coverPresets.length === 0" class="nt-warn">
          暂无封面版式。请先在「数据源」侧维护版式的应用外使用 rptp 工具箱，或通过 localStorage key rptp-layout-presets 同步。
        </p>
        <div v-if="coverMode === 'preset'" class="nt-grid-scroll">
          <div class="nt-grid">
            <button
              v-for="p in coverPresets"
              :key="p.id"
              type="button"
              class="nt-card"
              :class="{ sel: selCover === p.id }"
              @click="selCover = p.id"
            >
              {{ p.name }}
              <small>{{ paperShort(p.paperKind) }} · {{ ori(p.orientation) }}</small>
            </button>
          </div>
        </div>

        <h3 class="nt-h3">末页</h3>
        <div class="nt-row">
          <label><input v-model="backMode" type="radio" value="none" /> 不使用末页版式</label>
          <label><input v-model="backMode" type="radio" value="preset" :disabled="backPresets.length === 0" /> 选用末页版式</label>
        </div>
        <p v-if="backPresets.length === 0" class="nt-warn">暂无末页版式。</p>
        <div v-if="backMode === 'preset'" class="nt-grid-scroll">
          <div class="nt-grid">
            <button
              v-for="p in backPresets"
              :key="p.id"
              type="button"
              class="nt-card"
              :class="{ sel: selBack === p.id }"
              @click="selBack = p.id"
            >
              {{ p.name }}
              <small>{{ paperShort(p.paperKind) }} · {{ ori(p.orientation) }}</small>
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
  loadLayoutPresets,
  presetZonesSnapshot,
  blankZonesSnapshot,
  type LayoutPreset,
} from "@/lib/report-template/layout-model";
import {
  createTemplate,
  type NewTemplateOptions,
  type ReportTemplate,
} from "@/lib/report-template/model";
import { getLayoutPresetById } from "@/lib/report-template/layout-presets-api";

const props = defineProps<{ modelValue: boolean }>();

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

function refreshPresets() {
  const all = loadLayoutPresets().map((p) => hydrateLayoutPreset(p));
  bodyPresets.value = all.filter((p) => p.pageRole === "normal");
  coverPresets.value = all.filter((p) => p.pageRole === "cover");
  backPresets.value = all.filter((p) => p.pageRole === "back");
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
  (v) => {
    if (v) {
      refreshPresets();
      if (bodyPresets.value.length > 0 && bodyMode.value === "blank") bodyMode.value = "preset";
      if (bodyMode.value === "preset" && !selBodyPreset.value && bodyPresets.value.length) {
        selBodyPreset.value = bodyPresets.value[0]!.id;
      }
      if (bodyPresets.value.length === 0) bodyMode.value = "blank";
    }
  },
);

watch(bodyMode, (m) => {
  if (m === "preset" && !selBodyPreset.value && bodyPresets.value.length) {
    selBodyPreset.value = bodyPresets.value[0]!.id;
  }
});

const bodyHint = computed(() =>
  bodyPresets.value.length === 0
    ? "暂无「正文页」版式记录于本机；已切换到空白纸张。若需预设版式请将 rptp 中的版式数据同步到同源 localStorage（rptp-layout-presets）。"
    : "选择正文：自定义版式（正文用途）或使用空白纸张。",
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
      headerText: "",
      footerText: "",
      headerElements: [],
      footerElements: [],
    };
  }

  const emptyZones = blankZonesSnapshot();
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
  width: min(720px, 100%);
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
.nt-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 13px;
}
.nt-hint,
.nt-warn {
  margin: 0 0 0.5rem;
  font-size: 12px;
  color: #52525b;
}
.nt-warn {
  color: #b45309;
}
.nt-grid-scroll {
  max-height: 160px;
  overflow: auto;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  padding: 6px;
  margin-bottom: 0.35rem;
}
.nt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
  gap: 6px;
}
.nt-card {
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  background: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  min-height: 56px;
  touch-action: manipulation;
}
.nt-card:hover {
  border-color: #c4c4cc;
}
.nt-card small {
  color: #71717a;
  font-size: 11px;
}
.nt-card.sel {
  outline: 2px solid #6366f1;
  border-color: #6366f1;
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
