import { describe, expect, it } from 'vitest';
import { parseBranchLine, parseBranches, parseCommits, parseStatus, parseWorktrees } from '../../src/git/parse';

const SEP = '\x1f';
const line = (...f: string[]): string => f.join(SEP);

describe('parseBranchLine', () => {
  it('interpreta una rama local con ahead/behind', () => {
    const b = parseBranchLine(
      line('refs/heads/feat/x', 'abc1234', '1700000000', 'Ana', 'feat: x', 'origin/feat/x', '*', '3 1'),
      true,
    );
    expect(b).toMatchObject({
      name: 'feat/x',
      kind: 'local',
      isCurrent: true,
      upstream: 'origin/feat/x',
      ahead: 3,
      behind: 1,
      lastCommit: { hash: 'abc1234', author: 'Ana', subject: 'feat: x', date: 1700000000 },
    });
  });

  it('interpreta una rama remota y descarta origin/HEAD', () => {
    expect(parseBranchLine(line('refs/remotes/origin/dev', 'f00', '10', 'B', 's', '', ' '), false)?.kind).toBe('remote');
    expect(parseBranchLine(line('refs/remotes/origin/HEAD', 'f00', '10', 'B', 's', '', ' '), false)).toBeUndefined();
  });

  it('ignora refs que no son ramas y líneas incompletas', () => {
    expect(parseBranchLine(line('refs/tags/v1', 'a', '1', 'x', 's', '', ' '), false)).toBeUndefined();
    expect(parseBranchLine('', false)).toBeUndefined();
  });

  it('soporta asuntos con caracteres especiales', () => {
    const b = parseBranchLine(line('refs/heads/x', 'a', '1', 'Ñandú', '<b>"hola"</b> & más', '', ' '), false);
    expect(b?.lastCommit.subject).toBe('<b>"hola"</b> & más');
  });
});

describe('parseCommits', () => {
  it('interpreta commits y conserva separadores dentro del asunto', () => {
    const out = `${line('abc123', 'Ana', '1700000000', 'feat: a')}\n\n${line('def456', 'Luis', '1600000000', 'fix: b', 'extra')}\n`;
    expect(parseCommits(out)).toEqual([
      { hash: 'abc123', author: 'Ana', date: 1700000000, subject: 'feat: a' },
      { hash: 'def456', author: 'Luis', date: 1600000000, subject: `fix: b${SEP}extra` },
    ]);
  });
  it('ignora líneas incompletas', () => {
    expect(parseCommits('abc')).toEqual([]);
  });
});

describe('parseBranches', () => {
  it('omite líneas vacías', () => {
    const out = `${line('refs/heads/a', 'h', '1', 'x', 's', '', ' ')}\n\n${line('refs/heads/b', 'h', '2', 'x', 's', '', '*')}\n`;
    expect(parseBranches(out, false).map((b) => b.name)).toEqual(['a', 'b']);
  });
});

describe('parseStatus', () => {
  it('cuenta staged, unstaged, untracked y conflictos', () => {
    const out = ['M  a.ts', ' M b.ts', 'MM c.ts', '?? d.ts', 'UU e.ts', '!! ignorado'].join('\0') + '\0';
    expect(parseStatus(out)).toEqual({ staged: 2, unstaged: 2, untracked: 1, conflicted: 1 });
  });

  it('salta la ruta original de un renombrado', () => {
    const out = ['R  nuevo.ts', 'viejo.ts', ' M otro.ts'].join('\0') + '\0';
    expect(parseStatus(out)).toEqual({ staged: 1, unstaged: 1, untracked: 0, conflicted: 0 });
  });

  it('devuelve ceros con salida vacía', () => {
    expect(parseStatus('')).toEqual({ staged: 0, unstaged: 0, untracked: 0, conflicted: 0 });
  });
});

describe('parseWorktrees', () => {
  it('interpreta múltiples worktrees con ramas, detached y bloqueos', () => {
    const raw =
      [
        'worktree /repo/main',
        'HEAD 1234567890abcdef',
        'branch refs/heads/main',
        '',
        'worktree /repo/wt-feat',
        'HEAD abcdef1234567890',
        'branch refs/heads/feat/agent-2',
        'locked por agente',
        '',
        'worktree /repo/wt-detached',
        'HEAD fedcba0987654321',
        'detached',
        '',
      ].join('\0') + '\0';

    const list = parseWorktrees(raw, '/repo/main');
    expect(list).toEqual([
      {
        path: '/repo/main',
        head: '1234567',
        branch: 'main',
        detached: false,
        isMain: true,
        isCurrent: true,
        locked: false,
        prunable: false,
      },
      {
        path: '/repo/wt-feat',
        head: 'abcdef1',
        branch: 'feat/agent-2',
        detached: false,
        isMain: false,
        isCurrent: false,
        locked: true,
        prunable: false,
      },
      {
        path: '/repo/wt-detached',
        head: 'fedcba0',
        detached: true,
        isMain: false,
        isCurrent: false,
        locked: false,
        prunable: false,
      },
    ]);
  });
});

