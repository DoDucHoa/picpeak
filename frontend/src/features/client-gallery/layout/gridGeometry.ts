/** Grid geometry measured from the reference album (spec, "The reference, measured"). */
export const FALLBACK_RATIO = 1.5;

export function gridGeometry(viewportWidth: number): { columns: number; gap: number; padding: number } {
  if (viewportWidth < 768) return { columns: 2, gap: 4, padding: 6 };
  if (viewportWidth < 1920) return { columns: 3, gap: 12, padding: 60 };
  return { columns: 4, gap: 12, padding: 60 };
}

export function columnWidth(containerWidth: number, columns: number, gap: number): number {
  return Math.max(1, (containerWidth - gap * (columns - 1)) / columns);
}

export function tileHeight(
  photo: { width?: number | null; height?: number | null },
  colWidth: number,
): number {
  const ratio = photo.width && photo.height ? photo.height / photo.width : FALLBACK_RATIO;
  return Math.max(1, colWidth * ratio);
}
