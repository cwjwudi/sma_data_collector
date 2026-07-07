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

    <table class="tbl">
      <thead>
        <tr>
          <th>名称</th>
          <th>预览</th>
          <th>更新</th>
          <th></th>
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
          <td>{{ r.label }}</td>
          <td class="prev">
            <img v-if="r.preview" :src="r.preview" alt="" class="thumb" />
            <span v-else class="thumb-ph" aria-hidden="true">…</span>
          </td>
          <td>{{ r.updated }}</td>
          <td class="td-act">
            <div class="row-actions">
              <a href="#" class="lnk" @click.prevent="rename(r.id)">改名</a>
              <a href="#" class="lnk" @click.prevent="openResign(r.id)">重新签名</a>
              <a href="#" class="lnk danger" @click.prevent="remove(r.id)">删除</a>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

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
      :subtitle="pendingLabel || undefined"
      :guide-outline-text="pendingLabel || undefined"
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
const pendingNew = ref(false);
/** 新建流程：手写板打开前已输入的名称 */
const pendingLabel = ref("");
/** 重新签名：当前正在重画的条目 id（保留其 id 与名称，仅替换签名图） */
const resignId = ref("");
const route = useRoute();
const router = useRouter();
const summaries = ref<Pick<SignatureAsset, "id" | "label" | "updatedAt">[]>([]);
const previews = ref<Record<string, string>>({});
const nameDlg = ref(false);
/** 命名弹窗内输入（未完成确定前不写 pendingLabel） */
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
  msg.value = "";
  if (!summaries.value.length) loading.value = true;
  try {
    summaries.value = force
      ? await refreshSignatureSummaries()
      : await ensureSignatureSummaries();
    /** 首屏先回填已缓存的预览；其余按行进入视口时懒加载，避免一次性 N+1 拉全部图 */
    const seeded: Record<string, string> = {};
    for (const s of summaries.value) {
      const cached = peekSignatureImage(s.id);
      if (cached) seeded[s.id] = cached;
    }
    previews.value = seeded;
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
  pendingNew.value = true;
  pendingLabel.value = n;
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
  const wasNew = pendingNew.value;
  const resignTarget = resignId.value;
  const label = normalizeLabel(pendingLabel.value) || "签名";
  pendingNew.value = false;
  pendingLabel.value = "";
  resignId.value = "";
  dlg.value = false;
  if (resignTarget) {
    /** 重新签名：保留原 id 与名称，仅替换签名图 */
    const cur = summaries.value.find((x) => x.id === resignTarget);
    await save({
      id: resignTarget,
      label: cur?.label || label,
      imageSrc: dataUrl,
      updatedAt: new Date().toISOString(),
    });
    return;
  }
  if (!wasNew) return;
  const body: SignatureAsset = {
    id: newId(),
    label,
    imageSrc: dataUrl,
    updatedAt: new Date().toISOString(),
  };
  await save(body);
}

/** 打开手写板为已有条目重画签名（名称不变） */
function openResign(id: string) {
  const cur = summaries.value.find((x) => x.id === id);
  resignId.value = id;
  pendingNew.value = false;
  pendingLabel.value = cur?.label || "";
  dlg.value = true;
}

/** 手写板被取消或关闭时清掉待定状态（避免下一次误用旧名称） */
watch(dlg, (open) => {
  if (!open) {
    pendingNew.value = false;
    pendingLabel.value = "";
    resignId.value = "";
  }
});

async function save(body: SignatureAsset) {
  msg.value = "";
  try {
    await api.putSignature(body.id, body);
    invalidateSignature(body.id);
    primeSignatureImage(body.id, body.imageSrc);
    msg.value = "已保存签名条目。";
    await load();
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
  msg.value = "";
  try {
    await api.deleteSignature(id);
    invalidateSignature(id);
    await load();
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
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
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
.tbl {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 14px;
}
.tbl th,
.tbl td {
  border: 1px solid #e4e4e7;
  padding: 8px;
  vertical-align: middle;
}
.thumb {
  max-height: 48px;
  max-width: 160px;
  object-fit: contain;
}
.thumb-ph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 32px;
  color: #a1a1aa;
  font-size: 12px;
  background: #f4f4f5;
  border-radius: 4px;
}
.prev {
  width: 180px;
}
.empty {
  text-align: center;
  color: #71717a;
  padding: 24px;
}
.td-act {
  white-space: nowrap;
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.lnk {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 44px;
  padding: 0 14px;
  box-sizing: border-box;
  margin: 0;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(79, 70, 229, 0.12);
}
.lnk:hover {
  background: #e0e7ff;
  border-color: #a5b4fc;
}
.lnk:active {
  background: #c7d2fe;
}
.lnk.danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}
.lnk.danger:hover {
  background: #fee2e2;
  border-color: #fca5a5;
}
.lnk.danger:active {
  background: #fecaca;
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
