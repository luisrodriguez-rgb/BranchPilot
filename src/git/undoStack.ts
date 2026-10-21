export type UndoEntry =
  | {
      kind: 'deleteBranch';
      repoRoot: string;
      branchName: string;
      targetSha: string;
      timestamp: number;
    }
  | {
      kind: 'renameBranch';
      repoRoot: string;
      fromName: string;
      toName: string;
      timestamp: number;
    }
  | {
      kind: 'checkout';
      repoRoot: string;
      previousRef: string;
      targetRef: string;
      timestamp: number;
    };

export interface ReflogEntry {
  sha: string;
  selector: string;
  subject: string;
}

/**
 * Interpreta la salida de `git reflog show HEAD -n <N> --format=%H%x00%gD%x00%gs%x00`.
 */
export function parseReflog(output: string): ReflogEntry[] {
  const entries: ReflogEntry[] = [];
  for (const record of output.split(/\0(?:\r?\n|\0)/)) {
    const trimmed = record.trim();
    if (!trimmed) continue;
    const [sha, selector, subject] = trimmed.split('\0');
    if (!sha || !selector) continue;
    entries.push({
      sha: sha.trim(),
      selector: selector.trim(),
      subject: (subject ?? '').trim(),
    });
  }
  return entries;
}

export function describeUndoEntry(entry: UndoEntry): string {
  switch (entry.kind) {
    case 'deleteBranch':
      return `Restaurar rama eliminada «${entry.branchName}» en ${entry.targetSha.slice(0, 7)}`;
    case 'renameBranch':
      return `Revertir renombrado «${entry.toName}» → «${entry.fromName}»`;
    case 'checkout':
      return `Volver a la rama anterior «${entry.previousRef}» (desde «${entry.targetRef}»)`;
  }
}

/**
 * Pila acotada en memoria de acciones de rama reversibles (`deleteBranch`, `renameBranch`, `checkout`).
 */
export class UndoStack {
  private readonly items: UndoEntry[] = [];

  constructor(private readonly maxSize = 25) {}

  push(entry: UndoEntry): void {
    this.items.push(entry);
    if (this.items.length > this.maxSize) {
      this.items.shift();
    }
  }

  peek(repoRoot?: string): UndoEntry | undefined {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item && (!repoRoot || item.repoRoot === repoRoot)) {
        return item;
      }
    }
    return undefined;
  }

  pop(repoRoot?: string): UndoEntry | undefined {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item && (!repoRoot || item.repoRoot === repoRoot)) {
        this.items.splice(i, 1);
        return item;
      }
    }
    return undefined;
  }

  get size(): number {
    return this.items.length;
  }
}
