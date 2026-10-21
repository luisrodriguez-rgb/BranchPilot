import * as vscode from 'vscode';
import { DEFAULT_PROTECTION } from './shared/protection';
import type { ProtectionConfig, ProtectionMode } from './shared/protection';
import { DEFAULT_STALE_DAYS } from './shared/filter';

export interface Settings {
  protection: ProtectionConfig;
  staleDays: number;
}

const MODES: ProtectionMode[] = ['all', 'list', 'off'];

export function readSettings(): Settings {
  const cfg = vscode.workspace.getConfiguration('branchpilot');
  const mode = cfg.get<string>('protection.mode', DEFAULT_PROTECTION.mode);
  const list = cfg.get<unknown>('protection.protectedBranches', DEFAULT_PROTECTION.protectedBranches);
  const staleDays = cfg.get<number>('staleDays', DEFAULT_STALE_DAYS);
  return {
    protection: {
      mode: MODES.includes(mode as ProtectionMode) ? (mode as ProtectionMode) : DEFAULT_PROTECTION.mode,
      protectedBranches: Array.isArray(list)
        ? list.filter((x): x is string => typeof x === 'string' && x.length > 0)
        : DEFAULT_PROTECTION.protectedBranches,
    },
    staleDays: Number.isFinite(staleDays) && staleDays > 0 ? staleDays : DEFAULT_STALE_DAYS,
  };
}
