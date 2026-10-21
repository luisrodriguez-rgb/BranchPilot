import type { ProtectionConfig } from './protection';
import type { RepoState } from './types';

/** Estado completo que la extensión envía al panel. */
export type PanelState =
  | { kind: 'empty' }
  | { kind: 'repo'; repo: RepoState; protection: ProtectionConfig; staleDays: number };

export type ToWebview = { type: 'state'; state: PanelState };

export type FromWebview = { type: 'ready' } | { type: 'refresh' };

export function isFromWebview(value: unknown): value is FromWebview {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === 'ready' || type === 'refresh';
}
