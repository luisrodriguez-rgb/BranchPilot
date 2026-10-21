import type { Locale } from './i18n';
import type { ProtectionConfig } from './protection';
import type { CommitSummary, RepoOverview, RepoState } from './types';

/** Estado completo que la extensión envía al panel. */
export type PanelState =
  | { kind: 'empty'; locale?: Locale }
  | {
      kind: 'repo';
      repo: RepoState;
      repositories: RepoOverview[];
      protection: ProtectionConfig;
      staleDays: number;
      locale?: Locale;
    };

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
  | { type: 'deleteBranch'; ref: string }
  | { type: 'undoLastAction' }
  | { type: 'createTaskBranch' }
  | { type: 'moveDirtyToTaskBranch' }
  | { type: 'verifyBranchForTask' }
  | { type: 'setupAgentRules' }
  | { type: 'createWorktree'; ref?: string }
  | { type: 'openWorktree'; path: string }
  | { type: 'removeWorktree'; path: string }
  | { type: 'selectRepo'; root: string }
  | { type: 'openRepoInWindow'; root: string };

export function isFromWebview(value: unknown): value is FromWebview {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as { type?: unknown; ref?: unknown; base?: unknown; path?: unknown; root?: unknown };
  switch (message.type) {
    case 'ready':
    case 'refresh':
    case 'undoLastAction':
    case 'createTaskBranch':
    case 'moveDirtyToTaskBranch':
    case 'verifyBranchForTask':
    case 'setupAgentRules':
      return true;
    case 'requestCommits':
    case 'checkout':
    case 'renameBranch':
    case 'deleteBranch':
      return typeof message.ref === 'string' && message.ref.length > 0;
    case 'createBranch':
      return message.base === undefined || typeof message.base === 'string';
    case 'createWorktree':
      return message.ref === undefined || typeof message.ref === 'string';
    case 'openWorktree':
    case 'removeWorktree':
      return typeof message.path === 'string' && message.path.length > 0;
    case 'selectRepo':
    case 'openRepoInWindow':
      return typeof message.root === 'string' && message.root.length > 0;
    default:
      return false;
  }
}




