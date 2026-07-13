/** 历史报表导航纯函数（010 · B 组契约） */
export function segmentsForDepth(relSegments: string[], depth: number): string[] {
  if (depth < 0) return [];
  return relSegments.slice(0, depth + 1);
}

export function shouldApplyScanGeneration(requestGen: number, latestGen: number): boolean {
  return requestGen === latestGen;
}

export function pageOffset(pageIndex: number, pageSize: number): number {
  const i = Math.max(0, Math.floor(pageIndex) || 0);
  const s = Math.max(1, Math.floor(pageSize) || 50);
  return i * s;
}
