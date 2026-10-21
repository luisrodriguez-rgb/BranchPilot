import type { BranchInfo, WorkingTreeStatus } from '../shared/types';

const SEP = '\x1f';
const LOCAL_PREFIX = 'refs/heads/';
const REMOTE_PREFIX = 'refs/remotes/';

/** Campos de `for-each-ref`; `%1f` es el separador de unidad. */
export function branchFormat(aheadBehindBase?: string): string {
  const fields = [
    '%(refname)',
    '%(objectname:short)',
    '%(committerdate:unix)',
    '%(authorname)',
    '%(contents:subject)',
    '%(upstream:short)',
    '%(HEAD)',
  ];
  if (aheadBehindBase) fields.push(`%(ahead-behind:${aheadBehindBase})`);
  return fields.join('%1f');
}

export function parseBranchLine(line: string, withAheadBehind: boolean): BranchInfo | undefined {
  const parts = line.split(SEP);
  const [fullRef, hash, date, author, subject, upstream, head, aheadBehind] = parts;
  if (!fullRef || hash === undefined || date === undefined) return undefined;

  let kind: BranchInfo['kind'];
  let name: string;
  if (fullRef.startsWith(LOCAL_PREFIX)) {
    kind = 'local';
    name = fullRef.slice(LOCAL_PREFIX.length);
  } else if (fullRef.startsWith(REMOTE_PREFIX)) {
    kind = 'remote';
    name = fullRef.slice(REMOTE_PREFIX.length);
    if (name.endsWith('/HEAD')) return undefined;
  } else {
    return undefined;
  }

  const branch: BranchInfo = {
    name,
    fullRef,
    kind,
    isCurrent: head === '*',
    merged: false,
    lastCommit: {
      hash,
      subject: subject ?? '',
      author: author ?? '',
      date: Number.parseInt(date, 10) || 0,
    },
  };
  if (upstream) branch.upstream = upstream;

  if (withAheadBehind && aheadBehind) {
    const [ahead, behind] = aheadBehind.trim().split(/\s+/).map((n) => Number.parseInt(n, 10));
    if (Number.isFinite(ahead) && Number.isFinite(behind)) {
      branch.ahead = ahead;
      branch.behind = behind;
    }
  }
  return branch;
}

export function parseBranches(output: string, withAheadBehind: boolean): BranchInfo[] {
  const branches: BranchInfo[] = [];
  for (const line of output.split('\n')) {
    if (!line) continue;
    const parsed = parseBranchLine(line, withAheadBehind);
    if (parsed) branches.push(parsed);
  }
  return branches;
}

const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

/** Interpreta `git status --porcelain=v1 -z`. */
export function parseStatus(output: string): Omit<WorkingTreeStatus, 'operation'> {
  const result = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 };
  const entries = output.split('\0');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || entry.length < 3) continue;
    const x = entry[0] ?? ' ';
    const y = entry[1] ?? ' ';
    // Renombrados y copias van seguidos de una entrada con la ruta original.
    if (x === 'R' || x === 'C') i++;
    const code = `${x}${y}`;
    if (code === '!!') continue;
    if (code === '??') {
      result.untracked++;
    } else if (CONFLICT_CODES.has(code)) {
      result.conflicted++;
    } else {
      if (x !== ' ') result.staged++;
      if (y !== ' ') result.unstaged++;
    }
  }
  return result;
}
