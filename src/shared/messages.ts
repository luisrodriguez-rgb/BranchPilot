import type { ProtectionConfig } from './protection';
import type { CommitSummary, RepoState } from './types';

/** Estado completo que la extensión envía al panel. */
export type PanelState =
  | { kind: 'empty' }
  | { kind: 'repo'; repo: RepoState; protection: ProtectionConfig; staleDays: number };

export type ToWebview =
  | { type: 'state'; state: PanelState }
  | { type: 'commits'; ref: string; commits: CommitSummary[]; error?: string };

export type FromWebview =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'requestCommits'; ref: string }
  | { type: 'checkout'; ref: string }
  | { type: 'createBranch'; base?: string }
  | { type: 'renameBranch'; ref: string }
  | { type: 'deleteBranch'; ref: string };

export function isFromWebview(value: unknown): value is FromWebview {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as { type?: unknown; ref?: unknown; base?: unknown };
  switch (message.type) {
    case 'ready':
    case 'refresh':
      return true;
    case 'requestCommits':
    case 'checkout':
    case 'renameBranch':
    case 'deleteBranch':
      return typeof message.ref === 'string' && message.ref.length > 0;
    case 'createBranch':
      return message.base === undefined || typeof message.base === 'string';
    default:
      return false;
  }
}

