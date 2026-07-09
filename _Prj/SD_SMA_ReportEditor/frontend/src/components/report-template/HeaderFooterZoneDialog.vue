<template>
  <div v-if="modelValue" class="hz-overlay" @click.self="close">
    <div class="hz-modal">
      <input
        ref="hzImgFileRef"
        type="file"
        accept="image/*,.svg"
        class="hz-sr-file"
        aria-hidden="true"
        tabindex="-1"
        @change="hzApplyImagePick"
      />
      <h3 class="hz-title">{{ zone === "header" ? "编辑页眉" : "编辑页脚" }} · {{ sheetLabel }}</h3>
      <div class="hz-tools">
        <span class="hz-tools-label">拖拽到灰区：</span>
        <button
          v-for="t in toolTypes"
          :key="t"
          type="button"
          class="hz-tool"
          draggable="true"
          @dragstart="(e) => onToolDragStart(e, t)"
        >
          {{ toolLabels[t] }}
        </button>
      </div>
      <div class="hz-stage-scroll">
        <div
          class="hz-stage"
          :style="stageStyle"
          @pointerdown="onStagePointerDown"
          @dragover.prevent
          @drop.prevent="onDrop"
        >
          <div ref="layerRef" class="hz-layer" :style="{ width: bandW + 'px', height: bandH + 'px' }">
          <template v-for="el in elements" :key="el.id">
            <div
              class="hz-node"
              :class="{
                selected: selId === el.id,
                'hz-node--inline-textbox': selId === el.id && (el.type === 'text' || el.type === 'box'),
              }"
              :style="nodeStyle(el)"
              @pointerdown.stop="startMove($event, el)"
            >
              <template v-if="el.type === 'image'">
                <div
                  class="hz-img-layer"
                  title="可从资源管理器拖入图片"
                  @dragover.prevent
                  @drop.prevent.stop="hzDropImage($event, el)"
                >
                  <ZoneImageCompose
                    :image-src="el.imageSrc"
                    :caption-text="el.text"
                    :caption-position="el.imageCaptionPosition"
                    :align-x="el.alignX"
                    :align-y="el.alignY"
                    :rotation-deg="el.imageRotationDeg"
                    :font-size="el.fontSize"
                    :font-family="el.fontFamily"
                    :color="el.color"
                    @replace-image="hzBeginImagePick(el)"
                  >
                    <template #placeholder>
                      <span
                        role="button"
                        tabindex="0"
                        class="hz-ph hz-ph-upload"
                        title="点击从本机选择（或拖入）"
                        @pointerdown.stop
                        @click.prevent.stop="hzBeginImagePick(el)"
                        @keyup.enter.prevent="hzBeginImagePick(el)"
                        @keyup.space.prevent="hzBeginImagePick(el)"
                      >
                        图片
                      </span>
                    </template>
                  </ZoneImageCompose>
                </div>
              </template>
              <template v-else-if="el.type === 'table'">
                <div class="hz-table-shell">
                  <table class="hz-table" :style="layoutZoneTableInnerStyle(el)">
                    <colgroup>
                      <col
                        v-for="(cw, ci) in hzZoneTableColInnerWidthsPx(el)"
                        :key="'hzcol-' + el.id + '-' + ci"
                        :style="{ width: cw + 'px' }"
                      />
                    </colgroup>
                    <tbody>
                      <tr v-for="(tRow, ri) in hzLayoutTableGrid(el)" :key="ri" :style="hzLayoutTableRowTrStyle(el)">
                        <td
                          v-for="(cell, ci) in tRow"
                          :key="ci"
                          class="hz-table-cell"
                          :class="{ 'hz-table-cell--hot': hzIsTableCellHot(el, ri, ci) }"
                          :style="hzLayoutTableCellStyle(el, ri, ci)"
                          @pointerdown.stop="hzPickTableCell(el, ri, ci)"
                        >
                          <template v-if="isVisualSqlFillOutputPickerRow(el, ri)">
                            <select
                              class="hz-table-cell-ddl tbl-sql-ddl"
                              :value="hzVisualOutputSelectValue(el, ci)"
                              @pointerdown.stop="hzPickTableCell(el, ri, ci)"
                              @change="onHzVisualOutputColumnChange(el, ci, $event)"
                            >
                              <option value="">— 空白列 —</option>
                              <option value="__sequence__">＃ 序号列</option>
                              <option
                                v-for="opt in hzVisualSqlColumnCatalog[el.id]"
                                :key="'hzfld-' + el.id + '-' + ci + '-' + opt.name"
                                :value="opt.name"
                              >
                                {{ opt.name }}
                              </option>
                            </select>
                          </template>
                          <template v-else-if="isVerticalSqlFillSlotPickerCell(el, ri, ci)">
                            <select
                              class="hz-table-cell-ddl tbl-sql-ddl"
                              :value="hzVerticalSlotSelectValue(el, ri)"
                              @pointerdown.stop="hzPickTableCell(el, ri, ci)"
                              @change="onHzVerticalSlotChange(el, ri, $event)"
                            >
                              <option value="__field__">— 请选择字段 —</option>
                              <option value="">— 空白分隔 —</option>
                              <option
                                v-for="opt in hzVisualSqlColumnCatalog[el.id]"
                                :key="'hzvfld-' + el.id + '-' + ri + '-' + opt.name"
                                :value="opt.name"
                              >
                                {{ opt.name }}
                              </option>
                            </select>
                          </template>
                          <template v-else-if="el.tableSqlFill?.enabled">
                            <span class="hz-table-cell-txt">{{ hzFormatSqlFillTableCell(el, ri, ci) }}</span>
                          </template>
                          <template v-else>
                            <textarea
                              v-if="hzIsTableCellHot(el, ri, ci)"
                              :key="'hztc-' + el.id + '-' + ri + '-' + ci"
                              v-model="cell.text"
                              class="hz-table-cell-edit"
                              rows="1"
                              spellcheck="false"
                              autofocus
                              @pointerdown.stop="hzPickTableCell(el, ri, ci)"
                              @keydown.stop
                            />
                            <span v-else class="hz-table-cell-txt">{{ hzFormatTableCellPreview(cell) }}</span>
                          </template>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <TableColumnResizeGutters
                    v-if="selId === el.id"
                    :column-widths-px="hzZoneTableColInnerWidthsPx(el)"
                    @resize-delta="(bi, dx) => onHzTableColumnResize(el, bi, dx)"
                  />
                </div>
              </template>
              <template v-else>
                <LayoutZoneInlineContent
                  :el="el"
                  :canvas-inline-edit="selId === el.id && (el.type === 'text' || el.type === 'box')"
                />
              </template>
              <template v-if="selId === el.id">
                <button
                  v-for="pos in HANDLES"
                  :key="pos"
                  type="button"
                  class="hz-handle"
                  :class="'hz-handle-' + pos"
                  tabindex="-1"
                  aria-label="缩放手柄"
                  @pointerdown.stop="startResize($event, el, pos)"
                />
              </template>
            </div>
          </template>
          <div
            v-if="hzSnapGuides.v.length || hzSnapGuides.h.length"
            class="hz-snap-guide-layer"
            aria-hidden="true"
          >
            <div
              v-for="(vx, gi) in hzSnapGuides.v"
              :key="'hzsnap-v-' + gi + '-' + vx"
              class="hz-snap-line hz-snap-line--v"
              :style="{ left: vx + 'px' }"
            />
            <div
              v-for="(hy, gi) in hzSnapGuides.h"
              :key="'hzsnap-h-' + gi + '-' + hy"
              class="hz-snap-line hz-snap-line--h"
              :style="{ top: hy + 'px' }"
            />
          </div>
        </div>
      </div>
      </div>
      <details v-if="sel" class="hz-props" open>
        <summary>属性</summary>
        <div class="hz-props-inner">
          <label v-if="sel.type === 'text' || sel.type === 'box'"
            >文字<input v-model.trim="sel.text" class="hz-inp" />
          </label>
          <BoxZoneColorPicker v-if="sel && sel.type !== 'table'" class="hz-span2" :el="sel" />
          <template v-if="sel.type === 'date'">
            <label class="hz-span2"
              >日期格式
              <select
                class="hz-inp"
                :value="hzDateFormatSelectValue"
                @change="onHzDateFormatPreset($event)"
              >
                <option v-for="p in DATE_FORMAT_PRESETS" :key="p.value" :value="p.value">
                  {{ p.label }}
                </option>
                <option value="__custom__">自定义…</option>
              </select>
            </label>
            <label v-if="hzDateFormatIsCustom" class="hz-span2"
              >自定义 pattern<br /><input
                v-model.trim="sel.dateFormat"
                class="hz-inp"
                spellcheck="false"
                placeholder="如 yyyy-MM-dd / yyyy年MM月dd日 / 含 HH:mm"
            /></label>
          </template>
          <template v-if="sel.type === 'image'">
            <label class="hz-span2">配文<br /><textarea v-model="sel.text" rows="2" class="hz-inp" /></label>
            <label class="hz-span2"
              >配文位置<select v-model="sel.imageCaptionPosition" class="hz-inp">
                <option value="none">无配文</option>
                <option value="top">图上方</option>
                <option value="bottom">图下方</option>
                <option value="left">图左侧</option>
                <option value="right">图右侧</option>
              </select></label
            >
            <label>水平位置<select v-model="sel.alignX" class="hz-inp">
              <option value="start">左</option>
              <option value="center">中</option>
              <option value="end">右</option>
            </select></label>
            <label>垂直位置<select v-model="sel.alignY" class="hz-inp">
              <option value="start">上</option>
              <option value="center">中</option>
              <option value="end">下</option>
            </select></label>
            <label class="hz-span2"
              >旋转（°）<input
                v-model.number="sel.imageRotationDeg"
                type="number"
                min="-360"
                max="360"
                class="hz-inp"
            /></label>
            <label class="hz-span2"
              >图片来源 URL / data<input v-model.trim="sel.imageSrc" class="hz-inp"
            /></label>
            <button type="button" class="hz-soft-btn hz-img-pick-btn" @click="hzPickFromPanel(sel)">
              从本机选取图片…
            </button>
            <span class="hz-img-hint">本地图片转为 data URL 随模板保存。</span>
          </template>
          <template v-if="sel.type !== 'image'">
            <label>水平位置<select v-model="sel.alignX" class="hz-inp">
              <option value="start">左</option>
              <option value="center">中</option>
              <option value="end">右</option>
            </select></label>
            <label>垂直位置<select v-model="sel.alignY" class="hz-inp">
              <option value="start">上</option>
              <option value="center">中</option>
              <option value="end">下</option>
            </select></label>
            <div
              v-if="sel.type === 'text' || sel.type === 'box' || sel.type === 'date' || sel.type === 'parameter'"
              class="hz-span2 hz-wrap-row"
            >
              <span class="hz-wrap-title">换行</span>
              <div class="hz-seg" role="group" aria-label="文本换行方式">
                <button
                  type="button"
                  class="hz-seg-btn"
                  :class="{ 'hz-seg-on': !sel.textAutoWrap }"
                  :aria-pressed="!sel.textAutoWrap"
                  @click="sel.textAutoWrap = false"
                >
                  单行
                </button>
                <button
                  type="button"
                  class="hz-seg-btn"
                  :class="{ 'hz-seg-on': sel.textAutoWrap }"
                  :aria-pressed="sel.textAutoWrap"
                  @click="sel.textAutoWrap = true"
                >
                  自动
                </button>
              </div>
              <p class="hz-wrap-hint">「自动」表示在框宽内换行，无空格长串也会断行。</p>
            </div>
          </template>
          <template v-if="sel.type === 'parameter'">
            <label class="hz-span2"
              >绑定方式<select v-model="sel.bindingKind" class="hz-inp">
                <option value="none">无</option>
                <option value="opcua">OPC UA</option>
                <option value="sql">SQL</option>
              </select></label
            >
            <div v-if="sel.bindingKind === 'none'" class="hz-span2">
              <button type="button" class="hz-soft-btn hz-img-pick-btn" @click="openHzOpcPicker('parameter')">
                从 OPC UA 地址空间选择节点…
              </button>
            </div>
            <div v-if="sel.bindingKind === 'opcua'" class="hz-span2 hz-opc-row">
              <label class="hz-grow"
                >OPC UA 节点 ID<input v-model.trim="sel.opcuaNodeId" class="hz-inp" placeholder="NodeId"
              /></label>
              <button type="button" class="hz-soft-btn hz-img-pick-btn" @click="openHzOpcPicker('parameter')">
                选择…
              </button>
            </div>
            <label v-if="sel.bindingKind === 'sql'" class="hz-span2"
              >SQL<textarea v-model="sel.sqlText" rows="4" class="hz-inp" spellcheck="false"
            /></label>
            <label class="hz-span2"
              >占位文字<input v-model.trim="sel.text" class="hz-inp" placeholder="预览"
            /></label>
          </template>
          <template v-if="sel.type === 'table'">
            <div class="hz-span2 hz-table-dims">
              <div class="hz-dim-field">
                <span class="hz-dim-title">行数</span>
                <div class="hz-dim-stepper" role="group" aria-label="表格行数">
                  <button
                    type="button"
                    class="hz-dim-btn"
                    title="减少一行"
                    aria-label="减少一行"
                    :disabled="hzTableDimRows <= 1"
                    @click="hzBumpTableDimRows(-1)"
                  >
                    −
                  </button>
                  <input
                    v-model.number="hzTableDimRows"
                    type="number"
                    min="1"
                    max="30"
                    class="hz-dim-val"
                  />
                  <button
                    type="button"
                    class="hz-dim-btn"
                    title="增加一行"
                    aria-label="增加一行"
                    :disabled="hzTableDimRows >= 30"
                    @click="hzBumpTableDimRows(1)"
                  >
                    +
                  </button>
                </div>
              </div>
              <div class="hz-dim-field">
                <span class="hz-dim-title">列数</span>
                <div class="hz-dim-stepper" role="group" aria-label="表格列数">
                  <button
                    type="button"
                    class="hz-dim-btn"
                    title="减少一列"
                    aria-label="减少一列"
                    :disabled="hzTableDimCols <= 1"
                    @click="hzBumpTableDimCols(-1)"
                  >
                    −
                  </button>
                  <input
                    v-model.number="hzTableDimCols"
                    type="number"
                    min="1"
                    max="30"
                    class="hz-dim-val"
                  />
                  <button
                    type="button"
                    class="hz-dim-btn"
                    title="增加一列"
                    aria-label="增加一列"
                    :disabled="hzTableDimCols >= 30"
                    @click="hzBumpTableDimCols(1)"
                  >
                    +
                  </button>
                </div>
              </div>
              <div class="hz-dim-field">
                <span class="hz-dim-title">行高（px）</span>
                <div class="hz-dim-stepper" role="group" aria-label="表格行高">
                  <button
                    type="button"
                    class="hz-dim-btn"
                    title="减小行高"
                    aria-label="减小行高"
                    :disabled="hzTableRowHeightModel <= TABLE_ROW_HEIGHT_MIN_PX"
                    @click="hzBumpTableRowHeight(-1)"
                  >
                    −
                  </button>
                  <input
                    v-model.number="hzTableRowHeightModel"
                    type="number"
                    :min="TABLE_ROW_HEIGHT_MIN_PX"
                    :max="TABLE_ROW_HEIGHT_MAX_PX"
                    step="1"
                    class="hz-dim-val"
                  />
                  <button
                    type="button"
                    class="hz-dim-btn"
                    title="增大行高"
                    aria-label="增大行高"
                    :disabled="hzTableRowHeightModel >= TABLE_ROW_HEIGHT_MAX_PX"
                    @click="hzBumpTableRowHeight(1)"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <div class="hz-span2 hz-table-col-widths">
              <span class="hz-dim-title">列宽</span>
              <TableColumnWidthVisualEditor
                v-if="hzZoneTableCellMetric"
                :column-widths-px="hzTableColumnInnerWidths"
                :inner-w="hzZoneTableCellMetric.innerW"
                @resize-delta="onHzTableColumnResizeFromProps"
              />
            </div>
            <p class="hz-muted hz-span2">
              {{
                hzSqlFillEnabled
                  ? "数据库填充开启：不在此编辑单元格静态文字；可视化模式下请在画布第一行选择输出列。"
                  : "在画布上单击单元格后，可设置填充色并编辑绑定。"
              }}
            </p>
            <p v-if="!hasHzTableCellPicked" class="hz-muted hz-span2">
              在画布上单击单元格后，可在此设置该单元格的填充色。
            </p>
            <p v-if="hzZoneTableCellMetric" class="hz-span2 hz-table-metric">
              单元格高度（推算）：高约 <strong>{{ formatMetricPx(hzZoneTableCellMetric.cellH) }}</strong> px
            </p>
            <template v-if="hasHzTableCellPicked && activeHzTableCell">
              <div class="hz-span2 hz-cell-fields" :key="'hzcf-' + hzEditCellRow + '-' + hzEditCellCol">
                <div class="hz-table-cell-fill-block">
                  <TableCellFillPicker v-model="activeHzTableCellFill" title="填充色" />
                </div>
                <template v-if="!hzSqlFillEnabled">
                  <label class="hz-span2"
                    >静态文字<textarea v-model.trim="activeHzTableCell.text" rows="2" class="hz-inp" spellcheck="false"
                  /></label>
                  <label class="hz-span2"
                    >单元格绑定<select v-model="activeHzTableCell.bindingKind" class="hz-inp">
                      <option value="none">无</option>
                      <option value="opcua">OPC UA</option>
                      <option value="sql">SQL</option>
                    </select></label
                  >
                  <div v-if="activeHzTableCell.bindingKind === 'none'" class="hz-span2">
                    <button type="button" class="hz-soft-btn hz-img-pick-btn" @click="openHzOpcPicker('table')">
                      从 OPC UA 选择节点…
                    </button>
                  </div>
                  <div v-if="activeHzTableCell.bindingKind === 'opcua'" class="hz-span2 hz-opc-row">
                    <label class="hz-grow"
                      >节点 ID<input v-model.trim="activeHzTableCell.opcuaNodeId" class="hz-inp"
                    /></label>
                    <button type="button" class="hz-soft-btn hz-img-pick-btn" @click="openHzOpcPicker('table')">
                      选择…
                    </button>
                  </div>
                  <template v-if="activeHzTableCell.bindingKind === 'sql'">
                    <div class="hz-span2">
                      <ScalarSqlQueryBuilder
                        :sql-text="activeHzTableCell.sqlText"
                        :fill-mode="hzTableCellScalarFillMode"
                        :visual="hzTableCellScalarVisual"
                        @update:sql-text="activeHzTableCell.sqlText = $event"
                        @update:fill-mode="hzTableCellScalarFillMode = $event"
                        @update:visual="hzTableCellScalarVisual = $event"
                      />
                    </div>
                    <div class="hz-span2">
                      <ScalarSqlParamBindingsEditor
                        :params="hzTableCellSqlParams"
                        @opc-pick="openHzTableCellSqlParamOpcPicker"
                      />
                    </div>
                  </template>
                </template>
                <p v-else class="hz-muted hz-span2">
                  数据库填充已开启：请勿编辑静态文字；可视化数据源时在画布第一行下拉选择输出字段。
                </p>
              </div>
            </template>
            <div class="hz-span2 hz-sql-fill-block">
              <div class="hz-sql-fill-row">
                <span class="hz-sql-fill-title">数据库填充</span>
                <button
                  type="button"
                  class="hz-switch"
                  :class="{ 'hz-switch--on': hzSqlFillEnabled }"
                  role="switch"
                  :aria-checked="hzSqlFillEnabled"
                  :disabled="hzSqlFillSwitchLocked"
                  @click="onHzSqlFillToggle"
                />
              </div>
              <p v-if="hzSqlFillSwitchLocked" class="hz-muted">
                存在单元格 OPC UA / SQL 绑定时无法开启；请先清空绑定。
              </p>
              <TemplateTableSqlFillFields
                v-if="hzSqlFillEnabled"
                :fill="ensureHzTableSqlFill(sel)"
                :column-count="sel.tableCols ?? 4"
                textarea-class="hz-inp"
                button-class="hz-soft-btn"
                @opc-pick-param="openHzSqlOpcPicker"
                @sync-headers="onHzSqlFillSyncHeaders"
                @layout-mode-change="onHzSqlLayoutModeChange"
                @vertical-slots-change="onHzVerticalSlotsChange"
              />
            </div>
          </template>
          <template v-if="sel.type === 'pageNumber'">
            <label class="hz-span2">形式</label>
            <select v-model="sel.pageNumberMode" class="hz-inp hz-span2">
              <option value="plain">仅数字</option>
              <option value="slashTotal">当前页/总页数</option>
              <option value="cnPage">第N页</option>
              <option value="circle">圆形框</option>
            </select>
          </template>
          <label class="hz-span2"
            >叠放顺序（越大越靠前）<input
              v-model.number="sel.zIndex"
              type="number"
              min="0"
              max="10000"
              step="1"
              class="hz-inp"
          /></label>
          <LayoutFontFamilyField v-model="sel.fontFamily" />
          <label>字号<input v-model.number="sel.fontSize" type="number" min="8" max="72" class="hz-inp" /></label>
          <label
            >X<input
              v-model="hzGeomX"
              type="text"
              inputmode="decimal"
              class="hz-inp"
              @change="commitHzGeomX"
              @keydown.enter.prevent="commitHzGeomX"
          /></label>
          <label
            >Y<input
              v-model="hzGeomY"
              type="text"
              inputmode="decimal"
              class="hz-inp"
              @change="commitHzGeomY"
              @keydown.enter.prevent="commitHzGeomY"
          /></label>
          <label
            >W<input
              v-model="hzGeomW"
              type="text"
              inputmode="decimal"
              class="hz-inp"
              @change="commitHzGeomW"
              @keydown.enter.prevent="commitHzGeomW"
          /></label>
          <label
            >H<input
              v-model="hzGeomH"
              type="text"
              inputmode="decimal"
              class="hz-inp"
              @change="commitHzGeomH"
              @keydown.enter.prevent="commitHzGeomH"
          /></label>
          <button type="button" class="btn btn-danger-outline" @click="removeSel">删除选中</button>
        </div>
      </details>
      <OpcUaNodePickerModal v-model="opcPickOpen" @confirm="onHzOpcPickConfirm" />
      <div class="hz-actions">
        <button type="button" class="btn" @click="close">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  clampZoneElement,
  clampZoneTableOuterSize,
  ensureZoneTableGrid,
  intrinsicOuterHeightForZoneTable,
  makeLayoutZoneElement,
  minOuterSizeForZoneTable,
  DATE_FORMAT_PRESETS,
  zoneTableColumnInnerWidthsPx,
  flexJustifyAlignForAxes,
  getZoneTextWrapStyle,
  normalizePageNumberMode,
  normalizeZIndex,
  zoneFillBackgroundCss,
  zoneTableInnerBackgroundCss,
  resolveTableCellBackgroundCss,
  zoneTableNodeShellBackgroundCss,
  type LayoutControlType,
  type LayoutZoneElement,
  type LayoutZoneTableCell,
} from "@/lib/report-template/layout-zone-element";
import {
  alignmentGuidesForRect,
  magneticSnapResize,
  magneticSnapTranslate,
  type SnapPeer,
} from "@/lib/report-template/layout-snap-guides";
import {
  REPORT_ZONE_TABLE_NODE_PADDING_PX,
  applyTableColumnResizeDeltaPx,
  clampTableRowHeightPx,
  formatMetricPx,
  uniformTableCellBoxPx,
  TABLE_ROW_HEIGHT_DEFAULT_PX,
  TABLE_ROW_HEIGHT_MAX_PX,
  TABLE_ROW_HEIGHT_MIN_PX,
} from "@/lib/report-template/table-cell-metrics";
import TableColumnWidthVisualEditor from "@/components/report-template/TableColumnWidthVisualEditor.vue";
import TableCellFillPicker from "@/components/report-template/TableCellFillPicker.vue";
import { metricsForSheet, type EditorSheet } from "@/lib/report-template/editor-sheet";
import type { ReportTemplate } from "@/lib/report-template/model";
import { looksLikeImageFile, pickFirstImageFileFromDataTransfer, readImageFileAsDataUrl } from "@/lib/report-template/read-image-file";
import ZoneImageCompose from "@/components/report-template/ZoneImageCompose.vue";
import LayoutFontFamilyField from "@/components/report-template/LayoutFontFamilyField.vue";
import LayoutZoneInlineContent from "@/components/report-template/LayoutZoneInlineContent.vue";
import BoxZoneColorPicker from "@/components/report-template/BoxZoneColorPicker.vue";
import OpcUaNodePickerModal from "@/features/datasource/opcua/OpcUaNodePickerModal.vue";
import TemplateTableSqlFillFields from "@/components/report-template/TemplateTableSqlFillFields.vue";
import ScalarSqlParamBindingsEditor from "@/components/report-template/ScalarSqlParamBindingsEditor.vue";
import ScalarSqlQueryBuilder from "@/components/report-template/ScalarSqlQueryBuilder.vue";
import TableColumnResizeGutters from "@/components/report-template/TableColumnResizeGutters.vue";
import type { TableSqlFillConfig, TableSqlParamBinding } from "@/lib/report-template/table-sql-fill";
import {
  defaultTableSqlFillConfig,
  ensureSqlParamSlots,
  ensureTableSqlResultColumnNames,
  ensureVisualSource,
  isVisualSqlFillOutputPickerRow,
  isVerticalSqlFillSlotPickerCell,
  visualSqlColumnPickValue,
  syncResultColumnNamesFromFirstRow,
  visualSqlStructureTableName,
  verticalSqlSlotPickValue,
  TABLE_SQL_VERTICAL_FIELD_PENDING,
} from "@/lib/report-template/table-sql-fill";
import {
  hydrateScalarSqlVisual,
  normalizeScalarSqlFillMode,
  type ScalarSqlFillMode,
  type ScalarSqlVisualConfig,
} from "@/lib/report-template/scalar-sql-visual";
import type { VisualSqlTableColumnMeta } from "@/lib/report-template/table-sql-visual-catalog";
import { loadVisualSqlTableColumnsCached } from "@/lib/report-template/table-sql-visual-catalog";
import { applyTableSqlFillOpcPick, applyVisualSqlOutputColumnPick, applyVerticalSqlSlotField, syncTableRowsForVerticalSqlSlots } from "@/lib/report-template/table-sql-visual-compile";
import { useDeferredGeomField } from "@/lib/report-template/deferred-geom-input";
import { formatSqlFillTableCellPreview } from "@/lib/report-template/table-sql-fill-preview";
import { clearGridCellBindings, gridHasNonNoneBinding } from "@/lib/report-template/table-binding-utils";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

type Handle = (typeof HANDLES)[number];

const props = defineProps<{
  modelValue: boolean;
  tmpl: ReportTemplate;
  sheet: EditorSheet;
  zone: "header" | "footer";
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
}>();

const selId = ref<string | null>(null);
const layerRef = ref<HTMLElement | null>(null);
const hzImgFileRef = ref<HTMLInputElement | null>(null);
let pendingHzImgEl: LayoutZoneElement | null = null;

const hzTablePick = ref<{ elId: string; row: number; col: number } | null>(null);

/** 拖拽/缩放时的对齐辅助线（相对眉脚灰区） */
const hzSnapGuides = ref<{ v: number[]; h: number[] }>({ v: [], h: [] });

function hzSnapPeers(): SnapPeer[] {
  return elements.value.map((e) => ({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h }));
}

function clearHzSnapGuides() {
  hzSnapGuides.value = { v: [], h: [] };
}

watch(selId, (id) => {
  const p = hzTablePick.value;
  if (!p || !id) return;
  if (p.elId !== id) hzTablePick.value = null;
});

let dragMove: {
  sid: string;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  dragStarted: boolean;
} | null = null;
let dragResize:
  | {
      sid: string;
      h: Handle;
      startX: number;
      startY: number;
      ix: number;
      iy: number;
      iw: number;
      ih: number;
    }
  | null = null;

const me = computed(() => metricsForSheet(props.tmpl, props.sheet));

const bandW = computed(() => Math.max(40, me.value.pageW - me.value.ml - me.value.mr));
const bandH = computed(() => (props.zone === "header" ? me.value.hb : me.value.fb));

const sheetLabel = computed(() =>
  props.sheet === "body" ? "正文页" : props.sheet === "cover" ? "封面" : "末页",
);

const stageStyle = computed(() => ({
  width: `${bandW.value}px`,
  height: `${Math.max(props.zone === "header" ? me.value.hb : me.value.fb, 24)}px`,
  overflow: "hidden",
  border: "1px solid #cbd5e1",
  background: "linear-gradient(#f8fafc, #f4f4f5)",
  touchAction: "none",
}));

const elements = computed(() => {
  if (props.sheet === "cover") {
    return props.zone === "header" ? props.tmpl.coverHeaderElements : props.tmpl.coverFooterElements;
  }
  if (props.sheet === "back") {
    return props.zone === "header" ? props.tmpl.backHeaderElements : props.tmpl.backFooterElements;
  }
  return props.zone === "header" ? props.tmpl.headerElements : props.tmpl.footerElements;
});

const hzVisualSqlColumnCatalog = ref<Record<string, VisualSqlTableColumnMeta[]>>({});

async function refreshHzVisualSqlColumnCatalog(): Promise<void> {
  const next: Record<string, VisualSqlTableColumnMeta[]> = {};
  for (const el of elements.value) {
    if (el.type !== "table") continue;
    const f = el.tableSqlFill;
    if (!f?.enabled || f.fillMode !== "visual") continue;
    ensureVisualSource(f);
    const vs = f.visualSource!;
    const structureTable = visualSqlStructureTableName(vs);
    if (!vs.connectionId?.trim() || !structureTable) {
      next[el.id] = [];
      continue;
    }
    try {
      next[el.id] = await loadVisualSqlTableColumnsCached({
        connectionId: vs.connectionId.trim(),
        database: vs.database?.trim(),
        table: structureTable,
      });
    } catch {
      next[el.id] = [];
    }
  }
  hzVisualSqlColumnCatalog.value = next;
}

watch(
  () => elements.value,
  () => {
    void refreshHzVisualSqlColumnCatalog();
  },
  { deep: true, immediate: true },
);

function hzVisualOutputSelectValue(el: LayoutZoneElement, ci: number): string {
  const fill = el.tableSqlFill;
  if (!fill) return "";
  return visualSqlColumnPickValue(fill, ci);
}

function onHzVisualOutputColumnChange(el: LayoutZoneElement, ci: number, ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  const fill = el.tableSqlFill;
  if (!fill || fill.fillMode !== "visual" || el.type !== "table") return;
  const cols = el.tableCols ?? 4;
  const cell = hzLayoutTableGrid(el)[0]?.[ci];
  applyVisualSqlOutputColumnPick(fill, cols, ci, v, cell);
}

function hzVerticalSlotSelectValue(el: LayoutZoneElement, ri: number): string {
  const fill = el.tableSqlFill;
  if (!fill) return TABLE_SQL_VERTICAL_FIELD_PENDING;
  return verticalSqlSlotPickValue(fill, ri - 1);
}

function onHzVerticalSlotChange(el: LayoutZoneElement, ri: number, ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  const fill = el.tableSqlFill;
  if (!fill || fill.fillMode !== "visual" || el.type !== "table") return;
  applyVerticalSqlSlotField(fill, ri - 1, v);
  syncTableRowsForVerticalSqlSlots(el, () => ensureZoneTableGrid(el));
}

const sel = computed(() =>
  selId.value ? elements.value.find((x) => x.id === selId.value) ?? null : null,
);

function commitHzGeomAndClamp() {
  const s = sel.value;
  if (s?.type === "table") clampZoneTableOuterSize(s, bandW.value, bandH.value);
}

const hzGeomXField = useDeferredGeomField(() => sel.value, "x", commitHzGeomAndClamp);
const hzGeomYField = useDeferredGeomField(() => sel.value, "y", commitHzGeomAndClamp);
const hzGeomWField = useDeferredGeomField(() => sel.value, "w", commitHzGeomAndClamp);
const hzGeomHField = useDeferredGeomField(() => sel.value, "h", commitHzGeomAndClamp);
const hzGeomX = hzGeomXField.model;
const hzGeomY = hzGeomYField.model;
const hzGeomW = hzGeomWField.model;
const hzGeomH = hzGeomHField.model;
const commitHzGeomX = hzGeomXField.commit;
const commitHzGeomY = hzGeomYField.commit;
const commitHzGeomW = hzGeomWField.commit;
const commitHzGeomH = hzGeomHField.commit;

const opcPickOpen = ref(false);
const opcPickTarget = ref<
  | "parameter"
  | "table"
  | { kind: "tableSql"; slot: number }
  | { kind: "scalarSqlCell"; slot: number }
  | null
>(null);

const hzTableDimRows = ref(3);
const hzTableDimCols = ref(4);
const hzEditCellRow = ref(0);
const hzEditCellCol = ref(0);

watch(
  () => sel.value?.id,
  () => {
    const s = sel.value;
    if (!s || s.type !== "table") return;
    ensureZoneTableGrid(s);
    hzTableDimRows.value = s.tableRows ?? 3;
    hzTableDimCols.value = s.tableCols ?? 4;
  },
);

watch(
  () => [hzTablePick.value, sel.value?.id, sel.value?.type] as const,
  ([pick, id, typ]) => {
    if (typ !== "table") return;
    if (pick && id && pick.elId === id) {
      hzEditCellRow.value = pick.row;
      hzEditCellCol.value = pick.col;
    } else {
      hzEditCellRow.value = 0;
      hzEditCellCol.value = 0;
    }
  },
);

const activeHzTableCell = computed(() => {
  const s = sel.value;
  if (!s || s.type !== "table") return null;
  const g = s.tableCells;
  if (!Array.isArray(g) || !g.length) return null;
  return g[hzEditCellRow.value]?.[hzEditCellCol.value] ?? null;
});

const hasHzTableCellPicked = computed(() => {
  const s = sel.value;
  const pick = hzTablePick.value;
  return s?.type === "table" && !!pick && pick.elId === s.id;
});

const activeHzTableCellFill = computed({
  get(): string {
    return activeHzTableCell.value?.bgColor ?? "transparent";
  },
  set(v: string) {
    const cell = activeHzTableCell.value;
    if (cell) cell.bgColor = v;
  },
});

function ensureHzTableCellSqlParams(cell: { sqlParams?: TableSqlParamBinding[] }): TableSqlParamBinding[] {
  if (!Array.isArray(cell.sqlParams)) cell.sqlParams = [];
  ensureSqlParamSlots(cell.sqlParams, 2);
  return cell.sqlParams;
}

const hzTableCellSqlParams = computed(() => {
  const cell = activeHzTableCell.value;
  if (!cell || cell.bindingKind !== "sql") return [];
  return ensureHzTableCellSqlParams(cell);
});

const hzTableCellScalarFillMode = computed<ScalarSqlFillMode>({
  get() {
    const cell = activeHzTableCell.value;
    if (!cell) return "visual";
    return normalizeScalarSqlFillMode(cell.scalarSqlFillMode, cell.sqlText);
  },
  set(v) {
    const cell = activeHzTableCell.value;
    if (cell) cell.scalarSqlFillMode = v;
  },
});

const hzTableCellScalarVisual = computed<ScalarSqlVisualConfig>({
  get() {
    // 不在 getter 中回写：仅点开面板不应把模版标记为已修改
    return hydrateScalarSqlVisual(activeHzTableCell.value?.scalarSqlVisual);
  },
  set(v) {
    const cell = activeHzTableCell.value;
    if (cell) cell.scalarSqlVisual = v;
  },
});

function openHzTableCellSqlParamOpcPicker(slot: number) {
  const cell = activeHzTableCell.value;
  if (!cell) return;
  ensureHzTableCellSqlParams(cell);
  opcPickTarget.value = { kind: "scalarSqlCell", slot };
  opcPickOpen.value = true;
}

const hzSqlFillEnabled = computed(() => sel.value?.type === "table" && !!sel.value.tableSqlFill?.enabled);

const hzAnyCellBinding = computed(() => {
  const s = sel.value;
  if (!s || s.type !== "table") return false;
  ensureZoneTableGrid(s);
  return gridHasNonNoneBinding(s.tableCells);
});

const hzSqlFillSwitchLocked = computed(() => hzAnyCellBinding.value && !hzSqlFillEnabled.value);

function onHzSqlFillToggle() {
  const s = sel.value;
  if (!s || s.type !== "table") return;
  const cfg = ensureHzTableSqlFill(s);
  if (cfg.enabled) {
    cfg.enabled = false;
    return;
  }
  ensureZoneTableGrid(s);
  if (gridHasNonNoneBinding(s.tableCells)) return;
  clearGridCellBindings(s.tableCells);
  cfg.enabled = true;
}

watch(
  () => (sel.value?.type === "table" ? sel.value.tableCells : null),
  () => {
    const s = sel.value;
    if (!s || s.type !== "table" || !s.tableSqlFill?.enabled) return;
    ensureZoneTableGrid(s);
    if (gridHasNonNoneBinding(s.tableCells)) s.tableSqlFill.enabled = false;
  },
  { deep: true },
);

const hzZoneTableCellMetric = computed(() => {
  const s = sel.value;
  if (!s || s.type !== "table") return null;
  ensureZoneTableGrid(s);
  return uniformTableCellBoxPx({
    outerW: s.w,
    outerH: s.h,
    rowCount: s.tableRows ?? 3,
    colCount: s.tableCols ?? 4,
    nodePadding: REPORT_ZONE_TABLE_NODE_PADDING_PX,
  });
});

const hzTableColumnInnerWidths = computed(() => {
  const s = sel.value;
  if (!s || s.type !== "table") return [];
  ensureZoneTableGrid(s);
  return zoneTableColumnInnerWidthsPx(s);
});

function onHzTableColumnResizeFromProps(boundaryIndex: number, deltaLayoutPx: number) {
  const s = sel.value;
  if (!s || s.type !== "table") return;
  onHzTableColumnResize(s, boundaryIndex, deltaLayoutPx);
}

const hzTableRowHeightModel = computed({
  get(): number {
    const s = sel.value;
    if (!s || s.type !== "table") return TABLE_ROW_HEIGHT_DEFAULT_PX;
    return clampTableRowHeightPx(s.tableRowHeightPx);
  },
  set(v: number) {
    const s = sel.value;
    if (!s || s.type !== "table") return;
    s.tableRowHeightPx = clampTableRowHeightPx(v);
    clampZoneTableOuterSize(s);
  },
});

function hzLayoutTableGrid(el: LayoutZoneElement): LayoutZoneTableCell[][] {
  if (el.type !== "table") return [];
  return ensureZoneTableGrid(el);
}

function hzLayoutTableRowTrStyle(el: LayoutZoneElement): Record<string, string> | undefined {
  if (el.type !== "table") return undefined;
  return { height: `${clampTableRowHeightPx(el.tableRowHeightPx)}px` };
}

function hzZoneTableColInnerWidthsPx(el: LayoutZoneElement): number[] {
  if (el.type !== "table") return [];
  return zoneTableColumnInnerWidthsPx(el);
}

function hzFormatSqlFillTableCell(el: LayoutZoneElement, ri: number, ci: number): string {
  const fill = el.tableSqlFill;
  if (!fill?.enabled) return "\u00a0";
  return formatSqlFillTableCellPreview({
    fill,
    rowIndex: ri,
    colIndex: ci,
    preview: null,
    previewLoading: false,
  });
}

function hzFormatTableCellPreview(cell: LayoutZoneTableCell): string {
  if (cell.bindingKind === "opcua") {
    const id = cell.opcuaNodeId.trim();
    return id ? `⟨UA⟩ ${id.length > 48 ? `${id.slice(0, 45)}…` : id}` : "⟨UA⟩";
  }
  if (cell.bindingKind === "sql") {
    const q = cell.sqlText.trim();
    return q ? `⟨SQL⟩ ${q.length > 36 ? `${q.slice(0, 33)}…` : q}` : "⟨SQL⟩";
  }
  const t = cell.text.trim();
  return t.length > 0 ? t : "\u00a0";
}

function hzPickTableCell(el: LayoutZoneElement, ri: number, ci: number) {
  selId.value = el.id;
  hzTablePick.value = { elId: el.id, row: ri, col: ci };
}

function hzIsTableCellHot(el: LayoutZoneElement, ri: number, ci: number): boolean {
  const p = hzTablePick.value;
  return !!(p && p.elId === el.id && p.row === ri && p.col === ci);
}

function ensureHzTableSqlFill(el: LayoutZoneElement): TableSqlFillConfig {
  if (el.type !== "table") return defaultTableSqlFillConfig();
  if (!el.tableSqlFill) el.tableSqlFill = defaultTableSqlFillConfig();
  ensureZoneTableGrid(el);
  return el.tableSqlFill;
}

function onHzTableColumnResize(el: LayoutZoneElement, boundaryIndex: number, deltaLayoutPx: number) {
  if (el.type !== "table") return;
  ensureZoneTableGrid(el);
  const cols = el.tableCols ?? 4;
  const rows = el.tableRows ?? 3;
  const u = uniformTableCellBoxPx({
    outerW: el.w,
    outerH: el.h,
    rowCount: rows,
    colCount: cols,
    nodePadding: REPORT_ZONE_TABLE_NODE_PADDING_PX,
  });
  const next = applyTableColumnResizeDeltaPx(u.innerW, cols, el.tableColWidthsPx, boundaryIndex, deltaLayoutPx);
  if (!next) return;
  el.tableColWidthsPx = next;
  clampZoneTableOuterSize(el, bandW.value, bandH.value);
}

function openHzSqlOpcPicker(slot: number) {
  // 允许负数哨兵槽位（TABLE_SQL_FILL_TABLE_PICK_SLOT = 表名 OPC 变量）
  const s = Math.floor(Number(slot)) || 0;
  opcPickTarget.value = { kind: "tableSql", slot: s };
  opcPickOpen.value = true;
}

function onHzSqlFillSyncHeaders() {
  const s = sel.value;
  if (!s || s.type !== "table" || !s.tableSqlFill?.enabled) return;
  syncResultColumnNamesFromFirstRow(s.tableSqlFill, ensureZoneTableGrid(s), s.tableCols ?? 4);
}

function onHzSqlLayoutModeChange(mode: "horizontal" | "vertical") {
  const s = sel.value;
  if (!s || s.type !== "table") return;
  if (mode === "vertical") {
    s.tableCols = 2;
    hzTableDimCols.value = 2;
    ensureZoneTableGrid(s);
    syncTableRowsForVerticalSqlSlots(s, () => ensureZoneTableGrid(s));
    hzTableDimRows.value = s.tableRows ?? 3;
  }
}

function onHzVerticalSlotsChange() {
  const s = sel.value;
  if (!s || s.type !== "table" || !s.tableSqlFill) return;
  syncTableRowsForVerticalSqlSlots(s, () => ensureZoneTableGrid(s));
  hzTableDimRows.value = s.tableRows ?? 3;
}

function openHzOpcPicker(target: "parameter" | "table") {
  opcPickTarget.value = target;
  opcPickOpen.value = true;
}

function onHzOpcPickConfirm(payload: string | { serverId: string; nodeId: string }) {
  const t = opcPickTarget.value;
  opcPickTarget.value = null;
  const id = (typeof payload === "string" ? payload : payload.nodeId).trim();
  if (!id) return;
  const s = sel.value;
  if (t === "parameter" && s?.type === "parameter") {
    s.bindingKind = "opcua";
    s.opcuaNodeId = id;
    return;
  }
  if (typeof t === "object" && t?.kind === "tableSql" && s?.type === "table") {
    // 可视化模式写入筛选条件的绑定（面板显示来源）；手写模式写入 params 槽位
    applyTableSqlFillOpcPick(ensureHzTableSqlFill(s), t.slot, id);
    return;
  }
  if (typeof t === "object" && t?.kind === "scalarSqlCell" && s?.type === "table") {
    const cell = activeHzTableCell.value;
    if (!cell) return;
    const params = ensureHzTableCellSqlParams(cell);
    ensureSqlParamSlots(params, t.slot + 1);
    const row = params[t.slot];
    if (row) {
      row.source = "opcua";
      row.opcuaNodeId = id;
    }
    return;
  }
  if (t === "table" && s?.type === "table") {
    const cell = activeHzTableCell.value;
    if (cell) {
      cell.bindingKind = "opcua";
      cell.opcuaNodeId = id;
    }
  }
}

function hzClampTableDimInput(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(30, Math.max(1, Math.floor(n)));
}

function hzBumpTableDimRows(delta: number) {
  if (sel.value?.type !== "table") return;
  hzTableDimRows.value = hzClampTableDimInput((Number(hzTableDimRows.value) || 1) + delta);
}

function hzBumpTableDimCols(delta: number) {
  if (sel.value?.type !== "table") return;
  hzTableDimCols.value = hzClampTableDimInput((Number(hzTableDimCols.value) || 1) + delta);
}

function hzBumpTableRowHeight(delta: number) {
  const s = sel.value;
  if (!s || s.type !== "table") return;
  const cur = clampTableRowHeightPx(s.tableRowHeightPx);
  s.tableRowHeightPx = clampTableRowHeightPx(cur + delta);
  clampZoneTableOuterSize(s);
}

function hzApplyTableDims() {
  const s = sel.value;
  if (!s || s.type !== "table") return;
  s.tableRows = hzClampTableDimInput(hzTableDimRows.value);
  s.tableCols = hzClampTableDimInput(hzTableDimCols.value);
  hzTableDimRows.value = s.tableRows;
  hzTableDimCols.value = s.tableCols;
  ensureZoneTableGrid(s);
  if (hzEditCellRow.value >= s.tableRows) hzEditCellRow.value = s.tableRows - 1;
  if (hzEditCellCol.value >= s.tableCols) hzEditCellCol.value = s.tableCols - 1;
  clampZoneTableOuterSize(s);
}

watch([hzTableDimRows, hzTableDimCols], ([rows, cols]) => {
  if (sel.value?.type !== "table") return;
  if (!Number.isFinite(rows) || !Number.isFinite(cols)) return;
  hzApplyTableDims();
});

const hzDateFormatSelectValue = computed(() => {
  const s = sel.value;
  if (!s || s.type !== "date") return "yyyy-MM-dd";
  const t = (s.dateFormat || "").trim();
  const hit = DATE_FORMAT_PRESETS.find((p) => p.value === t);
  return hit ? hit.value : "__custom__";
});

const hzDateFormatIsCustom = computed(() => hzDateFormatSelectValue.value === "__custom__");

function onHzDateFormatPreset(ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  const s = sel.value;
  if (!s || s.type !== "date" || v === "__custom__") return;
  s.dateFormat = v;
}

function layoutZoneTableInnerStyle(el: LayoutZoneElement): Record<string, string> {
  if (el.type !== "table") return {};
  return { background: zoneTableInnerBackgroundCss(el.bgColor) };
}

function hzLayoutTableCellStyle(el: LayoutZoneElement, ri: number, ci: number): Record<string, string> {
  if (el.type !== "table") return {};
  const cell = hzLayoutTableGrid(el)[ri]?.[ci];
  return {
    backgroundColor: resolveTableCellBackgroundCss(
      { tableBgColor: el.bgColor, tableColBgColors: el.tableColBgColors },
      ci,
      cell,
    ),
  };
}

function nodeStyle(el: LayoutZoneElement) {
  const ff = typeof el.fontFamily === "string" ? el.fontFamily.trim() : "";
  const flex = flexJustifyAlignForAxes(el.alignX, el.alignY);
  const wrap = getZoneTextWrapStyle(el);
  const base: Record<string, string> = {
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.w}px`,
    height: `${el.h}px`,
    color: el.color,
    fontSize: `${el.fontSize}px`,
    ...(ff ? { fontFamily: ff } : {}),
    display: "flex",
    justifyContent: flex.justifyContent,
    alignItems: flex.alignItems,
    zIndex: String(normalizeZIndex(el.zIndex)),
    ...(wrap ?? { whiteSpace: "nowrap" }),
  };
  if (el.type === "table") {
    return {
      ...base,
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      justifyContent: "stretch",
      padding: "2px",
      overflow: "hidden",
      backgroundColor: zoneTableNodeShellBackgroundCss(),
      whiteSpace: "normal",
    };
  }
  if (el.type === "pageNumber" && normalizePageNumberMode(el.pageNumberMode) === "circle") {
    return {
      ...base,
      padding: "2px",
      backgroundColor: "transparent",
    };
  }
  if (el.type === "box") {
    const bc = typeof el.color === "string" ? el.color : "#18181b";
    return {
      ...base,
      backgroundColor: zoneFillBackgroundCss(el.bgColor),
      border: `1px solid ${bc}40`,
      borderRadius: "4px",
      padding: "2px 6px",
    };
  }
  if (el.type === "image") {
    return {
      ...base,
      backgroundColor: zoneFillBackgroundCss(el.bgColor),
    };
  }
  return {
    ...base,
    backgroundColor: zoneFillBackgroundCss(el.bgColor),
    padding: "2px 6px",
  };
}

function onStagePointerDown() {
  selId.value = null;
}

const toolLabels: Record<LayoutControlType, string> = {
  text: "文本",
  box: "色块",
  image: "图片",
  pageNumber: "页码",
  date: "日期",
  table: "表格",
  parameter: "数据参数",
};

const toolTypes: LayoutControlType[] = [
  "text",
  "box",
  "image",
  "pageNumber",
  "date",
  "table",
  "parameter",
];

function onToolDragStart(e: DragEvent, t: LayoutControlType) {
  e.dataTransfer?.setData("application/x-zone-tool", t);
  e.dataTransfer?.setData("text/plain", t);
}

async function onDrop(e: DragEvent) {
  const lay = layerRef.value;
  if (!lay) return;
  const r = lay.getBoundingClientRect();
  const x = Math.round(e.clientX - r.left - 16);
  const y = Math.round(e.clientY - r.top - 12);

  const t = e.dataTransfer?.getData("application/x-zone-tool") || e.dataTransfer?.getData("text/plain") || "";
  if (isControl(t)) {
    const el = makeLayoutZoneElement(t);
    el.x = Math.max(0, x);
    el.y = Math.max(0, y);
    clampZoneElement(el, bandW.value, bandH.value);
    elements.value.push(el);
    selId.value = el.id;
    return;
  }

  const imgFile = pickFirstImageFileFromDataTransfer(e.dataTransfer);
  if (!imgFile) return;
  let dataUrl: string;
  try {
    dataUrl = await readImageFileAsDataUrl(imgFile);
  } catch (ex) {
    window.alert(ex instanceof Error ? ex.message : String(ex));
    return;
  }
  const el = makeLayoutZoneElement("image");
  el.imageSrc = dataUrl;
  el.x = Math.max(0, x);
  el.y = Math.max(0, y);
  clampZoneElement(el, bandW.value, bandH.value);
  elements.value.push(el);
  selId.value = el.id;
}

function isControl(t: string): t is LayoutControlType {
  return (
    t === "text" ||
    t === "box" ||
    t === "image" ||
    t === "pageNumber" ||
    t === "date" ||
    t === "table" ||
    t === "parameter"
  );
}

/** 与模版画布一致：微小位移不计入拖拽，避免点击就地输入时被误判为移动 */
const MOVE_DRAG_THRESHOLD_PX = 5;

function startMove(ev: PointerEvent, el: LayoutZoneElement) {
  clearHzSnapGuides();
  selId.value = el.id;
  dragMove = {
    sid: el.id,
    sx: ev.clientX,
    sy: ev.clientY,
    ox: el.x,
    oy: el.y,
    dragStarted: false,
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", endMove, { once: true });
}

function onMove(ev: PointerEvent) {
  if (dragMove) {
    const el = elements.value.find((x) => x.id === dragMove!.sid);
    if (!el) return;
    const dxScr = ev.clientX - dragMove.sx;
    const dyScr = ev.clientY - dragMove.sy;
    if (!dragMove.dragStarted) {
      if (Math.hypot(dxScr, dyScr) < MOVE_DRAG_THRESHOLD_PX) return;
      dragMove.dragStarted = true;
    }
    el.x = Math.max(0, dragMove.ox + dxScr);
    el.y = Math.max(0, dragMove.oy + dyScr);
    const bw = bandW.value;
    const bh = bandH.value;
    const peers = hzSnapPeers();
    if (!ev.shiftKey) {
      const snapped = magneticSnapTranslate(Math.round(el.x), Math.round(el.y), el.w, el.h, bw, bh, peers, el.id);
      el.x = snapped.x;
      el.y = snapped.y;
    }
    clampZoneElement(el, bandW.value, bandH.value);
    hzSnapGuides.value = ev.shiftKey
      ? { v: [], h: [] }
      : alignmentGuidesForRect(el.x, el.y, el.w, el.h, bw, bh, peers, el.id);
    return;
  }
  if (dragResize) {
    const el = elements.value.find((x) => x.id === dragResize!.sid);
    if (!el) return;
    const { h } = dragResize;
    const dx = ev.clientX - dragResize.startX;
    const dy = ev.clientY - dragResize.startY;
    let x = dragResize.ix;
    let y = dragResize.iy;
    let w = dragResize.iw;
    let hh = dragResize.ih;
    const floorW = el.type === "table" ? minOuterSizeForZoneTable(el).w : 16;
    const floorH = el.type === "table" ? minOuterSizeForZoneTable(el).h : 16;
    const ceilH = el.type === "table" ? intrinsicOuterHeightForZoneTable(el) : Number.POSITIVE_INFINITY;
    if (h.includes("e")) w = Math.max(floorW, dragResize.iw + dx);
    if (h.includes("s")) hh = Math.min(ceilH, Math.max(floorH, dragResize.ih + dy));
    if (h.includes("w")) {
      const nw = Math.max(floorW, dragResize.iw - dx);
      x = dragResize.ix + (dragResize.iw - nw);
      w = nw;
    }
    if (h.includes("n")) {
      const nh = Math.min(ceilH, Math.max(floorH, dragResize.ih - dy));
      y = dragResize.iy + (dragResize.ih - nh);
      hh = nh;
    }
    if (ev.shiftKey && (h === "se" || h === "nw" || h === "ne" || h === "sw")) {
      const s = Math.max(w, hh, floorW, floorH);
      const capped = el.type === "table" ? Math.min(s, ceilH) : s;
      w = capped;
      hh = capped;
    }
    el.x = x;
    el.y = y;
    el.w = w;
    el.h = hh;
    const bw = bandW.value;
    const bh = bandH.value;
    const peers = hzSnapPeers();
    if (!ev.shiftKey) {
      const snapped = magneticSnapResize(el.x, el.y, el.w, el.h, h, bw, bh, peers, el.id, floorW, floorH);
      el.x = snapped.x;
      el.y = snapped.y;
      el.w = snapped.w;
      el.h = snapped.h;
      if (el.type === "table") {
        const cap = intrinsicOuterHeightForZoneTable(el);
        if (el.h > cap) el.h = cap;
      }
    }
    clampZoneElement(el, bandW.value, bandH.value);
    hzSnapGuides.value = ev.shiftKey
      ? { v: [], h: [] }
      : alignmentGuidesForRect(el.x, el.y, el.w, el.h, bw, bh, peers, el.id);
  }
}

function endMove() {
  dragMove = null;
  dragResize = null;
  clearHzSnapGuides();
  window.removeEventListener("pointermove", onMove);
}

function startResize(ev: PointerEvent, el: LayoutZoneElement, h: Handle) {
  clearHzSnapGuides();
  selId.value = el.id;
  dragResize = {
    sid: el.id,
    h,
    startX: ev.clientX,
    startY: ev.clientY,
    ix: el.x,
    iy: el.y,
    iw: el.w,
    ih: el.h,
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", endMove, { once: true });
}

function removeSel() {
  if (!selId.value) return;
  const id = selId.value;
  const idx = elements.value.findIndex((x) => x.id === id);
  if (idx >= 0) elements.value.splice(idx, 1);
  selId.value = null;
}

function eventTargetIsTypingField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"]')) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function onDialogWindowKeydown(ev: KeyboardEvent) {
  if (!props.modelValue) return;
  if (ev.key !== "Delete" && ev.key !== "Backspace") return;
  if (eventTargetIsTypingField(ev.target)) return;
  if (!selId.value) return;
  ev.preventDefault();
  removeSel();
}

onMounted(() => window.addEventListener("keydown", onDialogWindowKeydown));
onUnmounted(() => window.removeEventListener("keydown", onDialogWindowKeydown));

function close() {
  emit("update:modelValue", false);
}

function hzBeginImagePick(el: LayoutZoneElement) {
  if (el.type !== "image") return;
  selId.value = el.id;
  pendingHzImgEl = el;
  void nextTick(() => hzImgFileRef.value?.click());
}

function hzPickFromPanel(el: LayoutZoneElement | null) {
  if (!el || el.type !== "image") return;
  hzBeginImagePick(el);
}

async function hzApplyImagePick(ev: Event) {
  const inp = ev.target as HTMLInputElement;
  const f = inp.files?.[0];
  inp.value = "";
  const tgt = pendingHzImgEl;
  pendingHzImgEl = null;
  await hzAssignImage(tgt, f ?? null);
}

async function hzDropImage(ev: DragEvent, el: LayoutZoneElement) {
  selId.value = el.id;
  await hzAssignImage(el, pickFirstImageFileFromDataTransfer(ev.dataTransfer));
}

async function hzAssignImage(el: LayoutZoneElement | null, f?: File | null) {
  if (!el || el.type !== "image") return;
  const file = f ?? null;
  if (!looksLikeImageFile(file)) return;
  try {
    el.imageSrc = await readImageFileAsDataUrl(file);
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
  }
}
</script>

<style scoped>
.hz-overlay {
  position: fixed;
  inset: 0;
  background: rgb(24 24 27 / 0.5);
  z-index: 10000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(12px, 3vh, 28px) 12px 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.hz-modal {
  background: #fff;
  border-radius: 12px;
  padding: 10px 12px 12px;
  max-width: min(640px, 96vw);
  width: 100%;
  min-width: 0;
  max-height: none;
  overflow-x: hidden;
  box-sizing: border-box;
  position: relative;
  flex: none;
  margin-bottom: 16px;
}
.hz-title {
  margin: 0 0 8px;
  font-size: 1rem;
}
.hz-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}
.hz-tools-label {
  color: #52525b;
}
.hz-tool {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px dashed #a1a1aa;
  background: #fafafa;
  cursor: grab;
  font-size: 12px;
  touch-action: manipulation;
  min-height: 36px;
}
.hz-stage-scroll {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  border-radius: 8px;
  box-sizing: border-box;
}
.hz-layer {
  position: relative;
  box-sizing: border-box;
}
.hz-snap-guide-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 40;
  overflow: visible;
}
.hz-snap-line {
  position: absolute;
  background: rgb(99 102 241 / 0.92);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.65);
}
.hz-snap-line--v {
  top: 0;
  bottom: 0;
  width: 1px;
  transform: translateX(-0.5px);
}
.hz-snap-line--h {
  left: 0;
  right: 0;
  height: 1px;
  transform: translateY(-0.5px);
}
.hz-node {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid transparent;
  background: transparent;
  display: flex;
  padding: 2px 4px;
  overflow: hidden;
  white-space: nowrap;
  touch-action: none;
}
.hz-node.selected {
  border-color: #6366f1;
  box-shadow: 0 0 0 1px #6366f1 inset;
  overflow: visible;
  z-index: 6;
}
/* 就地输入多行时不要被父级 nowrap/裁剪卡住 */
.hz-node.hz-node--inline-textbox {
  white-space: normal;
}
.hz-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.hz-ph {
  font-size: 10px;
  color: #94a3b8;
}
.hz-ph-upload {
  cursor: pointer;
  border-bottom: 1px dashed currentcolor;
}
.hz-ph-upload:hover {
  color: #475569;
}
.hz-img-layer {
  flex: 1;
  align-self: stretch;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  overflow: hidden;
}
.hz-sr-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.hz-soft-btn {
  padding: 7px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  cursor: pointer;
}
.hz-soft-btn:hover:not(:disabled) {
  background: #e0e7ff;
}
.hz-soft-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.hz-img-pick-btn {
  grid-column: 1 / -1;
}
.hz-sql-fill-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px dashed #e4e4e7;
}
.hz-sql-fill-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.hz-sql-fill-title {
  font-size: 12px;
  font-weight: 600;
  color: #3f3f46;
}
.hz-switch {
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 11px;
  border: 1px solid #d4d4d8;
  background: #e4e4e7;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}
.hz-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(24 24 27 / 0.15);
  transition: transform 0.15s ease;
}
.hz-switch--on {
  background: #a5b4fc;
  border-color: #818cf8;
}
.hz-switch--on::after {
  transform: translateX(18px);
}
.hz-switch:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.hz-img-hint {
  grid-column: 1 / -1;
  font-size: 11px;
  color: #71717a;
  line-height: 1.4;
}
/* 缩放手柄：与版式画布一致，圆点在控件外侧 */
.hz-handle {
  --hz-handle-hit: 44px;
  --hz-handle-out: 9px;
  position: absolute;
  width: var(--hz-handle-hit);
  height: var(--hz-handle-hit);
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  opacity: 1;
  cursor: nwse-resize;
  touch-action: none;
  z-index: 3;
  pointer-events: none;
}
.hz-handle:focus {
  outline: none;
}
.hz-handle:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
  border-radius: 4px;
}
.hz-handle::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  margin-top: -6px;
  box-sizing: border-box;
  border-radius: 50%;
  background: linear-gradient(145deg, #818cf8 0%, #6366f1 55%, #4f46e5 100%);
  border: 2px solid #fff;
  box-shadow:
    0 1px 3px rgb(15 23 42 / 0.25),
    0 0 0 1px rgb(99 102 241 / 0.35);
  pointer-events: auto;
  cursor: inherit;
}
.hz-handle:hover::after {
  background: linear-gradient(145deg, #6366f1 0%, #4f46e5 100%);
  box-shadow:
    0 2px 6px rgb(15 23 42 / 0.3),
    0 0 0 1px rgb(79 70 229 / 0.45);
}
.hz-handle-nw {
  top: calc(-1 * var(--hz-handle-out));
  left: calc(-1 * var(--hz-handle-out));
  margin-left: calc(-0.5 * var(--hz-handle-hit));
  margin-top: calc(-0.5 * var(--hz-handle-hit));
  cursor: nwse-resize;
}
.hz-handle-ne {
  top: calc(-1 * var(--hz-handle-out));
  right: calc(-1 * var(--hz-handle-out));
  margin-right: calc(-0.5 * var(--hz-handle-hit));
  margin-top: calc(-0.5 * var(--hz-handle-hit));
  cursor: nesw-resize;
}
.hz-handle-se {
  bottom: calc(-1 * var(--hz-handle-out));
  right: calc(-1 * var(--hz-handle-out));
  margin-right: calc(-0.5 * var(--hz-handle-hit));
  margin-bottom: calc(-0.5 * var(--hz-handle-hit));
  cursor: nwse-resize;
}
.hz-handle-sw {
  bottom: calc(-1 * var(--hz-handle-out));
  left: calc(-1 * var(--hz-handle-out));
  margin-left: calc(-0.5 * var(--hz-handle-hit));
  margin-bottom: calc(-0.5 * var(--hz-handle-hit));
  cursor: nesw-resize;
}
.hz-handle-n {
  top: calc(-1 * var(--hz-handle-out));
  left: 50%;
  margin-left: calc(-0.5 * var(--hz-handle-hit));
  margin-top: calc(-0.5 * var(--hz-handle-hit));
  cursor: ns-resize;
}
.hz-handle-s {
  bottom: calc(-1 * var(--hz-handle-out));
  left: 50%;
  margin-left: calc(-0.5 * var(--hz-handle-hit));
  margin-bottom: calc(-0.5 * var(--hz-handle-hit));
  cursor: ns-resize;
}
.hz-handle-e {
  right: calc(-1 * var(--hz-handle-out));
  top: 50%;
  margin-right: calc(-0.5 * var(--hz-handle-hit));
  margin-top: calc(-0.5 * var(--hz-handle-hit));
  cursor: ew-resize;
}
.hz-handle-w {
  left: calc(-1 * var(--hz-handle-out));
  top: 50%;
  margin-left: calc(-0.5 * var(--hz-handle-hit));
  margin-top: calc(-0.5 * var(--hz-handle-hit));
  cursor: ew-resize;
}
.hz-props {
  margin-top: 10px;
}
.hz-props-inner {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
  font-size: 12px;
}
.hz-span2 {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hz-wrap-row {
  gap: 6px;
}
.hz-wrap-title {
  font-size: 12px;
  color: #52525b;
}
.hz-seg {
  display: inline-flex;
  align-self: flex-start;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  overflow: hidden;
  background: #fafafa;
}
.hz-seg-btn {
  margin: 0;
  padding: 6px 14px;
  font-size: 12px;
  border: none;
  background: transparent;
  color: #52525b;
  cursor: pointer;
  line-height: 1.2;
}
.hz-seg-btn + .hz-seg-btn {
  box-shadow: inset 1px 0 0 #e4e4e7;
}
.hz-seg-btn:hover:not(.hz-seg-on) {
  background: rgb(244 244 245 / 0.85);
  color: #18181b;
}
.hz-seg-on {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
}
.hz-wrap-hint {
  margin: 0;
  font-size: 11px;
  color: #a1a1aa;
  line-height: 1.35;
}

.hz-inp {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
}
.hz-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
.btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fafafa;
  cursor: pointer;
  font-size: 13px;
}
.btn-danger-outline {
  border-color: rgb(239 68 68);
  color: rgb(185 28 28);
  background: #fff;
}
.hz-table-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  padding-bottom: 1px;
}
.hz-table {
  width: 100%;
  height: auto;
  max-height: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  background: rgb(255 255 255 / 0.96);
}
.hz-table tbody td {
  height: inherit;
  box-sizing: border-box;
}
.hz-table-cell {
  border-top: 1px solid rgb(212 212 216);
  border-left: 1px solid rgb(212 212 216);
  padding: 2px 4px;
  vertical-align: middle;
  text-align: center;
  overflow: hidden;
  cursor: cell;
  font-size: max(10px, 0.85em);
}
.hz-table-cell:last-child {
  border-right: 1px solid rgb(212 212 216);
}
.hz-table tbody tr:last-child .hz-table-cell {
  border-bottom: 1px solid rgb(212 212 216);
}
.hz-table-cell--hot {
  box-shadow: inset 0 0 0 2px #6366f1;
}
.hz-table-cell-txt {
  display: block;
  line-height: 1.3;
  word-break: break-word;
  white-space: pre-wrap;
  max-height: 100%;
  overflow: hidden;
}
.hz-table-cell-edit {
  display: block;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: none;
  resize: none;
  overflow-y: auto;
  max-height: 100%;
  font: inherit;
  font-size: inherit;
  line-height: 1.35;
  color: inherit;
  background: transparent;
  outline: none;
  field-sizing: fixed;
  min-height: 0;
}
.hz-table-cell-ddl {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 2px 4px;
  font: inherit;
  font-size: inherit;
  line-height: 1.35;
  text-align: inherit;
  min-height: 0;
}
.hz-opc-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
}
.hz-grow {
  flex: 1;
  min-width: 140px;
}
.hz-muted {
  margin: 0;
  font-size: 11px;
  color: #71717a;
}
.hz-table-metric {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.45;
  color: #3f3f46;
  background: rgb(244 244 245 / 0.95);
  border: 1px solid #e4e4e7;
  border-radius: 8px;
}
.hz-table-metric strong {
  color: #4338ca;
  font-weight: 700;
}
.hz-cell-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px dashed #e4e4e7;
}
.hz-table-dims {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-start;
}
.hz-table-col-widths {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hz-table-cell-fill-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid #e4e4e7;
}
.hz-table-col-widths-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: flex-end;
}
.hz-table-col-w-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #3f3f46;
  min-width: 4.5rem;
}
.hz-col-w-inp {
  max-width: 5rem;
}
.hz-dim-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.hz-dim-title {
  font-size: 12px;
  font-weight: 600;
  color: #3f3f46;
}
.hz-dim-stepper {
  display: inline-flex;
  align-items: stretch;
  border-radius: 10px;
  border: 1px solid #d4d4d8;
  overflow: hidden;
  background: #fafafa;
  box-shadow: 0 1px 2px rgb(24 24 27 / 0.06);
}
.hz-dim-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 0 14px;
  border: none;
  background: #fff;
  font-size: 22px;
  font-weight: 600;
  line-height: 1;
  color: #4338ca;
  cursor: pointer;
  touch-action: manipulation;
  flex-shrink: 0;
}
.hz-dim-btn:hover:not(:disabled) {
  background: #eef2ff;
  color: #3730a3;
}
.hz-dim-btn:active:not(:disabled) {
  background: #e0e7ff;
}
.hz-dim-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
  color: #a1a1aa;
}
.hz-dim-val {
  width: 3.25rem;
  box-sizing: border-box;
  text-align: center;
  border: none;
  border-left: 1px solid #e4e4e7;
  border-right: 1px solid #e4e4e7;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: #fff;
  color: #18181b;
  padding: 0 4px;
  min-height: 44px;
}
.hz-dim-val:focus {
  outline: none;
  background: #fafafa;
}
.hz-dim-val::-webkit-outer-spin-button,
.hz-dim-val::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.hz-dim-val {
  appearance: textfield;
  -moz-appearance: textfield;
}
</style>
