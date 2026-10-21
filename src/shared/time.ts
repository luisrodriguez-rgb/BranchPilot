const UNITS: Array<{ limit: number; seconds: number; singular: string; plural: string }> = [
  { limit: 60, seconds: 1, singular: 'segundo', plural: 'segundos' },
  { limit: 3600, seconds: 60, singular: 'minuto', plural: 'minutos' },
  { limit: 86_400, seconds: 3600, singular: 'hora', plural: 'horas' },
  { limit: 2_592_000, seconds: 86_400, singular: 'día', plural: 'días' },
  { limit: 31_536_000, seconds: 2_592_000, singular: 'mes', plural: 'meses' },
  { limit: Infinity, seconds: 31_536_000, singular: 'año', plural: 'años' },
];

/** Tiempo relativo en español: "hace 2 horas". `unixSeconds` es epoch en segundos. */
export function relativeTime(unixSeconds: number, nowMs: number): string {
  const diff = Math.max(0, Math.floor(nowMs / 1000 - unixSeconds));
  if (diff < 5) return 'hace un momento';
  for (const unit of UNITS) {
    if (diff < unit.limit) {
      const value = Math.floor(diff / unit.seconds);
      return `hace ${value} ${value === 1 ? unit.singular : unit.plural}`;
    }
  }
  return '';
}
