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
  | { type: 'requestCommits'; ref: string };

export function isFromWebview(value: unknown): value is FromWebview {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as { type?: unknown; ref?: unknown };
  if (message.type === 'ready' || message.type === 'refresh') return true;
  return message.type === 'requestCommits' && typeof message.ref === 'string';
}
