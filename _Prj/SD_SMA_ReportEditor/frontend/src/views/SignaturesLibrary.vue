<template>
  <div class="page sg">
    <header class="hdr">
      <h2 class="page-title">签名库</h2>
      <button type="button" class="b primary" @click="openNew">手写新建</button>
    </header>
    <p class="muted">保存常用签字图（PNG data URL）。模版编辑器中「电子签名」控件可选用库条目并与手写共存。</p>
    <div class="sg-product-note" role="note">
      <strong>产品说明：</strong>本软件使用的是<strong>图像签章</strong>——将签字图片渲染并打印进 PDF。
      这与 Adobe Acrobat 等阅读器中的<strong>数字证书电子签名</strong>（PKCS#7 / 国密可验证签章）不是同一类产品能力；
      导出的 PDF 上看到的是签字图效果，而非可在阅读器中验证证书链的签章域。
    </div>
    <p v-if="loading" class="loading-hint">正在加载签名，请稍候…</p>
    <p v-if="msg" class="msg">{{ msg }}</p>

    <div class="tbl-panel">
      <table class="tbl">
        <thead>
          <tr>
            <th>名称</th>
            <th>预览</th>
            <th>更新</th>
            <th class="th-act">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && !rows.length">
            <td colspan="4" class="empty">正在加载签名条目…</td>
          </tr>
          <tr v-else-if="!rows.length">
            <td colspan="4" class="empty">暂无签名条目。</td>
          </tr>
          <tr v-for="r in rows" :key="r.id" :ref="(el) => setRowRef(r.id, el as Element | null)">
            <td class="td-name">{{ r.label }}</td>
            <td class="prev">
              <div class="thumb-box">
                <img v-if="r.preview" :src="r.preview" alt="" class="thumb" />
                <span v-else class="thumb-ph" aria-hidden="true">暂无预览</span>
              </div>
            </td>
            <td class="td-meta">{{ r.updated }}</td>
            <td class="td-act">
              <div class="row-actions">
                <button type="button" class="lnk" @click="rename(r.id)">改名</button>
                <button type="button" class="lnk" @click="openResign(r.id)">重新签名</button>
                <button type="button" class="lnk danger" @click="remove(r.id)">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 命名弹层优先于手写板（不依赖可能被禁用的 window.prompt） -->
    <div v-if="nameDlg" class="name-backdrop" @click.self="closeNameDlg">
      <div class="name-modal" role="dialog" aria-modal="true" aria-labelledby="name-modal-title">
        <h3 id="name-modal-title" class="name-title">新建签名条目</h3>
        <p class="name-desc">请先输入条目名称。确定后将打开手写板，并按名称在手写区内生成浅色<strong>描摹轮廓</strong>供参照书写。</p>
        <label class="name-lbl" for="sig-name-input">显示名称</label>
        <input
          id="sig-name-input"
          ref="nameInputEl"
          v-model.trim="nameInput"
          type="text"
          class="name-inp"
          maxlength="128"
          autocomplete="off"
          placeholder="例如：张三签收"
          @keydown.enter.prevent="confirmNameDlg"
        />
        <div class="name-actions">
          <button type="button" class="b-ghost" @click="closeNameDlg">取消</button>
          <button type="button" class="b primary" :disabled="!normalizeLabel(nameInput)" @click="confirmNameDlg">下一步：手写板</button>
        </div>
      </div>
    </div>

    <!-- 改名弹层（Electron 下 window.prompt 不可用，改用应用内弹层） -->
    <div v-if="renameDlg" class="name-backdrop" @click.self="closeRenameDlg">
      <div class="name-modal" role="dialog" aria-modal="true" aria-labelledby="rename-modal-title">
        <h3 id="rename-modal-title" class="name-title">修改签名名称</h3>
        <label class="name-lbl" for="sig-rename-input">显示名称</label>
        <input
          id="sig-rename-input"
          ref="renameInputEl"
          v-model.trim="renameInput"
          type="text"
          class="name-inp"
          maxlength="128"
          autocomplete="off"
          placeholder="例如：张三签收"
          @keydown.enter.prevent="confirmRenameDlg"
        />
        <div class="name-actions">
          <button type="button" class="b-ghost" @click="closeRenameDlg">取消</button>
          <button type="button" class="b primary" :disabled="!normalizeLabel(renameInput)" @click="confirmRenameDlg">
            保存
          </button>
        </div>
      </div>
    </div>

    <SignaturePadDialog
      v-model="dlg"
      title="手写签名条目"
      :subtitle="padLabel || undefined"
      :guide-outline-text="padLabel || undefined"
      @confirm="onPadOk"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import SignaturePadDialog from "@/components/report-template/SignaturePadDialog.vue";
import type { SignatureAsset } from "@/api/signatures";
import * as api from "@/api/signatures";
import {
  ensureSignatureSummaries,
  getSignatureImage,
  invalidateSignature,
  peekSignatureImage,
  primeSignatureImage,
  refreshSignatureSummaries,
} from "@/lib/signature-registry";
import { appConfirm } from "@/composables/useAppConfirm";

defineOptions({ name: "SignaturesLibrary" });

const msg = ref("");
const loading = ref(false);
const dlg = ref(false);
/**
 * 手写板意图：打开时写入，确认时消费；取消关闭时丢弃。
 * 不用零散的 pendingNew/resignId —— 避免 v-model 关板与 @confirm 竞态导致「确定了却不保存」。
 */
type PadIntent =
  | { mode: "new"; label: string }
  | { mode: "resign"; id: string; label: string };
const padIntent = ref<PadIntent | null>(null);
/** 手写板副标题 / 描摹字（与 padIntent 同步展示） */
const padLabel = computed(() => padIntent.value?.label || "");
const route = useRoute();
const router = useRouter();
const summaries = ref<Pick<SignatureAsset, "id" | "label" | "updatedAt">[]>([]);
const previews = ref<Record<string, string>>({});
const nameDlg = ref(false);
/** 命名弹窗内输入（未完成确定前不写 padIntent） */
const nameInput = ref("");
const nameInputEl = ref<HTMLInputElement | null>(null);

/** 改名弹层状态 */
const renameDlg = ref(false);
const renameId = ref("");
const renameInput = ref("");
const renameInputEl = ref<HTMLInputElement | null>(null);

const rows = computed(() =>
  summaries.value.map((s) => ({
    ...s,
    updated: (s.updatedAt || "").replace("T", " ").slice(0, 19),
    preview: previews.value[s.id],
  })),
);

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `sig_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

async function load(force = false) {
  if (!summaries.value.length) loading.value = true;
  try {
    summaries.value = force
      ? await refreshSignatureSummaries()
      : await ensureSignatureSummaries();
    /** 首屏先回填已缓存的预览；未命中的条目立即拉取（签名库条目通常很少，不依赖 IO 回调） */
    const seeded: Record<string, string> = {};
    for (const s of summaries.value) {
      const cached = peekSignatureImage(s.id);
      if (cached) seeded[s.id] = cached;
    }
    previews.value = seeded;
    await nextTick();
    ensureRowObserver();
    for (const s of summaries.value) {
      if (!previews.value[s.id]) loadPreview(s.id);
    }
  } catch (e) {
    msg.value = "加载失败：" + String((e as Error).message || e);
  } finally {
    loading.value = false;
  }
}

/** 备份恢复 / 云端下载后：清缓存并重新拉取，无需重启即可看到最新签名 */
async function onConfigRestored() {
  invalidateSignature();
  previews.value = {};
  await load(true);
}

/** 行进入视口时才拉取其预览图（懒加载） */
const rowObserver = ref<IntersectionObserver | null>(null);
const rowEls = new Map<string, Element>();

function loadPreview(id: string) {
  if (previews.value[id]) return;
  void getSignatureImage(id).then((src) => {
    if (src) previews.value = { ...previews.value, [id]: src };
  });
}

function ensureRowObserver() {
  if (rowObserver.value || typeof IntersectionObserver === "undefined") return;
  rowObserver.value = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const id = e.target instanceof HTMLElement ? e.target.dataset.sigId : "";
        if (id) loadPreview(id);
      }
    },
    { root: null, rootMargin: "300px 0px", threshold: 0.01 },
  );
  for (const el of rowEls.values()) rowObserver.value.observe(el);
}

function setRowRef(id: string, el: Element | null) {
  if (el instanceof HTMLElement) {
    el.dataset.sigId = id;
    rowEls.set(id, el);
    if (rowObserver.value) rowObserver.value.observe(el);
  } else {
    const prev = rowEls.get(id);
    if (prev && rowObserver.value) rowObserver.value.unobserve(prev);
    rowEls.delete(id);
  }
}

function closeNameDlg() {
  nameDlg.value = false;
  nameInput.value = "";
}

function confirmNameDlg() {
  const n = normalizeLabel(nameInput.value);
  if (!n) return;
  padIntent.value = { mode: "new", label: n };
  nameDlg.value = false;
  nameInput.value = "";
  dlg.value = true;
}

async function openNameStep() {
  nameInput.value = "";
  nameDlg.value = true;
  await nextTick();
  nameInputEl.value?.focus();
  nameInputEl.value?.select();
}

function openNew() {
  void openNameStep();
}

async function openNewFromRoute() {
  if (route.query.new !== "1" && route.query.new !== 1) return;
  await router.replace({
    path: route.path,
    hash: route.hash,
    query: {},
  });
  await openNameStep();
}

async function onPadOk(dataUrl: string) {
  /** 同步消费意图，再关板（关板 watch 延后清理，双保险） */
  const intent = padIntent.value;
  padIntent.value = null;
  dlg.value = false;
  if (!intent) {
    msg.value = "保存失败：手写板状态已失效，请重新点「手写新建」或「重新签名」。";
    return;
  }
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    msg.value = "保存失败：未得到有效的签名图像，请重试。";
    return;
  }
  if (intent.mode === "resign") {
    await save({
      id: intent.id,
      label: intent.label || "签名",
      imageSrc: dataUrl,
      updatedAt: new Date().toISOString(),
    });
    return;
  }
  const body: SignatureAsset = {
    id: newId(),
    label: intent.label || "签名",
    imageSrc: dataUrl,
    updatedAt: new Date().toISOString(),
  };
  await save(body);
}

/** 打开手写板为已有条目重画签名（名称不变） */
function openResign(id: string) {
  const cur = summaries.value.find((x) => x.id === id);
  padIntent.value = {
    mode: "resign",
    id,
    label: cur?.label || "",
  };
  dlg.value = true;
}

/** 手写板被取消或点遮罩关闭时丢弃意图；延后到 microtask，避免与 @confirm 抢状态 */
watch(dlg, (open) => {
  if (open) return;
  queueMicrotask(() => {
    if (!dlg.value) padIntent.value = null;
  });
});

async function save(body: SignatureAsset) {
  try {
    await api.putSignature(body.id, body);
    invalidateSignature(body.id);
    primeSignatureImage(body.id, body.imageSrc);
    previews.value = { ...previews.value, [body.id]: body.imageSrc };
    await load(true);
    msg.value = "已保存签名条目。";
  } catch (e) {
    msg.value = "保存失败：" + String((e as Error).message || e);
  }
}

async function rename(id: string) {
  const cur = summaries.value.find((x) => x.id === id);
  renameId.value = id;
  renameInput.value = cur?.label || "";
  renameDlg.value = true;
  await nextTick();
  renameInputEl.value?.focus();
  renameInputEl.value?.select();
}

function closeRenameDlg() {
  renameDlg.value = false;
  renameId.value = "";
  renameInput.value = "";
}

async function confirmRenameDlg() {
  const id = renameId.value;
  const name = normalizeLabel(renameInput.value);
  if (!id || !name) return;
  renameDlg.value = false;
  try {
    const a = await api.getSignature(id);
    await save({ ...a, label: name, updatedAt: new Date().toISOString() });
  } catch {
    msg.value = "读取条目失败";
  } finally {
    renameId.value = "";
    renameInput.value = "";
  }
}

async function remove(id: string) {
  if (
    !(await appConfirm({
      title: "删除签名条目",
      message: "删除此签名条目？模版里若有 signatureAssetId 引用将断开源文件。",
      confirmText: "删除",
      danger: true,
    }))
  ) {
    return;
  }
  try {
    await api.deleteSignature(id);
    invalidateSignature(id);
    const next = { ...previews.value };
    delete next[id];
    previews.value = next;
    await load(true);
    msg.value = "已删除。";
  } catch (e) {
    msg.value = "删除失败：" + String((e as Error).message || e);
  }
}

function normalizeLabel(s: string) {
  return s.trim().slice(0, 128);
}

onActivated(async () => {
  ensureRowObserver();
  await load();
  await openNewFromRoute();
});

onMounted(() => {
  window.addEventListener("report-editor-config-imported", onConfigRestored);
});

onUnmounted(() => {
  if (rowObserver.value) {
    rowObserver.value.disconnect();
    rowObserver.value = null;
  }
  window.removeEventListener("report-editor-config-imported", onConfigRestored);
});

watch(
  () => route.fullPath,
  async () => {
    await openNewFromRoute();
  },
);
</script>

<style scoped>
.sg {
  padding: 0 4px;
}
.hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.muted {
  font-size: 13px;
  color: #52525b;
  margin: 8px 0;
}
.sg-product-note {
  margin: 10px 0 0;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.55;
  color: #475569;
  background: rgb(255 255 255 / 0.72);
  border: 1px solid rgb(226 232 240 / 0.9);
  border-radius: 10px;
  backdrop-filter: blur(6px);
}
.msg {
  font-size: 12px;
  color: #b45309;
}
.loading-hint {
  margin: 10px 0 0;
  font-size: 13px;
  color: #4f46e5;
}
.tbl-panel {
  margin-top: 14px;
  border-radius: 12px;
  border: 1px solid rgb(228 228 231 / 0.95);
  background: rgb(255 255 255 / 0.92);
  box-shadow: 0 8px 24px rgb(15 23 42 / 0.06);
  overflow: hidden;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.tbl thead th {
  padding: 11px 14px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #64748b;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.tbl tbody td {
  padding: 12px 14px;
  vertical-align: middle;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}
.tbl tbody tr:last-child td {
  border-bottom: none;
}
.tbl tbody tr:hover td {
  background: #f8fafc;
}
.th-act {
  text-align: right;
}
.td-name {
  font-weight: 600;
  color: #1e293b;
}
.td-meta {
  color: #64748b;
  font-size: 13px;
  white-space: nowrap;
}
.thumb-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 120px;
  min-height: 52px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.thumb {
  max-height: 44px;
  max-width: 148px;
  object-fit: contain;
}
.thumb-ph {
  color: #94a3b8;
  font-size: 12px;
}
.prev {
  width: 180px;
}
.empty {
  text-align: center;
  color: #94a3b8;
  padding: 36px 16px !important;
  background: transparent !important;
}
.td-act {
  white-space: nowrap;
  text-align: right;
}
.row-actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.lnk {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 12px;
  box-sizing: border-box;
  margin: 0;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
}
.lnk:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #1e293b;
}
.lnk.danger {
  border-color: transparent;
  background: transparent;
  color: #dc2626;
}
.lnk.danger:hover {
  background: #fef2f2;
  border-color: #fecaca;
}
.b {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
}
.b.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4338ca;
}
.b.primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.page-title {
  font-size: 24px;
  font-weight: 600;
}

.name-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(24 24 27 / 0.55);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.name-modal {
  background: #fff;
  padding: 1.1rem 1.25rem 1rem;
  border-radius: 10px;
  max-width: 96vw;
  width: 400px;
  box-shadow: 0 20px 50px rgb(0 0 0 / 0.22);
}
.name-title {
  margin: 0 0 0.4rem;
  font-size: 1.05rem;
  font-weight: 600;
}
.name-desc {
  margin: 0 0 0.85rem;
  font-size: 12px;
  color: #52525b;
  line-height: 1.45;
}
.name-lbl {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #3f3f46;
  margin-bottom: 4px;
}
.name-inp {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  font-size: 14px;
}
.name-inp:focus {
  outline: 2px solid rgb(129 140 248 / 0.5);
  outline-offset: 1px;
  border-color: #818cf8;
}
.name-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
  margin-top: 12px;
}
.b-ghost {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
}
</style>
