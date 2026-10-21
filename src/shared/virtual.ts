export interface VirtualWindow {
  start: number;
  end: number;
  offsetTop: number;
  totalHeight: number;
}

/** Calcula el rango [start, end) de filas a pintar en una lista de altura fija. */
export function computeWindow(
  scrollTop: number,
  viewportHeight: number,
  total: number,
  rowHeight: number,
  overscan = 6,
): VirtualWindow {
  const totalHeight = total * rowHeight;
  if (total === 0) return { start: 0, end: 0, offsetTop: 0, totalHeight };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight) + 1;
  const start = Math.max(0, Math.min(first - overscan, total - 1));
  const end = Math.min(total, first + visible + overscan);
  return { start, end, offsetTop: start * rowHeight, totalHeight };
}

/** Ajusta scrollTop para que la fila `index` quede completamente visible. */
export function scrollTopToReveal(
  index: number,
  currentScrollTop: number,
  viewportHeight: number,
  rowHeight: number,
): number {
  const rowTop = index * rowHeight;
  const rowBottom = rowTop + rowHeight;
  if (rowTop < currentScrollTop) return rowTop;
  if (rowBottom > currentScrollTop + viewportHeight) return rowBottom - viewportHeight;
  return currentScrollTop;
}
