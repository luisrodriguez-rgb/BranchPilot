import { countByFilter, filterBranches, sortBranches } from '../../../shared/filter';
import type { FilterId } from '../../../shared/filter';
import { getUiStrings, resolveLocale } from '../../../shared/i18n';
import type { Locale, UiStrings } from '../../../shared/i18n';
import type { FromWebview, PanelState, ToWebview } from '../../../shared/messages';
import { isListedProtected } from '../../../shared/protection';
import { relativeTime } from '../../../shared/time';
import type { BranchInfo, RepoOverview, RepoState } from '../../../shared/types';
import { isDirty } from '../../../shared/types';
import { computeWindow, scrollTopToReveal } from '../../../shared/virtual';
import { h, icon } from './dom';
import type { Child } from './dom';
import { HoverCard } from './hoverCard';

interface VsCodeApi {
  postMessage(message: FromWebview): void;
  getState(): PersistedState | undefined;
  setState(state: PersistedState): void;
}
interface PersistedState {
  filter: FilterId;
  query: string;
  onlyActiveRepos?: boolean;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const ROW_HEIGHT = 54;

const ICON_BRANCH =
  '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="6" r="1.6"/><path d="M4 5.1v5.8"/><path d="M12 7.6c0 2.6-3.2 2.6-7 4.4"/></svg>';
const ICON_PILOT =
  '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 1.8 5.8 4.7-4.6-.9v3.6L8 10.3l-1.2-1.1V5.6L2.2 6.5z"/><path d="M8 1.8v3.8"/><circle cx="4.2" cy="13" r="1.3"/><circle cx="11.8" cy="13" r="1.3"/><path d="M6.8 9.2c-1.2 1-2.6 1.8-2.6 2.5M9.2 9.2c1.2 1 2.6 1.8 2.6 2.5"/></svg>';
const ICON_COMMIT =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="2.5"/><path d="M1 8h4.5M10.5 8H15"/></svg>';
const ICON_SCM =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="4" r="1.8"/><circle cx="5" cy="12" r="1.8"/><circle cx="11.5" cy="8" r="1.8"/><path d="M5 5.8v4.4"/><path d="M11.5 9.8c0 1.5-2 2.2-4.5 2.2"/></svg>';
const ICON_REFRESH =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.7-4"/><path d="M13.5 2.5v3h-3"/></svg>';
const ICON_UNDO =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h5.5a3.5 3.5 0 1 1 0 7H6"/><path d="M6.5 3.5 4 6l2.5 2.5"/></svg>';
const ICON_PLUS =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10"/><path d="M3 8h10"/></svg>';
const ICON_SWITCH =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h9"/><path d="M9 4.5 12.5 8 9 11.5"/></svg>';
const ICON_EDIT =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.2 2.5 13.5 4.8 5.5 12.8 2.5 13.5 3.2 10.5Z"/></svg>';
const ICON_TRASH =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M6 4.5V3h4v1.5"/><path d="M4.5 4.5 5.2 13h5.6l.7-8.5"/></svg>';
const ICON_WINDOW =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6h12"/></svg>';

const saved = vscode.getState();
const ui = {
  filter: saved?.filter ?? ('all' as FilterId),
  query: saved?.query ?? '',
  onlyActiveRepos: saved?.onlyActiveRepos ?? false,
  selectedRef: undefined as string | undefined,
  panel: { kind: 'empty' } as PanelState,
  visible: [] as BranchInfo[],
};

function currentLocale(): Locale {
  return resolveLocale(ui.panel.locale ?? navigator.language);
}

function strings(): UiStrings {
  return getUiStrings(ui.panel.locale ?? navigator.language);
}

function persist(): void {
  vscode.setState({ filter: ui.filter, query: ui.query, onlyActiveRepos: ui.onlyActiveRepos });
}

const card = new HoverCard({
  host: document.body,
  requestCommits: (ref) => vscode.postMessage({ type: 'requestCommits', ref }),
  getLocale: () => currentLocale(),
});

const app = document.getElementById('app') as HTMLElement;

// Referencias a nodos que se actualizan sin reconstruir todo (para no perder foco).
let searchInput: HTMLInputElement | undefined;
let listEl: HTMLElement | undefined;
let rowsEl: HTMLElement | undefined;
let spacerEl: HTMLElement | undefined;
let chipsEl: HTMLElement | undefined;
let summaryEl: HTMLElement | undefined;
let reposEl: HTMLElement | undefined;
let headerEl: HTMLElement | undefined;
let worktreesEl: HTMLElement | undefined;
let footerEl: HTMLElement | undefined;
let builtFor: 'empty' | 'repo' | undefined;

function buildShell(): void {
  const s = strings();
  app.replaceChildren();
  searchInput = h('input', {
    type: 'search',
    class: 'search',
    placeholder: s.searchPlaceholder,
    'aria-label': s.searchPlaceholder,
    spellcheck: 'false',
  });
  searchInput.value = ui.query;
  searchInput.addEventListener('input', () => {
    ui.query = searchInput?.value ?? '';
    ui.selectedRef = undefined;
    persist();
    renderList(true);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      listEl?.focus();
      moveSelection(0);
    } else if (e.key === 'Escape' && ui.query) {
      ui.query = '';
      if (searchInput) searchInput.value = '';
      persist();
      renderList(true);
    }
  });

  const createBtn = h(
    'button',
    {
      class: 'action-primary',
      type: 'button',
      'data-tooltip': s.newBranchBtn,
      'data-tooltip-pos': 'bottom',
      'aria-label': s.newBranchBtn,
    },
    icon(ICON_PLUS, 'icon'),
    h('span', {}, s.newBranchBtn),
  );
  createBtn.addEventListener('click', () => {
    card.hide();
    vscode.postMessage({ type: 'createBranch' });
  });

  const undoBtn = h('button', {
    class: 'icon-button',
    type: 'button',
    'data-tooltip': s.undoBtnTooltip,
    'data-tooltip-pos': 'bottom',
    'aria-label': s.undoBtn,
  });
  undoBtn.append(icon(ICON_UNDO, 'icon'));
  undoBtn.addEventListener('click', () => {
    card.hide();
    vscode.postMessage({ type: 'undoLastAction' });
  });

  const refresh = h('button', {
    class: 'icon-button',
    type: 'button',
    'data-tooltip': s.refreshBtnTooltip,
    'data-tooltip-pos': 'bottom',
    'aria-label': s.refreshBtnTitle,
  });
  refresh.append(icon(ICON_REFRESH, 'icon'));
  refresh.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));

  reposEl = h('section', { class: 'repos-bar', 'aria-label': 'Repositorios del workspace', hidden: '' });
  headerEl = h('section', { class: 'current', 'aria-label': s.currentBranchEyebrow });
  worktreesEl = h('section', { class: 'worktrees', 'aria-label': 'Worktrees activos' });
  chipsEl = h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Filtros de ramas' });
  summaryEl = h('div', { class: 'summary', role: 'status' });
  spacerEl = h('div', { class: 'spacer' });
  rowsEl = h('div', { class: 'rows' });
  spacerEl.append(rowsEl);
  listEl = h('div', { class: 'list', role: 'listbox', tabindex: '0', 'aria-label': 'Ramas' }, spacerEl);
  footerEl = h('footer', { class: 'footer' });

  listEl.addEventListener('scroll', () => {
    card.hide();
    requestAnimationFrame(() => renderRows());
  });
  listEl.addEventListener('keydown', onListKey);
  new ResizeObserver(() => renderRows()).observe(listEl);

  app.append(
    reposEl,
    headerEl,
    worktreesEl,
    h('div', { class: 'toolbar' }, searchInput, createBtn, undoBtn, refresh),
    chipsEl,
    summaryEl,
    listEl,
    footerEl,
  );
}

function onListKey(e: KeyboardEvent): void {
  const page = Math.max(1, Math.floor((listEl?.clientHeight ?? ROW_HEIGHT) / ROW_HEIGHT) - 1);
  const index = selectedIndex();
  const selectedBranch = index >= 0 ? ui.visible[index] : undefined;
  const ctx = currentRepo();
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      moveSelection(index < 0 ? 0 : index + 1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (index <= 0) searchInput?.focus();
      else moveSelection(index - 1);
      break;
    case 'PageDown':
      e.preventDefault();
      moveSelection(index + page);
      break;
    case 'PageUp':
      e.preventDefault();
      moveSelection(Math.max(0, index - page));
      break;
    case 'Home':
      e.preventDefault();
      moveSelection(0);
      break;
    case 'End':
      e.preventDefault();
      moveSelection(ui.visible.length - 1);
      break;
    case 'Enter':
      if (selectedBranch && !selectedBranch.isCurrent) {
        e.preventDefault();
        card.hide();
        vscode.postMessage({ type: 'checkout', ref: selectedBranch.fullRef });
      }
      break;
    case 'F2':
      if (selectedBranch && selectedBranch.kind === 'local') {
        e.preventDefault();
        card.hide();
        vscode.postMessage({ type: 'renameBranch', ref: selectedBranch.fullRef });
      }
      break;
    case 'Delete':
      if (
        selectedBranch &&
        selectedBranch.kind === 'local' &&
        !selectedBranch.isCurrent &&
        selectedBranch.name !== ctx?.repo.baseBranch
      ) {
        e.preventDefault();
        card.hide();
        vscode.postMessage({ type: 'deleteBranch', ref: selectedBranch.fullRef });
      }
      break;
  }
}

function selectedIndex(): number {
  if (!ui.selectedRef) return -1;
  return ui.visible.findIndex((b) => b.fullRef === ui.selectedRef);
}

function moveSelection(index: number): void {
  if (ui.visible.length === 0 || !listEl) return;
  const clamped = Math.min(Math.max(0, index), ui.visible.length - 1);
  const target = ui.visible[clamped];
  if (!target) return;
  ui.selectedRef = target.fullRef;
  listEl.scrollTop = scrollTopToReveal(clamped, listEl.scrollTop, listEl.clientHeight, ROW_HEIGHT);
  renderRows();
  const row = document.getElementById(`opt-${clamped}`);
  if (row) card.scheduleShow(target, row, currentRepo()?.repo.baseBranch, true);
}

function renderEmpty(): void {
  const s = strings();
  builtFor = 'empty';
  app.replaceChildren(
    h(
      'div',
      { class: 'empty' },
      h('h2', {}, s.emptyTitle),
      h('p', {}, s.emptyBody),
    ),
  );
}

function renderHeader(repo: RepoState, protectedNow: boolean): void {
  if (!headerEl) return;
  const s = strings();
  const { head, workingTree: wt } = repo;
  const current = repo.branches.find((b) => b.isCurrent);
  const name = head.detached ? `HEAD @ ${head.shortHash ?? '—'}` : (head.branch ?? 'HEAD');

  const badges = h('div', { class: 'badges' });
  if (head.detached) badges.append(h('span', { class: 'badge warn' }, s.detachedBadge));
  if (protectedNow) badges.append(h('span', { class: 'badge warn' }, s.protectedBadge));
  if (wt.operation) badges.append(h('span', { class: 'badge warn' }, s.operationBadge(wt.operation)));
  badges.append(
    isDirty(wt)
      ? h('span', { class: 'badge changes' }, s.changesBadge(wt.staged + wt.unstaged + wt.untracked + wt.conflicted))
      : h('span', { class: 'badge ok' }, s.cleanBadge),
  );
  if (wt.conflicted > 0) badges.append(h('span', { class: 'badge danger' }, s.conflictsBadge(wt.conflicted)));

  const meta: Child[] = [];
  if (current) {
    meta.push(
      h('span', { class: 'mono' }, current.lastCommit.hash),
      ` ${current.lastCommit.subject} · ${relativeTime(current.lastCommit.date, Date.now(), currentLocale())}`,
    );
  } else if (!head.detached) {
    meta.push(s.noCommitsYet);
  }

  const base: Child[] = [];
  if (repo.baseBranch && current && current.name !== repo.baseBranch && current.ahead !== undefined) {
    base.push(
      s.versusBase(repo.baseBranch),
      h('span', { class: `ahead${current.ahead === 0 ? ' zero' : ''}` }, `↑${current.ahead}`),
      ' ',
      h('span', { class: `behind${(current.behind ?? 0) === 0 ? ' zero' : ''}` }, `↓${current.behind ?? 0}`),
    );
  }

  headerEl.className = `current${protectedNow || head.detached ? ' alert' : ''}`;
  const taskBar = h('div', { class: 'task-actions' });
  const taskBtn = h(
    'button',
    {
      class: 'task-btn primary',
      type: 'button',
      'data-tooltip': s.taskBranchTooltip,
      'aria-label': s.taskBranchBtn,
    },
    icon(ICON_PLUS, 'icon'),
    h('span', {}, s.taskBranchBtn),
  );
  taskBtn.addEventListener('click', () => {
    card.hide();
    vscode.postMessage({ type: 'createTaskBranch' });
  });

  const precheckBtn = h(
    'button',
    {
      class: 'task-btn',
      type: 'button',
      'data-tooltip': s.precheckTooltip,
      'aria-label': s.precheckBtn,
    },
    h('span', {}, s.precheckBtn),
  );
  precheckBtn.addEventListener('click', () => {
    card.hide();
    vscode.postMessage({ type: 'verifyBranchForTask' });
  });

  const rulesBtn = h(
    'button',
    {
      class: 'task-btn',
      type: 'button',
      'data-tooltip': s.agentRulesTooltip,
      'aria-label': s.agentRulesBtn,
    },
    h('span', {}, s.agentRulesBtn),
  );
  rulesBtn.addEventListener('click', () => {
    card.hide();
    vscode.postMessage({ type: 'setupAgentRules' });
  });

  taskBar.append(taskBtn, precheckBtn, rulesBtn);

  if (protectedNow && isDirty(wt)) {
    const rescueBtn = h(
      'button',
      {
        class: 'task-btn rescue',
        type: 'button',
        'data-tooltip': s.rescueDirtyTooltip,
        'aria-label': s.rescueDirtyBtn,
      },
      icon(ICON_SWITCH, 'icon'),
      h('span', {}, s.rescueDirtyBtn),
    );
    rescueBtn.addEventListener('click', () => {
      card.hide();
      vscode.postMessage({ type: 'moveDirtyToTaskBranch' });
    });
    taskBar.append(rescueBtn);
  }

  const sections: Node[] = [
    h('div', { class: 'current-top' }, h('span', { class: 'eyebrow' }, s.currentBranchEyebrow), h('span', { class: 'repo-name' }, repo.name)),
    h('div', { class: 'current-name' }, icon(ICON_PILOT, 'icon'), h('span', { class: 'name-text', title: name }, name)),
    badges,
  ];
  if (meta.length > 0) sections.push(h('div', { class: 'meta' }, ...meta));
  if (base.length > 0) sections.push(h('div', { class: 'meta' }, ...base));
  sections.push(taskBar);

  if (isDirty(wt)) {
    const commitInput = h('input', {
      class: 'commit-input',
      type: 'text',
      placeholder: s.quickCommitPlaceholder,
      'aria-label': s.quickCommitPlaceholder,
    }) as HTMLInputElement;

    const commitBtnLabel = protectedNow ? s.quickCommitProtectedBtn(name) : s.quickCommitBtn;
    const commitBtnTooltip = protectedNow ? s.quickCommitProtectedTooltip(name) : s.quickCommitBtn;

    const commitBtn = h(
      'button',
      {
        class: `commit-btn${protectedNow ? ' caution' : ''}`,
        type: 'button',
        'data-tooltip': commitBtnTooltip,
        'aria-label': commitBtnLabel,
      },
      icon(ICON_COMMIT, 'icon'),
      h('span', {}, commitBtnLabel),
    );

    const scmBtn = h(
      'button',
      {
        class: 'commit-scm-btn',
        type: 'button',
        'data-tooltip': s.openScmTooltip,
        'data-tooltip-pos': 'left',
        'aria-label': s.openScmTooltip,
      },
      icon(ICON_SCM, 'icon'),
    );

    const doCommit = () => {
      const msg = commitInput.value.trim();
      if (!msg) {
        commitInput.focus();
        return;
      }
      card.hide();
      vscode.postMessage({ type: 'quickCommit', message: msg });
      commitInput.value = '';
    };

    commitBtn.addEventListener('click', doCommit);
    commitInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doCommit();
      }
    });

    scmBtn.addEventListener('click', () => {
      card.hide();
      vscode.postMessage({ type: 'openScm' });
    });

    sections.push(h('div', { class: `commit-bar${protectedNow ? ' caution' : ''}` }, commitInput, commitBtn, scmBtn));
  }

  headerEl.replaceChildren(...sections);
}

function folderBasename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function renderWorktrees(repo: RepoState): void {
  if (!worktreesEl) return;
  const s = strings();
  const secondary = repo.worktrees.filter((w) => !w.isCurrent);
  const addBtn = h(
    'button',
    {
      class: 'wt-add-btn',
      type: 'button',
      'data-tooltip': s.addWorktreeTooltip,
      'data-tooltip-pos': 'left',
      'aria-label': s.addWorktreeBtn,
    },
    icon(ICON_PLUS, 'icon'),
    h('span', {}, s.addWorktreeBtn),
  );
  addBtn.addEventListener('click', () => {
    card.hide();
    vscode.postMessage({ type: 'createWorktree' });
  });

  const top = h(
    'div',
    { class: 'wt-header' },
    h('span', { class: 'wt-title' }, s.worktreesTitle(repo.worktrees.length || 1)),
    addBtn,
  );

  if (secondary.length === 0) {
    worktreesEl.replaceChildren(top);
    return;
  }

  const list = h('div', { class: 'wt-list' });
  for (const wt of secondary) {
    const label = wt.branch ?? `HEAD (${wt.head})`;
    const folder = folderBasename(wt.path);
    const openBtn = makeRowAction(ICON_WINDOW, s.openWorktreeTooltip(folder), () =>
      vscode.postMessage({ type: 'openWorktree', path: wt.path }),
    );
    const itemActions = h('span', { class: 'wt-item-actions' }, openBtn);
    if (!wt.isMain) {
      itemActions.append(
        makeRowAction(
          ICON_TRASH,
          s.removeWorktreeTooltip(folder),
          () => vscode.postMessage({ type: 'removeWorktree', path: wt.path }),
          true,
        ),
      );
    }
    list.append(
      h(
        'div',
        { class: 'wt-item', title: wt.path },
        icon(ICON_WINDOW, 'icon wt-icon'),
        h(
          'div',
          { class: 'wt-info' },
          h('span', { class: 'wt-branch' }, label),
          h('span', { class: 'wt-folder' }, folder),
        ),
        itemActions,
      ),
    );
  }
  worktreesEl.replaceChildren(top, list);
}

function renderChips(counts: Record<FilterId, number>): void {
  if (!chipsEl) return;
  const s = strings();
  const filters: Array<{ id: FilterId; label: string }> = [
    { id: 'all', label: s.filterAll },
    { id: 'local', label: s.filterLocal },
    { id: 'remote', label: s.filterRemote },
    { id: 'merged', label: s.filterMerged },
    { id: 'stale', label: s.filterStale },
  ];
  chipsEl.replaceChildren(
    ...filters.map((f) => {
      const active = f.id === ui.filter;
      const chip = h(
        'button',
        { class: `chip${active ? ' active' : ''}`, role: 'tab', 'aria-selected': String(active), type: 'button' },
        f.label,
        h('span', { class: 'count' }, String(counts[f.id])),
      );
      chip.addEventListener('click', () => {
        ui.filter = f.id;
        ui.selectedRef = undefined;
        persist();
        renderAll(true);
      });
      return chip;
    }),
  );
}

function hasPendingActivity(r: RepoOverview): boolean {
  return r.dirty || r.unmergedLocalBranches > 0 || r.worktreesCount > 1;
}

function renderRepos(repositories: RepoOverview[]): void {
  if (!reposEl) return;
  const s = strings();
  if (repositories.length <= 1) {
    reposEl.hidden = true;
    reposEl.replaceChildren();
    return;
  }

  reposEl.hidden = false;
  const activeCount = repositories.filter(hasPendingActivity).length;
  const visibleRepos = ui.onlyActiveRepos
    ? repositories.filter((r) => r.isActive || hasPendingActivity(r))
    : repositories;

  const filterToggle = h(
    'button',
    {
      class: `repos-filter-btn${ui.onlyActiveRepos ? ' active' : ''}`,
      type: 'button',
      'data-tooltip': s.filterActiveReposTooltip,
      'aria-label': s.filterActiveRepos(activeCount, repositories.length, ui.onlyActiveRepos),
    },
    s.filterActiveRepos(activeCount, repositories.length, ui.onlyActiveRepos),
  );
  filterToggle.addEventListener('click', () => {
    ui.onlyActiveRepos = !ui.onlyActiveRepos;
    persist();
    renderRepos(repositories);
  });

  const top = h(
    'div',
    { class: 'repos-header' },
    h('span', { class: 'repos-title' }, s.radarTitle(repositories.length)),
    filterToggle,
  );

  const loc = currentLocale();
  const list = h(
    'div',
    {
      class: 'repos-list',
      role: 'tablist',
      'aria-label': loc === 'en' ? 'Select repository' : 'Seleccionar repositorio',
    },
  );
  for (const r of visibleRepos) {
    const branchLabel = r.detached ? `HEAD@${r.shortHash ?? '—'}` : (r.branch ?? 'HEAD');
    const tooltipParts =
      loc === 'en'
        ? [
            `${r.name} (${r.root})`,
            `Active branch: ${branchLabel}`,
            `${r.localBranches} local branches · ${r.unmergedLocalBranches} unmerged · ${r.staleLocalBranches} stale`,
            r.dirty ? `${r.changesCount} pending changes` : 'Clean working tree',
          ]
        : [
            `${r.name} (${r.root})`,
            `Rama activa: ${branchLabel}`,
            `${r.localBranches} ramas locales · ${r.unmergedLocalBranches} sin fusionar · ${r.staleLocalBranches} antiguas`,
            r.dirty ? `${r.changesCount} cambios pendientes` : 'Árbol limpio',
          ];
    const pill = h(
      'button',
      {
        class: `repo-pill${r.isActive ? ' active' : ''}${r.dirty ? ' dirty' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': String(r.isActive),
        title: tooltipParts.join('\n'),
      },
      h('span', { class: 'repo-pill-name' }, r.name),
      h('span', { class: 'repo-pill-branch' }, `${branchLabel}${r.dirty ? '*' : ''}`),
    );
    if (r.unmergedLocalBranches > 0) {
      pill.append(
        h(
          'span',
          {
            class: 'repo-pill-stat',
            title: loc === 'en' ? 'Unmerged local branches' : 'Ramas locales sin fusionar',
          },
          `${r.unmergedLocalBranches}↗`,
        ),
      );
    }
    pill.addEventListener('click', () => {
      if (!r.isActive) {
        card.hide();
        vscode.postMessage({ type: 'selectRepo', root: r.root });
      }
    });

    const openWindowBtn = h(
      'button',
      {
        class: 'repo-open-btn',
        type: 'button',
        'data-tooltip': s.openRepoInWindowTooltip(r.name),
        'data-tooltip-pos': 'left',
        'aria-label': s.openRepoInWindowTooltip(r.name),
      },
      icon(ICON_WINDOW, 'icon'),
    );
    openWindowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      card.hide();
      vscode.postMessage({ type: 'openRepoInWindow', root: r.root });
    });

    list.append(h('div', { class: 'repo-card' }, pill, openWindowBtn));
  }
  reposEl.replaceChildren(top, list);
}

function renderFooter(repo: RepoState): void {
  if (!footerEl) return;
  const s = strings();
  const parts: string[] = [];
  if (repo.fetchedAt) parts.push(s.footerRemotesUpdated(relativeTime(repo.fetchedAt / 1000, Date.now(), currentLocale())));
  else parts.push(s.footerNoFetch);
  if (!repo.baseBranch) parts.push(s.footerNoBase);
  footerEl.textContent = parts.join(' ');
}

function currentRepo():
  | { repo: RepoState; repositories: RepoOverview[]; staleDays: number; protectedBranches: string[] }
  | undefined {
  return ui.panel.kind === 'repo'
    ? {
        repo: ui.panel.repo,
        repositories: ui.panel.repositories,
        staleDays: ui.panel.staleDays,
        protectedBranches: ui.panel.protection.protectedBranches,
      }
    : undefined;
}

function renderList(resetScroll: boolean): void {
  const ctx = currentRepo();
  if (!ctx || !listEl || !summaryEl) return;
  const s = strings();
  const now = Date.now();
  ui.visible = sortBranches(
    filterBranches(ctx.repo.branches, { filter: ui.filter, query: ui.query, nowMs: now, staleDays: ctx.staleDays }),
    ctx.repo.baseBranch,
  );
  if (ui.selectedRef && !ui.visible.some((b) => b.fullRef === ui.selectedRef)) ui.selectedRef = undefined;
  if (resetScroll) listEl.scrollTop = 0;

  const total = ctx.repo.branches.length;
  summaryEl.textContent = s.branchesCount(ui.visible.length, total);
  renderRows();
}

function renderRows(): void {
  const ctx = currentRepo();
  if (!ctx || !listEl || !rowsEl || !spacerEl) return;
  const s = strings();
  const now = Date.now();

  if (ui.visible.length === 0) {
    spacerEl.style.height = '0px';
    rowsEl.replaceChildren(
      h('div', { class: 'no-results' }, ctx.repo.branches.length === 0 ? s.noBranchesInRepo : s.noMatchingBranches),
    );
    rowsEl.style.transform = 'none';
    listEl.removeAttribute('aria-activedescendant');
    return;
  }

  const win = computeWindow(listEl.scrollTop, listEl.clientHeight, ui.visible.length, ROW_HEIGHT);
  spacerEl.style.height = `${win.totalHeight}px`;
  rowsEl.style.transform = `translateY(${win.offsetTop}px)`;

  const fragment = document.createDocumentFragment();
  let activeId: string | undefined;
  for (let i = win.start; i < win.end; i++) {
    const branch = ui.visible[i];
    if (!branch) continue;
    const selected = branch.fullRef === ui.selectedRef;
    const id = `opt-${i}`;
    if (selected) activeId = id;
    fragment.append(renderRow(branch, i, selected, id, ctx.repo, ctx.protectedBranches, now));
  }
  rowsEl.replaceChildren(fragment);
  if (activeId) listEl.setAttribute('aria-activedescendant', activeId);
  else listEl.removeAttribute('aria-activedescendant');
}

function makeRowAction(svg: string, title: string, onClick: () => void, danger = false): HTMLButtonElement {
  const btn = h('button', {
    class: `row-action${danger ? ' danger' : ''}`,
    type: 'button',
    'data-tooltip': title,
    'data-tooltip-pos': 'left',
    'aria-label': title,
    tabindex: '-1',
  });
  btn.append(icon(svg, 'icon'));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    card.hide();
    onClick();
  });
  return btn;
}

function renderRow(
  branch: BranchInfo,
  index: number,
  selected: boolean,
  id: string,
  repo: RepoState,
  protectedBranches: string[],
  now: number,
): HTMLElement {
  const { baseBranch } = repo;
  const s = strings();
  const linkedWorktree =
    branch.kind === 'local' ? repo.worktrees.find((w) => !w.isCurrent && w.branch === branch.name) : undefined;

  const tags = h('span', { class: 'tags' });
  if (branch.kind === 'remote') {
    tags.append(h('span', { class: 'tag remote' }, s.badgeRemote));
  }
  if (branch.isCurrent) {
    tags.append(h('span', { class: 'tag current-tag' }, s.badgeCurrent));
  }
  if (linkedWorktree) {
    tags.append(
      h(
        'span',
        {
          class: 'tag worktree-tag',
          'data-tooltip': `Worktree: ${folderBasename(linkedWorktree.path)}`,
        },
        s.badgeWorktree,
      ),
    );
  }
  if (branch.kind === 'local' && branch.name === baseBranch && !branch.isCurrent) {
    tags.append(h('span', { class: 'tag base' }, s.badgeBase));
  }
  if (branch.merged) {
    tags.append(h('span', { class: 'tag merged' }, s.badgeMerged));
  }
  if (branch.kind === 'local' && isListedProtected(branch.name, protectedBranches)) {
    tags.append(h('span', { class: 'tag protected' }, s.badgeProtected));
  }

  const right = h('span', { class: 'track' });
  const aheadCount = branch.ahead ?? 0;
  const behindCount = branch.behind ?? 0;
  if (aheadCount > 0) {
    right.append(h('span', { class: 'ahead' }, `↑${aheadCount}`));
  }
  if (behindCount > 0) {
    right.append(h('span', { class: 'behind' }, `↓${behindCount}`));
  }

  const actions = h('span', { class: 'row-actions' });
  if (linkedWorktree) {
    actions.append(
      makeRowAction(ICON_WINDOW, s.openWorktreeTooltip(folderBasename(linkedWorktree.path)), () =>
        vscode.postMessage({ type: 'openWorktree', path: linkedWorktree.path }),
      ),
    );
  } else if (!branch.isCurrent) {
    actions.append(
      makeRowAction(ICON_SWITCH, s.checkoutActionTooltip(branch.name), () =>
        vscode.postMessage({ type: 'checkout', ref: branch.fullRef }),
      ),
    );
    if (branch.kind === 'local') {
      actions.append(
        makeRowAction(ICON_WINDOW, s.createWorktreeActionTooltip(branch.name), () =>
          vscode.postMessage({ type: 'createWorktree', ref: branch.fullRef }),
        ),
      );
    }
  }
  actions.append(
    makeRowAction(ICON_PLUS, s.newBranchFromTooltip(branch.name), () =>
      vscode.postMessage({ type: 'createBranch', base: branch.name }),
    ),
  );
  if (branch.kind === 'local') {
    actions.append(
      makeRowAction(ICON_EDIT, s.renameBranchTooltip(branch.name), () =>
        vscode.postMessage({ type: 'renameBranch', ref: branch.fullRef }),
      ),
    );
    if (!branch.isCurrent && !linkedWorktree && branch.name !== baseBranch) {
      actions.append(
        makeRowAction(
          ICON_TRASH,
          s.deleteBranchTooltip(branch.name),
          () => vscode.postMessage({ type: 'deleteBranch', ref: branch.fullRef }),
          true,
        ),
      );
    }
  }

  const row = h(
    'div',
    {
      class: `row${selected ? ' selected' : ''}${branch.isCurrent ? ' is-current' : ''}`,
      role: 'option',
      id,
      'aria-selected': String(selected),
      'aria-setsize': String(ui.visible.length),
      'aria-posinset': String(index + 1),
      title: `${branch.name}\n${branch.lastCommit.subject}\n${branch.lastCommit.author}`,
    },
    icon(ICON_BRANCH, `icon kind-${branch.kind}`),
    h(
      'div',
      { class: 'row-main' },
      h('div', { class: 'row-title' }, h('span', { class: 'row-name', title: branch.name }, branch.name), tags),
      h('div', { class: 'row-sub' }, `${branch.lastCommit.subject || '—'} · ${relativeTime(branch.lastCommit.date, now, currentLocale())}`),
    ),
    right,
    actions,
  );
  row.style.height = `${ROW_HEIGHT}px`;
  row.addEventListener('click', () => {
    ui.selectedRef = branch.fullRef;
    listEl?.focus();
    renderRows();
    const fresh = document.getElementById(id);
    if (fresh) card.scheduleShow(branch, fresh, baseBranch, true);
  });
  row.addEventListener('dblclick', () => {
    if (linkedWorktree) {
      card.hide();
      vscode.postMessage({ type: 'openWorktree', path: linkedWorktree.path });
    } else if (!branch.isCurrent) {
      card.hide();
      vscode.postMessage({ type: 'checkout', ref: branch.fullRef });
    }
  });
  row.addEventListener('mouseenter', () => card.scheduleShow(branch, row, baseBranch));
  row.addEventListener('mouseleave', () => card.scheduleHide());
  return row;
}

function renderAll(resetScroll: boolean): void {
  const ctx = currentRepo();
  if (!ctx) {
    renderEmpty();
    return;
  }
  if (builtFor !== 'repo') {
    buildShell();
    builtFor = 'repo';
  }
  const now = Date.now();
  const protectedNow =
    !ctx.repo.head.detached && !!ctx.repo.head.branch && isListedProtected(ctx.repo.head.branch, ctx.protectedBranches);
  renderRepos(ctx.repositories);
  renderHeader(ctx.repo, protectedNow);
  renderWorktrees(ctx.repo);
  renderChips(countByFilter(ctx.repo.branches, now, ctx.staleDays));
  renderFooter(ctx.repo);
  renderList(resetScroll);
}

window.addEventListener('message', (event: MessageEvent<ToWebview>) => {
  const message = event.data;
  if (message?.type === 'commits') {
    card.setCommits(message.ref, message.commits, message.error);
    return;
  }
  if (message?.type !== 'state') return;
  ui.panel = message.state;
  const ctx = currentRepo();
  if (ctx) card.prune(ctx.repo.branches);
  else card.hide();
  card.hide();
  renderAll(false);
});

// Mantiene frescos los tiempos relativos sin pedir datos nuevos.
setInterval(() => {
  if (currentRepo() && !card.visible) renderAll(false);
}, 60_000);

vscode.postMessage({ type: 'ready' });

