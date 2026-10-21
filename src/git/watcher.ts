import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { debounce } from '../shared/debounce';

export interface Disposable {
  dispose(): void;
}

const IGNORED = /(^|[\\/])(objects|logs|hooks)([\\/]|$)|\.lock$/;

/**
 * Observa HEAD, refs, índice y estados de operación dentro de `gitDir`.
 * Ignora objetos y logs (muy ruidosos) y archivos `.lock`.
 */
export function watchGitDir(gitDir: string, onChange: () => void, debounceMs = 250): Disposable {
  const notify = debounce(onChange, debounceMs);
  const watchers: FSWatcher[] = [];

  const handler = (_event: string, filename: string | Buffer | null): void => {
    const name = filename?.toString();
    if (name && IGNORED.test(name)) return;
    notify();
  };

  try {
    watchers.push(watch(gitDir, { recursive: true }, handler));
  } catch {
    // `recursive` no está disponible en algunas plataformas/versiones: se observa lo esencial.
    for (const sub of ['', 'refs', 'refs/heads', 'refs/remotes']) {
      try {
        watchers.push(watch(sub ? `${gitDir}/${sub}` : gitDir, handler));
      } catch {
        // la carpeta puede no existir todavía
      }
    }
  }

  return {
    dispose() {
      notify.cancel();
      for (const w of watchers) w.close();
    },
  };
}
