import { quoteSqlIdentifier } from "@/lib/report-template/table-sql-visual-compile";
import type { ScalarSqlVisualConfig } from "@/lib/report-template/scalar-sql-visual";
import { validateSqlIdentifier } from "@/lib/report-template/table-sql-fill";

/** 将可视化配置编译为标量只读 SELECT（预览取首行首列） */
export function compileScalarVisualSql(visual: ScalarSqlVisualConfig): string {
  const table = visual.table.trim();
  const col = visual.valueColumn.trim();
  if (!table || !col) return "";
  const eng = (visual.engine || "").trim().toLowerCase();
  if (!eng || eng === "mongodb") return "";

  try {
    if ((eng === "postgres" || eng === "postgresql") && table.includes(".")) {
      const [schema, name] = table.split(".", 2);
      validateSqlIdentifier(schema);
      validateSqlIdentifier(name);
    } else {
      validateSqlIdentifier(table);
    }
    validateSqlIdentifier(col);
  } catch {
    return "";
  }

  const qt =
    (eng === "postgres" || eng === "postgresql") && table.includes(".")
      ? table
          .split(".", 2)
          .map((p) => quoteSqlIdentifier(eng, p))
          .join(".")
      : quoteSqlIdentifier(eng, table);
  const qc = quoteSqlIdentifier(eng, col);
  const whereCol = visual.whereColumn.trim();
  if (whereCol) {
    try {
      validateSqlIdentifier(whereCol);
    } catch {
      return `SELECT ${qc} FROM ${qt} LIMIT 1`;
    }
    const qw = quoteSqlIdentifier(eng, whereCol);
    const slot = visual.whereParamSlot === 1 ? 1 : 0;
    return `SELECT ${qc} FROM ${qt} WHERE ${qw} = {{p${slot}}} LIMIT 1`;
  }
  return `SELECT ${qc} FROM ${qt} LIMIT 1`;
}
