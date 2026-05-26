import { opcDataTypeLabelMatchesFilter } from "@/features/datasource/opcua/opcua-tree-utils.js";

/** 曲线保留采样点数（1 秒 1 次 ≈ 3000 秒） */
export const AUTO_TRIGGER_CHART_MAX_SAMPLES = 3000;

/** String 类型不绘制曲线 */
export function isOpcTriggerChartEligible(dataType: string | undefined): boolean {
  const dt = (dataType || "").trim();
  if (!dt) return true;
  return !opcDataTypeLabelMatchesFilter(dt, "String");
}

/** 将 OPC 读值转为曲线用的数值；String 类型变量应在上层跳过 */
export function coerceOpcTriggerNumericSample(value: unknown, dataType?: string): number | null {
  if (dataType && opcDataTypeLabelMatchesFilter(dataType, "String")) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export class NumericSampleRing {
  private readonly max: number;
  private buf: number[] = [];

  constructor(max = AUTO_TRIGGER_CHART_MAX_SAMPLES) {
    this.max = max;
  }

  get length(): number {
    return this.buf.length;
  }

  last(): number | undefined {
    return this.buf.length ? this.buf[this.buf.length - 1] : undefined;
  }

  push(v: number): void {
    this.buf.push(v);
    if (this.buf.length > this.max) {
      this.buf = this.buf.slice(this.buf.length - this.max);
    }
  }

  toArray(): number[] {
    return [...this.buf];
  }

  clear(): void {
    this.buf = [];
  }
}
