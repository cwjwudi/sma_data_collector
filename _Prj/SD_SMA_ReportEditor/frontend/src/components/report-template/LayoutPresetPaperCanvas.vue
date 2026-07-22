<template>
  <div class="lppc-viewport">
    <input
      ref="layoutPresetImgFileRef"
      type="file"
      accept="image/*,.svg"
      class="sr-only-input"
      aria-hidden="true"
      tabindex="-1"
      @change="applyLayoutPresetImageSelection"
    />
    <p class="lppc-tip">随中间画布区域滚动浏览整张纸 · Ctrl / ⌘ + 滚轮缩放 · 拖拽/缩放时靠近中线或其它控件边缘会轻微吸附；按住 Shift 可临时关闭吸附</p>
    <div class="lppc-flow" @wheel="onWheel">
      <div class="lppc-scale-frame" :style="canvasFrameStyle">
        <div class="lppc-scaler" :style="{ transform: `scale(${viewScale})`, transformOrigin: '0 0' }">
      <div ref="paperRef" class="lppc-paper" :style="paperBoxStyle" @pointerdown.capture="onPaperBlank">
        <div v-if="me.hb >= 1" class="lppc-band hdr" :style="hdrBandStyle">
          <div
            ref="hdrLayerRef"
            class="lppc-layer el-zone-root"
            :class="{ 'lppc-droptarget': dragOverZone === 'header' }"
            :style="hdrLayerBox"
            @pointerdown="onZoneBlank"
            @dragenter.prevent="dragOverZone = 'header'"
            @dragleave="onDragLeaveZone($event, 'header')"
            @dragover.prevent
            @drop.prevent="onDrop($event, 'header')"
          >
            <template v-for="el in preset.headerElements" :key="el.id">
              <div
                class="lppc-node touch"
                :class="{
                  selected: isSelected(el.id),
                  'lppc-node--inline-textbox': isPrimary(el.id) && (el.type === 'text' || el.type === 'box'),
                }"
                :style="nodeStyle(el)"
                @pointerdown.stop="beginMove($event, el, 'header')"
              >
                <template v-if="el.type === 'image'">
                  <div
                    class="lppc-img-layer"
                    title="可从资源管理器拖入图片到此"
                    @dragover.prevent
                    @drop.prevent.stop="onImageFileDrop($event, el)"
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
                      @replace-image="beginImagePick(el)"
                    >
                      <template #placeholder>
                        <span
                          role="button"
                          tabindex="0"
                          class="lppc-ph lppc-ph-upload"
                          title="点击从本机选择图片（或拖放到此）"
                          @pointerdown.stop
                          @click.prevent.stop="beginImagePick(el)"
                          @keyup.enter.prevent="beginImagePick(el)"
                          @keyup.space.prevent="beginImagePick(el)"
                        >
                          图片
                        </span>
                      </template>
                    </ZoneImageCompose>
                  </div>
                </template>
                <template v-else-if="el.type === 'table'">
                  <div class="lppc-table-shell">
                    <table class="lppc-table" :style="layoutZoneTableInnerStyle(el)">
                      <colgroup>
                        <col
                          v-for="(cw, ci) in layoutZoneTableColInnerWidthsPx(el)"
                          :key="'lzcol-' + el.id + '-' + ci"
                          :style="{ width: cw + 'px' }"
                        />
                      </colgroup>
                      <tbody>
                        <tr v-for="(tRow, ri) in layoutTableGrid(el)" :key="ri" :style="layoutZoneTableRowTrStyle(el, ri)">
                          <td
                            v-for="(cell, ci) in tRow"
                            :key="ci"
                            class="lppc-table-cell"
                            :class="{ 'lppc-table-cell--hot': isLayoutTableCellHot(el, ri, ci) }"
                            :style="layoutZoneTableCellStyle(el, ri, ci)"
                            @pointerdown.stop="pickLayoutTableCell(el, ri, ci)"
                          >
                            <template v-if="isVisualSqlFillOutputPickerRow(el, ri)">
                              <select
                                class="lppc-table-cell-ddl tbl-sql-ddl"
                                :value="layoutPresetVisualOutputValue(el, ci)"
                                @pointerdown.stop="pickLayoutTableCell(el, ri, ci)"
                                @change="onLayoutPresetVisualOutputChange(el, ci, $event)"
                              >
                                <option value="">— 空白列 —</option>
                                <option value="__sequence__">＃ 序号列</option>
                                <option
                                  v-for="opt in layoutPresetVisualSqlCatalog[el.id]"
                                  :key="'lzfld-' + el.id + '-' + ci + '-' + opt.name"
                                  :value="opt.name"
                                >
                                  {{ opt.name }}
                                </option>
                              </select>
                            </template>
                            <template v-else-if="isVerticalSqlFillSlotPickerCell(el, ri, ci)">
                              <select
                                class="lppc-table-cell-ddl tbl-sql-ddl"
                                :value="layoutPresetVerticalSlotValue(el, ri)"
                                @pointerdown.stop="pickLayoutTableCell(el, ri, ci)"
                                @change="onLayoutPresetVerticalSlotChange(el, ri, $event)"
                              >
                                <option value="__field__">— 请选择字段 —</option>
                                <option value="">— 空白分隔 —</option>
                                <option
                                  v-for="opt in layoutPresetVisualSqlCatalog[el.id]"
                                  :key="'lzvfld-' + el.id + '-' + ri + '-' + opt.name"
                                  :value="opt.name"
                                >
                                  {{ opt.name }}
                                </option>
                              </select>
                            </template>
                            <template v-else-if="el.tableSqlFill?.enabled">
                              <span class="lppc-table-cell-txt">{{ formatLayoutSqlFillTableCell(el, ri, ci) }}</span>
                            </template>
                            <template v-else>
                              <textarea
                                v-if="isLayoutTableCellHot(el, ri, ci)"
                                :key="'lppct-' + el.id + '-' + ri + '-' + ci"
                                v-model="cell.text"
                                class="lppc-table-cell-edit"
                                rows="1"
                                spellcheck="false"
                                autofocus
                                @pointerdown.stop="pickLayoutTableCell(el, ri, ci)"
                                @keydown.stop
                              />
                              <span
                                v-else
                                class="lppc-table-cell-txt"
                                :title="layoutTableCellTitle(el, ri, ci, cell)"
                              >{{ formatLayoutTableCellPreview(el, ri, ci, cell) }}</span>
                            </template>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <TableColumnResizeGutters
                      v-if="isPrimary(el.id)"
                      :column-widths-px="layoutZoneTableColInnerWidthsPx(el)"
                      :layout-scale="viewScale"
                      @resize-delta="(bi, dx) => onZoneTableColumnResize(el, 'header', bi, dx)"
                    />
                  </div>
                </template>
                <template v-else>
                  <LayoutZoneInlineContent
                    :el="el"
                    text-class="lppc-zone-text"
                    :canvas-inline-edit="isPrimary(el.id) && (el.type === 'text' || el.type === 'box')"
                  />
                </template>
                <template v-if="isPrimary(el.id)">
                  <button
                    v-for="pos in handlesFor(el)"
                    :key="pos"
                    type="button"
                    class="hz"
                    :class="'hz-' + pos"
                    tabindex="-1"
                    aria-label="缩放手柄"
                    @pointerdown.stop="beginResize($event, el, 'header', pos)"
                  />
                </template>
              </div>
            </template>
            <div
              v-if="layoutSnapOverlay.zone === 'header' && (layoutSnapOverlay.v.length || layoutSnapOverlay.h.length)"
              class="lppc-snap-guide-layer"
              aria-hidden="true"
            >
              <div
                v-for="(vx, gi) in layoutSnapOverlay.v"
                :key="'hsnap-v-' + gi + '-' + vx"
                class="lppc-snap-line lppc-snap-line--v"
                :style="{ left: vx + 'px' }"
              />
              <div
                v-for="(hy, gi) in layoutSnapOverlay.h"
                :key="'hsnap-h-' + gi + '-' + hy"
                class="lppc-snap-line lppc-snap-line--h"
                :style="{ top: hy + 'px' }"
              />
            </div>
          </div>
        </div>

        <div
          ref="bodyLayerRef"
          class="lppc-band body el-zone-root"
          :class="{ 'lppc-droptarget': dragOverZone === 'body' }"
          :style="bodyBandStyle"
          @pointerdown="onZoneBlank"
          @dragenter.prevent="dragOverZone = 'body'"
          @dragleave="onDragLeaveZone($event, 'body')"
          @dragover.prevent
          @drop.prevent="onDrop($event, 'body')"
        >
          <template v-for="el in preset.bodyElements" :key="el.id">
            <div
              class="lppc-node touch"
              :class="{
                selected: isSelected(el.id),
                'lppc-node--inline-textbox': isPrimary(el.id) && (el.type === 'text' || el.type === 'box'),
              }"
              :style="nodeStyle(el)"
              @pointerdown.stop="beginMove($event, el, 'body')"
            >
              <template v-if="el.type === 'image'">
                <div
                  class="lppc-img-layer"
                  title="可从资源管理器拖入图片到此"
                  @dragover.prevent
                  @drop.prevent.stop="onImageFileDrop($event, el)"
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
                    @replace-image="beginImagePick(el)"
                  >
                    <template #placeholder>
                      <span
                        role="button"
                        tabindex="0"
                        class="lppc-ph lppc-ph-upload"
                        title="点击从本机选择图片（或拖放到此）"
                        @pointerdown.stop
                        @click.prevent.stop="beginImagePick(el)"
                        @keyup.enter.prevent="beginImagePick(el)"
                        @keyup.space.prevent="beginImagePick(el)"
                      >
                        图片
                      </span>
                    </template>
                  </ZoneImageCompose>
                </div>
              </template>
              <template v-else-if="el.type === 'table'">
                  <div class="lppc-table-shell">
                    <table class="lppc-table" :style="layoutZoneTableInnerStyle(el)">
                      <colgroup>
                        <col
                          v-for="(cw, ci) in layoutZoneTableColInnerWidthsPx(el)"
                          :key="'lzcol-' + el.id + '-' + ci"
                          :style="{ width: cw + 'px' }"
                        />
                      </colgroup>
                      <tbody>
                        <tr v-for="(tRow, ri) in layoutTableGrid(el)" :key="ri" :style="layoutZoneTableRowTrStyle(el, ri)">
                          <td
                            v-for="(cell, ci) in tRow"
                            :key="ci"
                            class="lppc-table-cell"
                            :class="{ 'lppc-table-cell--hot': isLayoutTableCellHot(el, ri, ci) }"
                            :style="layoutZoneTableCellStyle(el, ri, ci)"
                            @pointerdown.stop="pickLayoutTableCell(el, ri, ci)"
                          >
                            <template v-if="isVisualSqlFillOutputPickerRow(el, ri)">
                              <select
                                class="lppc-table-cell-ddl tbl-sql-ddl"
                                :value="layoutPresetVisualOutputValue(el, ci)"
                                @pointerdown.stop="pickLayoutTableCell(el, ri, ci)"
                                @change="onLayoutPresetVisualOutputChange(el, ci, $event)"
                              >
                                <option value="">— 空白列 —</option>
                                <option value="__sequence__">＃ 序号列</option>
                                <option
                                  v-for="opt in layoutPresetVisualSqlCatalog[el.id]"
                                  :key="'lzfld-' + el.id + '-' + ci + '-' + opt.name"
                                  :value="opt.name"
                                >
                                  {{ opt.name }}
                                </option>
                              </select>
                            </template>
                            <template v-else-if="isVerticalSqlFillSlotPickerCell(el, ri, ci)">
                              <select
                                class="lppc-table-cell-ddl tbl-sql-ddl"
                                :value="layoutPresetVerticalSlotValue(el, ri)"
                                @pointerdown.stop="pickLayoutTableCell(el, ri, ci)"
                                @change="onLayoutPresetVerticalSlotChange(el, ri, $event)"
                              >
                                <option value="__field__">— 请选择字段 —</option>
                                <option value="">— 空白分隔 —</option>
                                <option
                                  v-for="opt in layoutPresetVisualSqlCatalog[el.id]"
                                  :key="'lzvfld-' + el.id + '-' + ri + '-' + opt.name"
                                  :value="opt.name"
                                >
                                  {{ opt.name }}
                                </option>
                              </select>
                            </template>
                            <template v-else-if="el.tableSqlFill?.enabled">
                              <span class="lppc-table-cell-txt">{{ formatLayoutSqlFillTableCell(el, ri, ci) }}</span>
                            </template>
                            <template v-else>
                              <textarea
                                v-if="isLayoutTableCellHot(el, ri, ci)"
                                :key="'lppct-' + el.id + '-' + ri + '-' + ci"
                                v-model="cell.text"
                                class="lppc-table-cell-edit"
                                rows="1"
                                spellcheck="false"
                                autofocus
                                @pointerdown.stop="pickLayoutTableCell(el, ri, ci)"
                                @keydown.stop
                              />
                              <span
                                v-else
                                class="lppc-table-cell-txt"
                                :title="layoutTableCellTitle(el, ri, ci, cell)"
                              >{{ formatLayoutTableCellPreview(el, ri, ci, cell) }}</span>
                            </template>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <TableColumnResizeGutters
                      v-if="isPrimary(el.id)"
                      :column-widths-px="layoutZoneTableColInnerWidthsPx(el)"
                      :layout-scale="viewScale"
                      @resize-delta="(bi, dx) => onZoneTableColumnResize(el, 'body', bi, dx)"
                    />
                  </div>
                </template>
              <template v-else>
                <LayoutZoneInlineContent
                  :el="el"
                  text-class="lppc-zone-text"
                  :canvas-inline-edit="isPrimary(el.id) && (el.type === 'text' || el.type === 'box')"
                />
              </template>
              <template v-if="isPrimary(el.id)">
                <button
                  v-for="pos in handlesFor(el)"
                  :key="pos"
                  type="button"
                  class="hz"
                  :class="'hz-' + pos"
                  tabindex="-1"
                  aria-label="缩放手柄"
                  @pointerdown.stop="beginResize($event, el, 'body', pos)"
                />
              </template>
            </div>
          </template>
          <div
            v-if="layoutSnapOverlay.zone === 'body' && (layoutSnapOverlay.v.length || layoutSnapOverlay.h.length)"
            class="lppc-snap-guide-layer"
            aria-hidden="true"
          >
            <div
              v-for="(vx, gi) in layoutSnapOverlay.v"
              :key="'bsnap-v-' + gi + '-' + vx"
              class="lppc-snap-line lppc-snap-line--v"
              :style="{ left: vx + 'px' }"
            />
            <div
              v-for="(hy, gi) in layoutSnapOverlay.h"
              :key="'bsnap-h-' + gi + '-' + hy"
              class="lppc-snap-line lppc-snap-line--h"
              :style="{ top: hy + 'px' }"
            />
          </div>
        </div>

        <div v-if="me.fb >= 1" class="lppc-band ftr" :style="ftrBandStyle">
          <div
            ref="ftrLayerRef"
            class="lppc-layer el-zone-root"
            :class="{ 'lppc-droptarget': dragOverZone === 'footer' }"
            :style="ftrLayerBox"
            @pointerdown="onZoneBlank"
            @dragenter.prevent="dragOverZone = 'footer'"
            @dragleave="onDragLeaveZone($event, 'footer')"
            @dragover.prevent
            @drop.prevent="onDrop($event, 'footer')"
          >
            <template v-for="el in preset.footerElements" :key="el.id">
              <div
                class="lppc-node touch"
                :class="{
                  selected: isSelected(el.id),
                  'lppc-node--inline-textbox': isPrimary(el.id) && (el.type === 'text' || el.type === 'box'),
                }"
                :style="nodeStyle(el)"
                @pointerdown.stop="beginMove($event, el, 'footer')"
              >
                <template v-if="el.type === 'image'">
                  <div
                    class="lppc-img-layer"
                    title="可从资源管理器拖入图片到此"
                    @dragover.prevent
                    @drop.prevent.stop="onImageFileDrop($event, el)"
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
                      @replace-image="beginImagePick(el)"
                    >
                      <template #placeholder>
                        <span
                          role="button"
                          tabindex="0"
                          class="lppc-ph lppc-ph-upload"
                          title="点击从本机选择图片（或拖放到此）"
                          @pointerdown.stop
                          @click.prevent.stop="beginImagePick(el)"
                          @keyup.enter.prevent="beginImagePick(el)"
                          @keyup.space.prevent="beginImagePick(el)"
                        >
                          图片
                        </span>
                      </template>
                    </ZoneImageCompose>
                  </div>
                </template>
                <template v-else-if="el.type === 'table'">
                  <div class="lppc-table-shell">
                    <table class="lppc-table" :style="layoutZoneTableInnerStyle(el)">
                      <colgroup>
                        <col
                          v-for="(cw, ci) in layoutZoneTableColInnerWidthsPx(el)"
                          :key="'lzcol-' + el.id + '-' + ci"
                          :style="{ width: cw + 'px' }"
                        />
                      </colgroup>
                      <tbody>
                        <tr v-for="(tRow, ri) in layoutTableGrid(el)" :key="ri" :style="layoutZoneTableRowTrStyle(el, ri)">
                          <td
                            v-for="(cell, ci) in tRow"
                            :key="ci"
                            class="lppc-table-cell"
                            :class="{ 'lppc-table-cell--hot': isLayoutTableCellHot(el, ri, ci) }"
                            :style="layoutZoneTableCellStyle(el, ri, ci)"
                            @pointerdown.stop="pickLayoutTableCell(el, ri, ci)"
                          >
                            <template v-if="isVisualSqlFillOutputPickerRow(el, ri)">
                              <select
                                class="lppc-table-cell-ddl tbl-sql-ddl"
                                :value="layoutPresetVisualOutputValue(el, ci)"
                                @pointerdown.stop="pickLayoutTableCell(el, ri, ci)"
                                @change="onLayoutPresetVisualOutputChange(el, ci, $event)"
                              >
                                <option value="">— 空白列 —</option>
                                <option value="__sequence__">＃ 序号列</option>
                                <option
                                  v-for="opt in layoutPresetVisualSqlCatalog[el.id]"
                                  :key="'lzfld-' + el.id + '-' + ci + '-' + opt.name"
                                  :value="opt.name"
                                >
                                  {{ opt.name }}
                                </option>
                              </select>
                            </template>
                            <template v-else-if="isVerticalSqlFillSlotPickerCell(el, ri, ci)">
                              <select
                                class="lppc-table-cell-ddl tbl-sql-ddl"
                                :value="layoutPresetVerticalSlotValue(el, ri)"
                                @pointerdown.stop="pickLayoutTableCell(el, ri, ci)"
                                @change="onLayoutPresetVerticalSlotChange(el, ri, $event)"
                              >
                                <option value="__field__">— 请选择字段 —</option>
                                <option value="">— 空白分隔 —</option>
                                <option
                                  v-for="opt in layoutPresetVisualSqlCatalog[el.id]"
                                  :key="'lzvfld-' + el.id + '-' + ri + '-' + opt.name"
                                  :value="opt.name"
                                >
                                  {{ opt.name }}
                                </option>
                              </select>
                            </template>
                            <template v-else-if="el.tableSqlFill?.enabled">
                              <span class="lppc-table-cell-txt">{{ formatLayoutSqlFillTableCell(el, ri, ci) }}</span>
                            </template>
                            <template v-else>
                              <textarea
                                v-if="isLayoutTableCellHot(el, ri, ci)"
                                :key="'lppct-' + el.id + '-' + ri + '-' + ci"
                                v-model="cell.text"
                                class="lppc-table-cell-edit"
                                rows="1"
                                spellcheck="false"
                                autofocus
                                @pointerdown.stop="pickLayoutTableCell(el, ri, ci)"
                                @keydown.stop
                              />
                              <span
                                v-else
                                class="lppc-table-cell-txt"
                                :title="layoutTableCellTitle(el, ri, ci, cell)"
                              >{{ formatLayoutTableCellPreview(el, ri, ci, cell) }}</span>
                            </template>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <TableColumnResizeGutters
                      v-if="isPrimary(el.id)"
                      :column-widths-px="layoutZoneTableColInnerWidthsPx(el)"
                      :layout-scale="viewScale"
                      @resize-delta="(bi, dx) => onZoneTableColumnResize(el, 'footer', bi, dx)"
                    />
                  </div>
                </template>
                <template v-else>
                  <LayoutZoneInlineContent
                    :el="el"
                    text-class="lppc-zone-text"
                    :canvas-inline-edit="isPrimary(el.id) && (el.type === 'text' || el.type === 'box')"
                  />
                </template>
                <template v-if="isPrimary(el.id)">
                  <button
                    v-for="pos in handlesFor(el)"
                    :key="pos"
                    type="button"
                    class="hz"
                    :class="'hz-' + pos"
                    tabindex="-1"
                    aria-label="缩放手柄"
                    @pointerdown.stop="beginResize($event, el, 'footer', pos)"
                  />
                </template>
              </div>
            </template>
            <div
              v-if="layoutSnapOverlay.zone === 'footer' && (layoutSnapOverlay.v.length || layoutSnapOverlay.h.length)"
              class="lppc-snap-guide-layer"
              aria-hidden="true"
            >
              <div
                v-for="(vx, gi) in layoutSnapOverlay.v"
                :key="'fsnap-v-' + gi + '-' + vx"
                class="lppc-snap-line lppc-snap-line--v"
                :style="{ left: vx + 'px' }"
              />
              <div
                v-for="(hy, gi) in layoutSnapOverlay.h"
                :key="'fsnap-h-' + gi + '-' + hy"
                class="lppc-snap-line lppc-snap-line--h"
                :style="{ top: hy + 'px' }"
              />
            </div>
          </div>
        </div>
        <div v-if="marqueeRect" class="lppc-marquee" :style="marqueeStyle" aria-hidden="true" />
      </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { looksLikeImageFile, pickFirstImageFileFromDataTransfer, readImageFileAsDataUrl } from "@/lib/report-template/read-image-file";
import LayoutZoneInlineContent from "@/components/report-template/LayoutZoneInlineContent.vue";
import TableColumnResizeGutters from "@/components/report-template/TableColumnResizeGutters.vue";
import ZoneImageCompose from "@/components/report-template/ZoneImageCompose.vue";
import { computePaperLayout, type PaperLayoutMetrics } from "@/lib/report-template/layout-geometry";
import {
  clampZoneElement,
  clampZoneTableOuterSize,
  computeZoneTableContentRowHeightsPx,
  ensureZoneTableGrid,
  minOuterSizeForZoneTable,
  zoneTableColumnInnerWidthsPx,
  axisToCssTextAlign,
  axisToCssVerticalAlign,
  flexJustifyAlignForAxes,
  getZoneTextWrapStyle,
  makeLayoutZoneElement,
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
import { layoutPresetTableCellPickKey, reportBindingPreviewKey } from "@/lib/report-template/template-editor-context";
import { presetToSnapshot, type LayoutPreset } from "@/lib/report-template/layout-model";
import {
  resolveStaticTableCellDisplayText,
  resolveStaticTableCellLayoutText,
  shortBindingKindLabel,
  staticTableCellBindingTitle,
} from "@/lib/report-template/binding-preview-utils";
import {
  alignmentGuidesForRect,
  magneticSnapResize,
  magneticSnapTranslate,
  type SnapPeer,
} from "@/lib/report-template/layout-snap-guides";
import {
  applyTableColumnResizeDeltaPx,
  clampTableRowHeightPx,
  REPORT_ZONE_TABLE_NODE_PADDING_PX,
  uniformTableCellBoxPx,
} from "@/lib/report-template/table-cell-metrics";
import type { VisualSqlTableColumnMeta } from "@/lib/report-template/table-sql-visual-catalog";
import { loadVisualSqlTableColumnsCached } from "@/lib/report-template/table-sql-visual-catalog";
import { applyVisualSqlOutputColumnPick, applyVerticalSqlSlotField, syncTableRowsForVerticalSqlSlots } from "@/lib/report-template/table-sql-visual-compile";
import {
  ensureVisualSource,
  isVisualSqlFillOutputPickerRow,
  isVerticalSqlFillSlotPickerCell,
  visualSqlColumnPickValue,
  visualSqlStructureTableName,
  verticalSqlSlotPickValue,
  TABLE_SQL_VERTICAL_FIELD_PENDING,
} from "@/lib/report-template/table-sql-fill";
import { formatSqlFillTableCellPreview } from "@/lib/report-template/table-sql-fill-preview";
import {
  applyMarqueeSelection,
  marqueeHitTest,
  normalizeRect,
  primaryId,
  rangeSelectInList,
  selectOnly,
  toggleInSelection,
} from "@/lib/report-template/selection-set";
import {
  applyGroupResize,
  clampPositionOnly,
  type GroupResizeOrigin,
} from "@/lib/report-template/selection-group-resize";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];
const TABLE_HANDLES = ["e", "w"] as const;

function handlesFor(el: LayoutZoneElement): readonly Handle[] {
  if (el.type === "table") return TABLE_HANDLES;
  return HANDLES;
}
type Zone = "header" | "footer" | "body";

const props = defineProps<{
  preset: LayoutPreset;
}>();

const selectedIds = defineModel<string[]>("selectedIds", { default: () => [] });
const selId = computed({
  get: () => primaryId(selectedIds.value),
  set: (v: string | null) => {
    selectedIds.value = v ? selectOnly(v) : [];
  },
});

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id);
}

function isPrimary(id: string): boolean {
  return primaryId(selectedIds.value) === id;
}

/** 拖拽/缩放时当前激活对齐线的区域与坐标（相对该眉/正文/脚带） */
const layoutSnapOverlay = ref<{ zone: Zone | null; v: number[]; h: number[] }>({
  zone: null,
  v: [],
  h: [],
});

function clearLayoutSnapOverlay() {
  layoutSnapOverlay.value = { zone: null, v: [], h: [] };
}

function peersForSnapZone(z: Zone): SnapPeer[] {
  return elementsForZone(z).map((e) => ({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h }));
}

const layoutTablePick = inject(layoutPresetTableCellPickKey, undefined);
const bindingPreview = inject(reportBindingPreviewKey, null);

watch(selId, (id) => {
  if (!layoutTablePick) return;
  const p = layoutTablePick.value;
  if (!p || !id) return;
  if (p.elId !== id) layoutTablePick.value = null;
});

function layoutTableGrid(el: LayoutZoneElement): LayoutZoneTableCell[][] {
  if (el.type !== "table") return [];
  return ensureZoneTableGrid(el);
}

function layoutZoneTableColInnerWidthsPx(el: LayoutZoneElement): number[] {
  if (el.type !== "table") return [];
  return zoneTableColumnInnerWidthsPx(el);
}

function zoneCellPreviewKey(elId: string, ri: number, ci: number): string {
  return `zone-cell:${elId}:${ri}:${ci}`;
}

function layoutZoneStaticCellLayoutText(el: LayoutZoneElement, ri: number, ci: number): string {
  const cell = layoutTableGrid(el)[ri]?.[ci] ?? null;
  const hit = bindingPreview?.values.value[zoneCellPreviewKey(el.id, ri, ci)];
  return resolveStaticTableCellLayoutText({
    cell,
    previewCell: hit,
    loading: !!(bindingPreview?.loading.value && !hit),
  });
}

function layoutZoneStaticCellTextAt(el: LayoutZoneElement): (ri: number, ci: number) => string {
  return (ri, ci) => layoutZoneStaticCellLayoutText(el, ri, ci);
}

function layoutZoneTableRowTrStyle(el: LayoutZoneElement, ri = 0): Record<string, string> | undefined {
  if (el.type !== "table") return undefined;
  void bindingPreview?.values.value;
  const heights =
    el.tableSqlFill?.enabled
      ? Array.from({ length: Math.max(1, el.tableRows ?? 1) }, () => clampTableRowHeightPx(el.tableRowHeightPx))
      : computeZoneTableContentRowHeightsPx(el, layoutZoneStaticCellTextAt(el));
  const h = heights[ri] ?? clampTableRowHeightPx(el.tableRowHeightPx);
  return { height: `${h}px`, minHeight: `${h}px` };
}

function formatLayoutSqlFillTableCell(el: LayoutZoneElement, ri: number, ci: number): string {
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

function formatLayoutTableCellPreview(el: LayoutZoneElement, ri: number, ci: number, cell: LayoutZoneTableCell): string {
  const hit = bindingPreview?.values.value[zoneCellPreviewKey(el.id, ri, ci)];
  const loading = !!(bindingPreview?.loading.value && !hit);
  if (cell.bindingKind === "opcua" || cell.bindingKind === "sql" || cell.bindingKind === "mongo") {
    return resolveStaticTableCellDisplayText({
      cell,
      previewCell: hit,
      loading,
      unboundLabel: shortBindingKindLabel(cell.bindingKind),
    });
  }
  const t = cell.text.trim();
  return t.length > 0 ? t : "\u00a0";
}

function layoutTableCellTitle(el: LayoutZoneElement, ri: number, ci: number, cell: LayoutZoneTableCell): string {
  if (el.tableSqlFill?.enabled) return "";
  const hit = bindingPreview?.values.value[zoneCellPreviewKey(el.id, ri, ci)];
  if (hit != null) return "";
  return staticTableCellBindingTitle(cell);
}

function pickLayoutTableCell(el: LayoutZoneElement, ri: number, ci: number) {
  selId.value = el.id;
  if (layoutTablePick) layoutTablePick.value = { elId: el.id, row: ri, col: ci };
}

function isLayoutTableCellHot(el: LayoutZoneElement, ri: number, ci: number): boolean {
  const p = layoutTablePick?.value;
  return !!(p && p.elId === el.id && p.row === ri && p.col === ci);
}

const layoutPresetVisualSqlCatalog = ref<Record<string, VisualSqlTableColumnMeta[]>>({});

function layoutPresetAllTableElements(): LayoutZoneElement[] {
  return [...props.preset.headerElements, ...props.preset.bodyElements, ...props.preset.footerElements].filter(
    (e) => e.type === "table",
  );
}

async function refreshLayoutPresetVisualSqlCatalog(): Promise<void> {
  const next: Record<string, VisualSqlTableColumnMeta[]> = {};
  for (const el of layoutPresetAllTableElements()) {
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
  layoutPresetVisualSqlCatalog.value = next;
}

/** P3-B：deep watch 防抖，避免拖拽每步全量重建可视化列目录 */
const LAYOUT_VISUAL_SQL_CATALOG_DEBOUNCE_MS = 200;
let layoutVisualSqlCatalogTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRefreshLayoutPresetVisualSqlCatalog(immediate = false) {
  if (layoutVisualSqlCatalogTimer) {
    clearTimeout(layoutVisualSqlCatalogTimer);
    layoutVisualSqlCatalogTimer = null;
  }
  if (immediate) {
    void refreshLayoutPresetVisualSqlCatalog();
    return;
  }
  layoutVisualSqlCatalogTimer = setTimeout(() => {
    layoutVisualSqlCatalogTimer = null;
    void refreshLayoutPresetVisualSqlCatalog();
  }, LAYOUT_VISUAL_SQL_CATALOG_DEBOUNCE_MS);
}

watch(
  () => props.preset,
  (_v, _o, onCleanup) => {
    scheduleRefreshLayoutPresetVisualSqlCatalog(false);
    onCleanup(() => {
      if (layoutVisualSqlCatalogTimer) {
        clearTimeout(layoutVisualSqlCatalogTimer);
        layoutVisualSqlCatalogTimer = null;
      }
    });
  },
  { deep: true },
);

scheduleRefreshLayoutPresetVisualSqlCatalog(true);

function layoutPresetVisualOutputValue(el: LayoutZoneElement, ci: number): string {
  const fill = el.tableSqlFill;
  if (!fill) return "";
  return visualSqlColumnPickValue(fill, ci);
}

function onLayoutPresetVisualOutputChange(el: LayoutZoneElement, ci: number, ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  const fill = el.tableSqlFill;
  if (!fill || fill.fillMode !== "visual" || el.type !== "table") return;
  const cols = el.tableCols ?? 4;
  const cell = layoutTableGrid(el)[0]?.[ci];
  applyVisualSqlOutputColumnPick(fill, cols, ci, v, cell);
}

function layoutPresetVerticalSlotValue(el: LayoutZoneElement, ri: number): string {
  const fill = el.tableSqlFill;
  if (!fill) return TABLE_SQL_VERTICAL_FIELD_PENDING;
  return verticalSqlSlotPickValue(fill, ri - 1);
}

function onLayoutPresetVerticalSlotChange(el: LayoutZoneElement, ri: number, ev: Event) {
  const v = (ev.target as HTMLSelectElement).value;
  const fill = el.tableSqlFill;
  if (!fill || fill.fillMode !== "visual" || el.type !== "table") return;
  applyVerticalSqlSlotField(fill, ri - 1, v);
  syncTableRowsForVerticalSqlSlots(el, () => ensureZoneTableGrid(el));
  clampZoneTableOuterSize(el);
}

const hdrLayerRef = ref<HTMLElement | null>(null);
const bodyLayerRef = ref<HTMLElement | null>(null);
const ftrLayerRef = ref<HTMLElement | null>(null);
const paperRef = ref<HTMLElement | null>(null);
const layoutPresetImgFileRef = ref<HTMLInputElement | null>(null);
let pendingLayoutPresetImageEl: LayoutZoneElement | null = null;
const viewScale = ref(1);
const dragOverZone = ref<Zone | null>(null);

const me = computed(() =>
  computePaperLayout(props.preset.paperKind, props.preset.orientation, presetToSnapshot(props.preset)),
);

function clampLayoutZoneTableOuter(el: LayoutZoneElement): void {
  if (el.type !== "table" || el.tableSqlFill?.enabled) return;
  const bandH = Math.max(me.value.hb, me.value.fb, me.value.contentH, 40);
  clampZoneTableOuterSize(
    el,
    me.value.contentW,
    Math.max(20, bandH - Math.max(0, el.y)),
    layoutZoneStaticCellTextAt(el),
  );
}

watch(
  () => bindingPreview?.values.value,
  () => {
    for (const el of layoutPresetAllTableElements()) {
      if (!el.tableSqlFill?.enabled) clampLayoutZoneTableOuter(el);
    }
  },
  { deep: true },
);

const paperBoxStyle = computed(() => ({
  width: `${me.value.pageW}px`,
  height: `${me.value.pageH}px`,
  background: "#fff",
  border: "1px solid #d4d4d8",
  boxShadow: "0 12px 28px rgb(24 24 27 / 0.1)",
  position: "relative" as const,
}));

/** scale 不改变布局占位：外框等于缩放后的尺寸，才能把整张纸占位进外层页面滚动高度 */
const canvasFrameStyle = computed(() => {
  const s = viewScale.value || 1;
  const pad = 56;
  const pw = me.value.pageW + pad;
  const ph = me.value.pageH + pad;
  return {
    width: `${Math.ceil(pw * s)}px`,
    height: `${Math.ceil(ph * s)}px`,
    maxWidth: "100%",
    margin: "0 auto",
    position: "relative" as const,
    boxSizing: "border-box" as const,
  };
});

function bandBox(m: PaperLayoutMetrics, which: "hdr" | "body" | "ftr"): Record<string, string> {
  if (which === "hdr") {
    return {
      position: "absolute",
      left: `${m.ml}px`,
      top: `${m.mt}px`,
      width: `${m.pageW - m.ml - m.mr}px`,
      height: `${m.hb}px`,
    };
  }
  if (which === "body") {
    return {
      position: "absolute",
      left: `${m.contentLeft}px`,
      top: `${m.contentTop}px`,
      width: `${m.contentW}px`,
      height: `${m.contentH}px`,
    };
  }
  return {
    position: "absolute",
    left: `${m.ml}px`,
    bottom: `${m.mb}px`,
    width: `${m.pageW - m.ml - m.mr}px`,
    height: `${m.fb}px`,
  };
}

const hdrBandStyle = computed(() => bandBox(me.value, "hdr"));
const bodyBandStyle = computed(() => bandBox(me.value, "body"));
const ftrBandStyle = computed(() => bandBox(me.value, "ftr"));

const hdrLayerBox = computed(() => ({
  position: "relative" as const,
  width: "100%",
  height: "100%",
  boxSizing: "border-box" as const,
}));

const ftrLayerBox = computed(() => ({
  position: "relative" as const,
  width: "100%",
  height: "100%",
  boxSizing: "border-box" as const,
}));

function bandDims(z: Zone): { w: number; h: number } {
  const m = me.value;
  const bw = Math.max(40, m.pageW - m.ml - m.mr);
  if (z === "header") return { w: bw, h: Math.max(8, m.hb) };
  if (z === "footer") return { w: bw, h: Math.max(8, m.fb) };
  return { w: m.contentW, h: m.contentH };
}

function elementsForZone(z: Zone): LayoutZoneElement[] {
  if (z === "header") return props.preset.headerElements;
  if (z === "footer") return props.preset.footerElements;
  return props.preset.bodyElements;
}

function eventTargetIsTypingField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"]')) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function zoneForElementId(id: string): Zone | null {
  if (props.preset.headerElements.some((x) => x.id === id)) return "header";
  if (props.preset.footerElements.some((x) => x.id === id)) return "footer";
  if (props.preset.bodyElements.some((x) => x.id === id)) return "body";
  return null;
}

function elementPaperRect(el: LayoutZoneElement, z: Zone): { id: string; x: number; y: number; w: number; h: number } {
  const m = me.value;
  if (z === "header") {
    return { id: el.id, x: m.ml + el.x, y: m.mt + el.y, w: el.w, h: el.h };
  }
  if (z === "body") {
    return { id: el.id, x: m.contentLeft + el.x, y: m.contentTop + el.y, w: el.w, h: el.h };
  }
  const bandTop = m.pageH - m.mb - m.fb;
  return { id: el.id, x: m.ml + el.x, y: bandTop + el.y, w: el.w, h: el.h };
}

function allElementsPaperRects(): Array<{ id: string; x: number; y: number; w: number; h: number }> {
  const out: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];
  for (const el of props.preset.headerElements) out.push(elementPaperRect(el, "header"));
  for (const el of props.preset.bodyElements) out.push(elementPaperRect(el, "body"));
  for (const el of props.preset.footerElements) out.push(elementPaperRect(el, "footer"));
  return out;
}

function clientToPaperCoords(clientX: number, clientY: number): { x: number; y: number } | null {
  const paper = paperRef.value;
  if (!paper) return null;
  const r = paper.getBoundingClientRect();
  const sc = viewScale.value || 1;
  return { x: (clientX - r.left) / sc, y: (clientY - r.top) / sc };
}

const marqueeRect = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
let marqueeAdditive = false;
let marqueeDragged = false;

const marqueeStyle = computed(() => {
  const m = marqueeRect.value;
  if (!m) return undefined;
  const r = normalizeRect({ x: m.x0, y: m.y0, w: m.x1 - m.x0, h: m.y1 - m.y0 });
  return {
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.w}px`,
    height: `${r.h}px`,
  };
});

function deleteSelectedZoneEls() {
  const ids = new Set(selectedIds.value);
  if (!ids.size) return;
  const p = props.preset;
  for (const arr of [p.headerElements, p.bodyElements, p.footerElements]) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (ids.has(arr[i].id)) arr.splice(i, 1);
    }
  }
  selectedIds.value = [];
}

function onWindowKeydown(ev: KeyboardEvent) {
  if (ev.key === "Escape") {
    if (eventTargetIsTypingField(ev.target)) return;
    if (selectedIds.value.length) {
      ev.preventDefault();
      selectedIds.value = [];
    }
    return;
  }
  if (ev.key !== "Delete" && ev.key !== "Backspace") return;
  if (eventTargetIsTypingField(ev.target)) return;
  if (!selectedIds.value.length) return;
  ev.preventDefault();
  deleteSelectedZoneEls();
}

function layoutZoneTableInnerStyle(el: LayoutZoneElement): Record<string, string> {
  if (el.type !== "table") return {};
  return { background: zoneTableInnerBackgroundCss(el.bgColor) };
}

function layoutZoneTableCellStyle(el: LayoutZoneElement, ri: number, ci: number): Record<string, string> {
  if (el.type !== "table") return {};
  const cell = layoutTableGrid(el)[ri]?.[ci];
  return {
    backgroundColor: resolveTableCellBackgroundCss(
      { tableBgColor: el.bgColor, tableColBgColors: el.tableColBgColors },
      ci,
      cell,
    ),
    textAlign: axisToCssTextAlign(el.alignX),
    verticalAlign: axisToCssVerticalAlign(el.alignY),
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
    zIndex: normalizeZIndex(el.zIndex),
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
      border: el.showBorder === false ? "none" : `1px solid ${bc}40`,
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

function onPaperBlank(ev: PointerEvent) {
  const t = ev.target as HTMLElement;
  if (t.closest(".lppc-node") || t.closest(".hz")) return;
  const pt = clientToPaperCoords(ev.clientX, ev.clientY);
  if (!pt) return;
  marqueeAdditive = ev.metaKey || ev.ctrlKey;
  marqueeDragged = false;
  marqueeRect.value = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
  bindPtr();
}

function onZoneBlank(ev: PointerEvent) {
  const t = ev.target as HTMLElement;
  if (t.closest(".lppc-node") || t.closest(".hz")) return;
  // 由 paper capture 统一处理框选
}

function onDragLeaveZone(e: DragEvent, z: Zone) {
  const cur = e.currentTarget as HTMLElement;
  const rt = e.relatedTarget as Node | null;
  if (rt && cur.contains(rt)) return;
  if (dragOverZone.value === z) dragOverZone.value = null;
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

async function onDrop(e: DragEvent, zone: Zone) {
  dragOverZone.value = null;
  const t = e.dataTransfer?.getData("application/x-zone-tool") || e.dataTransfer?.getData("text/plain") || "";
  const lay =
    zone === "header" ? hdrLayerRef.value : zone === "footer" ? ftrLayerRef.value : bodyLayerRef.value;
  if (!lay) return;
  const r = lay.getBoundingClientRect();
  const sc = viewScale.value || 1;
  const x = Math.round((e.clientX - r.left) / sc - 16);
  const y = Math.round((e.clientY - r.top) / sc - 12);

  if (isControl(t)) {
    const el = makeLayoutZoneElement(t);
    el.x = Math.max(0, x);
    el.y = Math.max(0, y);
    const { w, h } = bandDims(zone);
    clampZoneElement(el, w, h);
    elementsForZone(zone).push(el);
    selId.value = el.id;
    return;
  }

  const imgFile = pickFirstImageFileFromDataTransfer(e.dataTransfer);
  if (!imgFile) return;
  let dataUrl: string;
  try {
    dataUrl = await readImageFileAsDataUrl(imgFile);
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
    return;
  }
  const el = makeLayoutZoneElement("image");
  el.imageSrc = dataUrl;
  el.x = Math.max(0, x);
  el.y = Math.max(0, y);
  const { w, h } = bandDims(zone);
  clampZoneElement(el, w, h);
  elementsForZone(zone).push(el);
  selId.value = el.id;
}

let move: null | {
  items: Array<{ id: string; z: Zone; ox: number; oy: number }>;
  primaryId: string | null;
  sx: number;
  sy: number;
  dragStarted: boolean;
};
let resize: null | {
  sid: string;
  z: Zone;
  h: Handle;
  sx: number;
  sy: number;
  ix: number;
  iy: number;
  iw: number;
  ih: number;
  groupOrigins: GroupResizeOrigin[] | null;
};

function promotePrimary(id: string) {
  const cur = selectedIds.value;
  if (!cur.includes(id)) {
    selectedIds.value = selectOnly(id);
    return;
  }
  if (primaryId(cur) === id) return;
  selectedIds.value = [...cur.filter((x) => x !== id), id];
}

function clampEl(el: LayoutZoneElement, z: Zone) {
  const { w, h } = bandDims(z);
  clampZoneElement(el, w, h);
}

function clampElMove(el: LayoutZoneElement, z: Zone) {
  const { w, h } = bandDims(z);
  clampPositionOnly(el, w, h);
}

function onZoneTableColumnResize(
  el: LayoutZoneElement,
  z: Zone,
  boundaryIndex: number,
  deltaLayoutPx: number,
) {
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
  const { w: bw, h: bh } = bandDims(z);
  clampZoneTableOuterSize(el, bw, bh, layoutZoneStaticCellTextAt(el));
}

/** 与模版画布一致：微小位移不计入拖拽 */
const MOVE_DRAG_THRESHOLD_PX = 5;

function beginMove(ev: PointerEvent, el: LayoutZoneElement, z: Zone) {
  clearLayoutSnapOverlay();
  const toggle = ev.metaKey || ev.ctrlKey;
  const wasIn = selectedIds.value.includes(el.id);
  if (toggle) {
    selectedIds.value = toggleInSelection(selectedIds.value, el.id);
  } else if (ev.shiftKey) {
    const ordered = elementsForZone(z).map((item) => item.id);
    const anchor = primaryId(selectedIds.value);
    selectedIds.value = rangeSelectInList(ordered, anchor, el.id);
  } else if (wasIn && selectedIds.value.length > 1) {
    // 保持多选
  } else {
    selectedIds.value = selectOnly(el.id);
  }
  if (!selectedIds.value.includes(el.id)) return;

  const items: Array<{ id: string; z: Zone; ox: number; oy: number }> = [];
  for (const zone of ["header", "body", "footer"] as const) {
    for (const item of elementsForZone(zone)) {
      if (selectedIds.value.includes(item.id)) {
        items.push({ id: item.id, z: zone, ox: item.x, oy: item.y });
      }
    }
  }
  move = {
    items,
    primaryId: primaryId(selectedIds.value),
    sx: ev.clientX,
    sy: ev.clientY,
    dragStarted: false,
  };
  bindPtr();
}

function beginResize(ev: PointerEvent, el: LayoutZoneElement, z: Zone, h: Handle) {
  clearLayoutSnapOverlay();
  promotePrimary(el.id);
  const sameZone = elementsForZone(z).filter((item) => selectedIds.value.includes(item.id));
  const groupOrigins: GroupResizeOrigin[] | null =
    sameZone.length >= 2
      ? sameZone.map((item) => ({
          id: item.id,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          horizontalOnly: item.type === "table",
          minW: item.type === "table" ? minOuterSizeForZoneTable(item).w : 16,
          minH: item.type === "table" ? minOuterSizeForZoneTable(item).h : 16,
        }))
      : null;
  resize = {
    sid: el.id,
    z,
    h,
    sx: ev.clientX,
    sy: ev.clientY,
    ix: el.x,
    iy: el.y,
    iw: el.w,
    ih: el.h,
    groupOrigins,
  };
  bindPtr();
}

function bindPtr() {
  window.addEventListener("pointermove", ptrMove);
  window.addEventListener("pointerup", ptrUp, { once: true });
}

function ptrMove(ev: PointerEvent) {
  const sc = viewScale.value || 1;
  if (marqueeRect.value) {
    const pt = clientToPaperCoords(ev.clientX, ev.clientY);
    if (!pt) return;
    marqueeRect.value = { ...marqueeRect.value, x1: pt.x, y1: pt.y };
    if (
      Math.hypot(marqueeRect.value.x1 - marqueeRect.value.x0, marqueeRect.value.y1 - marqueeRect.value.y0) >=
      MOVE_DRAG_THRESHOLD_PX
    ) {
      marqueeDragged = true;
    }
    return;
  }
  if (move) {
    const dxScr = ev.clientX - move.sx;
    const dyScr = ev.clientY - move.sy;
    if (!move.dragStarted) {
      if (Math.hypot(dxScr, dyScr) < MOVE_DRAG_THRESHOLD_PX) return;
      move.dragStarted = true;
    }
    const dx = Math.round(dxScr / sc);
    const dy = Math.round(dyScr / sc);
    let finalDx = dx;
    let finalDy = dy;
    const pid = move.primaryId;
    const primaryItem = pid ? move.items.find((x) => x.id === pid) : null;
    if (primaryItem) {
      const el = elementsForZone(primaryItem.z).find((x) => x.id === pid);
      if (el) {
        let nx = Math.max(0, primaryItem.ox + dx);
        let ny = Math.max(0, primaryItem.oy + dy);
        const { w: bw, h: bh } = bandDims(primaryItem.z);
        const peers = peersForSnapZone(primaryItem.z);
        if (!ev.shiftKey) {
          const snapped = magneticSnapTranslate(nx, ny, el.w, el.h, bw, bh, peers, pid);
          nx = snapped.x;
          ny = snapped.y;
        }
        finalDx = nx - primaryItem.ox;
        finalDy = ny - primaryItem.oy;
      }
    }
    for (const item of move.items) {
      const el = elementsForZone(item.z).find((x) => x.id === item.id);
      if (!el) continue;
      el.x = Math.max(0, item.ox + finalDx);
      el.y = Math.max(0, item.oy + finalDy);
      clampElMove(el, item.z);
    }
    const guideEl = pid ? elementsForZone(zoneForElementId(pid) || "body").find((x) => x.id === pid) : null;
    const gz = pid ? zoneForElementId(pid) : null;
    if (ev.shiftKey || !guideEl || !gz) {
      layoutSnapOverlay.value = { zone: null, v: [], h: [] };
    } else {
      const { w: bw, h: bh } = bandDims(gz);
      layoutSnapOverlay.value = {
        zone: gz,
        ...alignmentGuidesForRect(guideEl.x, guideEl.y, guideEl.w, guideEl.h, bw, bh, peersForSnapZone(gz), guideEl.id),
      };
    }
    return;
  }
  if (resize) {
    const dx = (ev.clientX - resize.sx) / sc;
    const dy = (ev.clientY - resize.sy) / sc;
    const { h } = resize;
    const { w: bw, h: bh } = bandDims(resize.z);
    const peers = peersForSnapZone(resize.z);

    if (resize.groupOrigins && resize.groupOrigins.length >= 2) {
      const patches = applyGroupResize(resize.groupOrigins, h, dx, dy, {
        lockAspect: !!ev.shiftKey,
        defaultMinW: 16,
        defaultMinH: 16,
      });
      const byId = new Map(patches.map((p) => [p.id, p]));
      for (const origin of resize.groupOrigins) {
        const el = elementsForZone(resize.z).find((x) => x.id === origin.id);
        const p = byId.get(origin.id);
        if (!el || !p) continue;
        el.x = p.x;
        el.y = p.y;
        el.w = p.w;
        if (el.type !== "table") el.h = p.h;
        else {
          el.h = origin.h;
          clampZoneTableOuterSize(el, bw, Math.max(16, bh - Math.max(0, el.y)), layoutZoneStaticCellTextAt(el));
        }
        clampElMove(el, resize.z);
      }
      const guideEl = elementsForZone(resize.z).find((x) => x.id === resize!.sid);
      layoutSnapOverlay.value =
        ev.shiftKey || !guideEl
          ? { zone: null, v: [], h: [] }
          : {
              zone: resize.z,
              ...alignmentGuidesForRect(guideEl.x, guideEl.y, guideEl.w, guideEl.h, bw, bh, peers, guideEl.id),
            };
      return;
    }

    const el = elementsForZone(resize.z).find((x) => x.id === resize!.sid);
    if (!el) return;
    let x = resize.ix;
    let y = resize.iy;
    let w = resize.iw;
    let hh = resize.ih;
    const floorW = el.type === "table" ? minOuterSizeForZoneTable(el).w : 16;
    const floorH = el.type === "table" ? minOuterSizeForZoneTable(el).h : 16;
    const isTable = el.type === "table";
    if (h.includes("e")) w = Math.max(floorW, Math.round(resize.iw + dx));
    if (!isTable && h.includes("s")) hh = Math.max(floorH, Math.round(resize.ih + dy));
    if (h.includes("w")) {
      const nw = Math.max(floorW, Math.round(resize.iw - dx));
      x = Math.round(resize.ix + (resize.iw - nw));
      w = nw;
    }
    if (!isTable && h.includes("n")) {
      const nh = Math.max(floorH, Math.round(resize.ih - dy));
      y = Math.round(resize.iy + (resize.ih - nh));
      hh = nh;
    }
    if (!isTable && ev.shiftKey && (h === "se" || h === "nw" || h === "ne" || h === "sw")) {
      const s = Math.max(w, hh, floorW, floorH);
      w = s;
      hh = s;
    }
    Object.assign(el, { x, y, w, h: isTable ? resize.ih : hh });
    if (!ev.shiftKey) {
      const snapped = magneticSnapResize(el.x, el.y, el.w, el.h, h, bw, bh, peers, el.id, floorW, floorH);
      Object.assign(el, snapped);
      if (isTable) el.h = resize.ih;
    }
    if (isTable) {
      clampZoneTableOuterSize(el, bw, Math.max(16, bh - Math.max(0, el.y)), layoutZoneStaticCellTextAt(el));
    }
    clampEl(el, resize.z);
    layoutSnapOverlay.value = ev.shiftKey
      ? { zone: null, v: [], h: [] }
      : {
          zone: resize.z,
          ...alignmentGuidesForRect(el.x, el.y, el.w, el.h, bw, bh, peers, el.id),
        };
  }
}

function ptrUp() {
  if (marqueeRect.value) {
    if (marqueeDragged) {
      const r = normalizeRect({
        x: marqueeRect.value.x0,
        y: marqueeRect.value.y0,
        w: marqueeRect.value.x1 - marqueeRect.value.x0,
        h: marqueeRect.value.y1 - marqueeRect.value.y0,
      });
      const hits = marqueeHitTest(allElementsPaperRects(), r);
      selectedIds.value = applyMarqueeSelection(selectedIds.value, hits, marqueeAdditive);
    } else if (!marqueeAdditive) {
      selectedIds.value = [];
    }
    marqueeRect.value = null;
    marqueeDragged = false;
  }
  move = null;
  resize = null;
  clearLayoutSnapOverlay();
  window.removeEventListener("pointermove", ptrMove);
}

onMounted(() => window.addEventListener("keydown", onWindowKeydown));
onBeforeUnmount(() => {
  ptrUp();
  window.removeEventListener("keydown", onWindowKeydown);
  if (layoutVisualSqlCatalogTimer) {
    clearTimeout(layoutVisualSqlCatalogTimer);
    layoutVisualSqlCatalogTimer = null;
  }
});

function onWheel(ev: WheelEvent) {
  if (!(ev.ctrlKey || ev.metaKey)) return;
  ev.preventDefault();
  const z = Math.exp(-ev.deltaY * 0.001);
  viewScale.value = Math.min(2.8, Math.max(0.35, +(viewScale.value * z).toFixed(4)));
}

function beginImagePick(el: LayoutZoneElement) {
  if (el.type !== "image") return;
  selId.value = el.id;
  pendingLayoutPresetImageEl = el;
  void nextTick(() => layoutPresetImgFileRef.value?.click());
}

async function assignImageSrcFromFileEl(el: LayoutZoneElement | null, f?: File | null) {
  if (!el || el.type !== "image") return;
  const file = f ?? null;
  if (!looksLikeImageFile(file)) return;
  try {
    el.imageSrc = await readImageFileAsDataUrl(file);
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err));
  }
}

async function applyLayoutPresetImageSelection(ev: Event) {
  const inp = ev.target as HTMLInputElement;
  const file = inp.files?.[0];
  inp.value = "";
  const tgt = pendingLayoutPresetImageEl;
  pendingLayoutPresetImageEl = null;
  await assignImageSrcFromFileEl(tgt, file);
}

async function onImageFileDrop(ev: DragEvent, el: LayoutZoneElement) {
  if (el.type !== "image") return;
  selId.value = el.id;
  await assignImageSrcFromFileEl(el, pickFirstImageFileFromDataTransfer(ev.dataTransfer));
}
</script>

<style scoped>
.lppc-viewport {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  background: radial-gradient(rgb(251 251 254), rgb(229 229 237));
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  position: relative;
  touch-action: manipulation;
}
.lppc-tip {
  flex-shrink: 0;
  margin: 0;
  padding: 6px 10px;
  font-size: 11px;
  color: #52525b;
  background: rgb(255 255 255 / 0.92);
  border-bottom: 1px solid #e4e4e7;
}
/* 竖向只在此处滚动，避免与外层 .pe-mid 再叠一条；overflow-x/y 混写会把 y 算成 auto */
.lppc-flow {
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.lppc-scale-frame {
  flex-shrink: 0;
}
.lppc-scaler {
  transform-origin: 0 0;
  padding: 28px;
  display: inline-block;
}
.lppc-paper {
  position: relative;
  background: #fff;
  border: 1px solid #d4d4d8;
  box-shadow: 0 12px 28px rgb(24 24 27 / 0.1);
}
.lppc-marquee {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid #6366f1;
  background: rgb(99 102 241 / 0.12);
  pointer-events: none;
  z-index: 60;
}
.lppc-band {
  box-sizing: border-box;
  /* 缩放手柄在控件外侧，不可 hidden 以免贴边时被裁切 */
  overflow: visible;
}
.lppc-band.hdr,
.lppc-band.ftr {
  background: rgb(239 239 246 / 0.55);
}
.lppc-band.body {
  background: rgb(250 250 252);
}
.lppc-layer {
  position: relative;
}
.lppc-droptarget {
  outline: 2px dashed #818cf8;
  outline-offset: -2px;
  background: rgb(238 242 255 / 0.35);
}
.lppc-node {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid transparent;
  background: transparent;
  display: flex;
  padding: 2px 4px;
  overflow: hidden;
}
.lppc-zone-text {
  box-sizing: border-box;
  /* 父级为 flex + align-items 九宫格时，占满主方向宽度才能按框宽换行 */
  flex: 1 1 0;
  min-width: 0;
  max-height: 100%;
  overflow: hidden;
  line-height: 1.25;
}
.lppc-node.selected {
  border-color: #6366f1;
  box-shadow: 0 0 0 1px #6366f1 inset;
  /* 手柄定位在框外，需透出绘制 */
  overflow: visible;
  z-index: 6;
}
.lppc-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.sr-only-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  opacity: 0;
}
.lppc-img-layer {
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
.lppc-ph {
  font-size: 10px;
  color: #94a3b8;
}
.lppc-ph-upload {
  cursor: pointer;
  border-bottom: 1px dashed currentcolor;
}
.lppc-ph-upload:hover {
  color: #475569;
}
.touch {
  touch-action: manipulation;
}
/* 缩放手柄：大尺寸透明点击区，可视小圆在控件边框外侧 */
.hz {
  --lppc-hz-hit: 44px;
  --lppc-hz-out: 9px; /* 手柄中心相对框角的向外偏移，使圆点完全在框外 */
  position: absolute;
  width: var(--lppc-hz-hit);
  height: var(--lppc-hz-hit);
  margin: 0;
  border: none;
  padding: 0;
  background: transparent;
  cursor: nwse-resize;
  touch-action: none;
  z-index: 3;
  /* 大块命中区会盖住就地输入区；仅让小圆点接收指针（与模版画布一致） */
  pointer-events: none;
}
.hz:focus {
  outline: none;
}
.hz:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
  border-radius: 4px;
}
.hz::after {
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
.hz:hover::after {
  background: linear-gradient(145deg, #6366f1 0%, #4f46e5 100%);
  box-shadow:
    0 2px 6px rgb(15 23 42 / 0.3),
    0 0 0 1px rgb(79 70 229 / 0.45);
}
.hz-nw {
  left: calc(-1 * var(--lppc-hz-out));
  top: calc(-1 * var(--lppc-hz-out));
  margin-left: calc(-0.5 * var(--lppc-hz-hit));
  margin-top: calc(-0.5 * var(--lppc-hz-hit));
}
.hz-ne {
  right: calc(-1 * var(--lppc-hz-out));
  top: calc(-1 * var(--lppc-hz-out));
  margin-right: calc(-0.5 * var(--lppc-hz-hit));
  margin-top: calc(-0.5 * var(--lppc-hz-hit));
  cursor: nesw-resize;
}
.hz-se {
  right: calc(-1 * var(--lppc-hz-out));
  bottom: calc(-1 * var(--lppc-hz-out));
  margin-right: calc(-0.5 * var(--lppc-hz-hit));
  margin-bottom: calc(-0.5 * var(--lppc-hz-hit));
}
.hz-sw {
  left: calc(-1 * var(--lppc-hz-out));
  bottom: calc(-1 * var(--lppc-hz-out));
  margin-left: calc(-0.5 * var(--lppc-hz-hit));
  margin-bottom: calc(-0.5 * var(--lppc-hz-hit));
  cursor: nesw-resize;
}
.hz-n {
  left: 50%;
  top: calc(-1 * var(--lppc-hz-out));
  margin-left: calc(-0.5 * var(--lppc-hz-hit));
  margin-top: calc(-0.5 * var(--lppc-hz-hit));
  cursor: ns-resize;
}
.hz-s {
  left: 50%;
  bottom: calc(-1 * var(--lppc-hz-out));
  margin-left: calc(-0.5 * var(--lppc-hz-hit));
  margin-bottom: calc(-0.5 * var(--lppc-hz-hit));
  cursor: ns-resize;
}
.hz-e {
  right: calc(-1 * var(--lppc-hz-out));
  top: 50%;
  margin-right: calc(-0.5 * var(--lppc-hz-hit));
  margin-top: calc(-0.5 * var(--lppc-hz-hit));
  cursor: ew-resize;
}
.hz-w {
  left: calc(-1 * var(--lppc-hz-out));
  top: 50%;
  margin-left: calc(-0.5 * var(--lppc-hz-hit));
  margin-top: calc(-0.5 * var(--lppc-hz-hit));
  cursor: ew-resize;
}
.lppc-table-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  padding-bottom: 1px;
}
.lppc-table {
  width: 100%;
  height: auto;
  max-height: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  background: rgb(255 255 255 / 0.96);
}
.lppc-table tbody td {
  height: inherit;
  box-sizing: border-box;
}
.lppc-table-cell {
  border-top: 1px solid rgb(212 212 216);
  border-left: 1px solid rgb(212 212 216);
  padding: 3px 5px;
  vertical-align: middle;
  text-align: center;
  overflow: hidden;
  cursor: cell;
}
.lppc-table-cell:last-child {
  border-right: 1px solid rgb(212 212 216);
}
.lppc-table tbody tr:last-child .lppc-table-cell {
  border-bottom: 1px solid rgb(212 212 216);
}
.lppc-table-cell--hot {
  box-shadow: inset 0 0 0 2px #6366f1;
}
.lppc-table-cell-txt {
  display: block;
  font-size: max(10px, 0.85em);
  line-height: 1.3;
  word-break: break-word;
  white-space: pre-wrap;
  max-height: 100%;
  overflow: hidden;
}
.lppc-table-cell-edit {
  display: block;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  resize: none;
  overflow-y: auto;
  max-height: 100%;
  font: inherit;
  color: inherit;
  font-size: max(10px, 0.85em);
  line-height: 1.35;
  letter-spacing: inherit;
  text-align: inherit;
  vertical-align: inherit;
  background: transparent;
  outline: none;
  box-shadow: none;
  caret-color: #4338ca;
  field-sizing: fixed;
  min-height: 0;
}
.lppc-table-cell-edit:focus {
  outline: none;
}
.lppc-table-cell-ddl {
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
.lppc-snap-guide-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 50;
  overflow: visible;
}
.lppc-snap-line {
  position: absolute;
  background: rgb(99 102 241 / 0.92);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.65);
}
.lppc-snap-line--v {
  top: 0;
  bottom: 0;
  width: 1px;
  transform: translateX(-0.5px);
}
.lppc-snap-line--h {
  left: 0;
  right: 0;
  height: 1px;
  transform: translateY(-0.5px);
}
</style>
