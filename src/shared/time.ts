import type { Locale } from './i18n';

interface TimeUnit {
  limit: number;
  seconds: number;
  esSingular: string;
  esPlural: string;
  enSingular: string;
  enPlural: string;
}

const UNITS: TimeUnit[] = [
  { limit: 60, seconds: 1, esSingular: 'segundo', esPlural: 'segundos', enSingular: 'second', enPlural: 'seconds' },
  { limit: 3600, seconds: 60, esSingular: 'minuto', esPlural: 'minutos', enSingular: 'minute', enPlural: 'minutes' },
  { limit: 86_400, seconds: 3600, esSingular: 'hora', esPlural: 'horas', enSingular: 'hour', enPlural: 'hours' },
  { limit: 2_592_000, seconds: 86_400, esSingular: 'día', esPlural: 'días', enSingular: 'day', enPlural: 'days' },
  { limit: 31_536_000, seconds: 2_592_000, esSingular: 'mes', esPlural: 'meses', enSingular: 'month', enPlural: 'months' },
  { limit: Infinity, seconds: 31_536_000, esSingular: 'año', esPlural: 'años', enSingular: 'year', enPlural: 'years' },
];

/** Tiempo relativo localizado ("hace 2 horas" / "2 hours ago"). `unixSeconds` es epoch en segundos. */
export function relativeTime(unixSeconds: number, nowMs: number, locale: Locale = 'es'): string {
  const diff = Math.max(0, Math.floor(nowMs / 1000 - unixSeconds));
  if (diff < 5) return locale === 'en' ? 'just now' : 'hace un momento';
  for (const unit of UNITS) {
    if (diff < unit.limit) {
      const value = Math.floor(diff / unit.seconds);
      if (locale === 'en') {
        return `${value} ${value === 1 ? unit.enSingular : unit.enPlural} ago`;
      }
      return `hace ${value} ${value === 1 ? unit.esSingular : unit.esPlural}`;
    }
  }
  return '';
}

/** Versión compacta sin prefijo/sufijo ("2 horas" / "2 hours") para listas densas de commits. */
export function shortRelativeTime(unixSeconds: number, nowMs: number, locale: Locale = 'es'): string {
  const full = relativeTime(unixSeconds, nowMs, locale);
  return locale === 'en' ? full.replace(/ ago$/, '') : full.replace(/^hace /, '');
}

