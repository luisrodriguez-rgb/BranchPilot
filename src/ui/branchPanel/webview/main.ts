import { countByFilter, filterBranches, sortBranches } from '../../../shared/filter';
import type { FilterId } from '../../../shared/filter';
import type { FromWebview, PanelState, ToWebview } from '../../../shared/messages';
import { isListedProtected } from '../../../shared/protection';
import { relativeTime } from '../../../shared/time';
import type { BranchInfo, RepoState } from '../../../shared/types';
import { isDirty } from '../../../shared/types';
import { computeWindow, scrollTopToReveal } from '../../../shared/virtual';

interface VsCodeApi {
  postMessage(message: FromWebview): void;
  getState(): PersistedState | undefined;
  setState(state: PersistedState): void;
}
interface PersistedState {
  filter: FilterId;
  query: string;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const ROW_HEIGHT = 54;

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'local', label: 'Locales' },
  { id: 'remote', label: 'Remotas' },
  { id: 'merged', label: 'Fusionadas' },
  { id: 'stale', label: 'Antiguas' },
];

const ICON_BRANCH =
  '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="6" r="1.6"/><path d="M4 5.1v5.8"/><path d="M12 7.6c0 2.6-3.2 2.6-7 4.4"/></svg>';
const ICON_REFRESH =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.7-4"/><path d="M13.5 2.5v3h-3"/></svg>';

const saved = vscode.getState();
const ui = {
  filter: saved?.filter ?? ('all' as FilterId),
  query: saved?.query ?? '',
  selectedRef: undefined as string | undefined,
  panel: { kind: 'empty' } as PanelState,
  visible: [] as BranchInfo[],
};

function persist(): void {
  vscode.setState({ filter: ui.filter, query: ui.query });
}

type Child = Node | string | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) el.setAttribute(key, value);
  for (const child of children) {
    if (child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

function icon(svg: string, className: string): HTMLElement {
  const span = h('span', { class: className });
  span.innerHTML = svg; // constantes estáticas, sin datos del repositorio
  return span;
}

const app = document.getElementById('app') as HTMLElement;

// Referencias a nodos que se actualizan sin reconstruir todo (para no perder foco).
let searchInput: HTMLInputElement | undefined;
let listEl: HTMLElement | undefined;
let rowsEl: HTMLElement | undefined;
let spacerEl: HTMLElement | undefined;
let chipsEl: HTMLElement | undefined;
let summaryEl: HTMLElement | undefined;
let headerEl: HTMLElement | undefined;
let footerEl: HTMLElement | undefined;
let builtFor: 'empty' | 'repo' | undefined;

function buildShell(): void {
  app.replaceChildren();
  searchInput = h('input', {
    type: 'search',
    class: 'search',
    placeholder: 'Buscar ramas…',
    'aria-label': 'Buscar ramas',
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

  const refresh = h('button', { class: 'icon-button', title: 'Actualizar', 'aria-label': 'Actualizar ramas' });
  refresh.append(icon(ICON_REFRESH, 'icon'));
  refresh.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));

  headerEl = h('section', { class: 'current', 'aria-label': 'Rama actual' });
  chipsEl = h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Filtros de ramas' });
  summaryEl = h('div', { class: 'summary', role: 'status' });
  spacerEl = h('div', { class: 'spacer' });
  rowsEl = h('div', { class: 'rows' });
  spacerEl.append(rowsEl);
  listEl = h('div', { class: 'list', role: 'listbox', tabindex: '0', 'aria-label': 'Ramas' }, spacerEl);
  footerEl = h('footer', { class: 'footer' });

  listEl.addEventListener('scroll', () => requestAnimationFrame(() => renderRows()));
  listEl.addEventListener('keydown', onListKey);
  new ResizeObserver(() => renderRows()).observe(listEl);

  app.append(headerEl, h('div', { class: 'toolbar' }, searchInput, refresh), chipsEl, summaryEl, listEl, footerEl);
}

function onListKey(e: KeyboardEvent): void {
  const page = Math.max(1, Math.floor((listEl?.clientHeight ?? ROW_HEIGHT) / ROW_HEIGHT) - 1);
  const index = selectedIndex();
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
}

function renderEmpty(): void {
  builtFor = 'empty';
  app.replaceChildren(
    h(
      'div',
      { class: 'empty' },
      h('h2', {}, 'Sin repositorio Git'),
      h('p', {}, 'Abre una carpeta que contenga un repositorio Git para ver sus ramas.'),
    ),
  );
}

function renderHeader(repo: RepoState, protectedNow: boolean): void {
  if (!headerEl) return;
  const { head, workingTree: wt } = repo;
  const current = repo.branches.find((b) => b.isCurrent);
  const name = head.detached ? `HEAD en ${head.shortHash ?? '—'}` : (head.branch ?? 'HEAD');

  const badges = h('div', { class: 'badges' });
  if (head.detached) badges.append(h('span', { class: 'badge warn' }, 'Desacoplado'));
  if (protectedNow) badges.append(h('span', { class: 'badge warn' }, 'Protegida'));
  if (wt.operation) badges.append(h('span', { class: 'badge warn' }, `Operación: ${wt.operation}`));
  badges.append(
    isDirty(wt)
      ? h('span', { class: 'badge changes' }, `${wt.staged + wt.unstaged + wt.untracked + wt.conflicted} cambios`)
      : h('span', { class: 'badge ok' }, 'Limpia'),
  );
  if (wt.conflicted > 0) badges.append(h('span', { class: 'badge danger' }, `${wt.conflicted} en conflicto`));

  const meta: Child[] = [];
  if (current) {
    meta.push(
      h('span', { class: 'mono' }, current.lastCommit.hash),
      ` ${current.lastCommit.subject} · ${relativeTime(current.lastCommit.date, Date.now())}`,
    );
  } else if (!head.detached) {
    meta.push('Aún sin commits');
  }

  const base: Child[] = [];
  if (repo.baseBranch && current && current.name !== repo.baseBranch && current.ahead !== undefined) {
    base.push(
      `Frente a ${repo.baseBranch}: `,
      h('span', { class: 'ahead' }, `↑${current.ahead}`),
      ' ',
      h('span', { class: 'behind' }, `↓${current.behind ?? 0}`),
    );
  }

  headerEl.className = `current${protectedNow || head.detached ? ' alert' : ''}`;
  const sections: Node[] = [
    h('div', { class: 'current-top' }, h('span', { class: 'eyebrow' }, 'Rama actual'), h('span', { class: 'repo-name' }, repo.name)),
    h('div', { class: 'current-name' }, icon(ICON_BRANCH, 'icon'), h('span', { class: 'name-text', title: name }, name)),
    badges,
  ];
  if (meta.length > 0) sections.push(h('div', { class: 'meta' }, ...meta));
  if (base.length > 0) sections.push(h('div', { class: 'meta' }, ...base));
  headerEl.replaceChildren(...sections);
}

function renderChips(counts: Record<FilterId, number>): void {
  if (!chipsEl) return;
  chipsEl.replaceChildren(
    ...FILTERS.map((f) => {
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

function renderFooter(repo: RepoState): void {
  if (!footerEl) return;
  const parts: string[] = [];
  if (repo.fetchedAt) parts.push(`Remotas actualizadas ${relativeTime(repo.fetchedAt / 1000, Date.now())} (último fetch).`);
  else parts.push('Sin fetch registrado: las ramas remotas pueden estar desactualizadas.');
  if (!repo.baseBranch) parts.push('No se detectó rama base; no se muestran ahead/behind.');
  footerEl.textContent = parts.join(' ');
}

function currentRepo(): { repo: RepoState; staleDays: number; protectedBranches: string[] } | undefined {
  return ui.panel.kind === 'repo'
    ? { repo: ui.panel.repo, staleDays: ui.panel.staleDays, protectedBranches: ui.panel.protection.protectedBranches }
    : undefined;
}

function renderList(resetScroll: boolean): void {
  const ctx = currentRepo();
  if (!ctx || !listEl || !summaryEl) return;
  const now = Date.now();
  ui.visible = sortBranches(
    filterBranches(ctx.repo.branches, { filter: ui.filter, query: ui.query, nowMs: now, staleDays: ctx.staleDays }),
    ctx.repo.baseBranch,
  );
  if (ui.selectedRef && !ui.visible.some((b) => b.fullRef === ui.selectedRef)) ui.selectedRef = undefined;
  if (resetScroll) listEl.scrollTop = 0;

  const total = ctx.repo.branches.length;
  summaryEl.textContent =
    ui.visible.length === total ? `${total} ramas` : `${ui.visible.length} de ${total} ramas`;
  renderRows();
}

function renderRows(): void {
  const ctx = currentRepo();
  if (!ctx || !listEl || !rowsEl || !spacerEl) return;
  const now = Date.now();

  if (ui.visible.length === 0) {
    spacerEl.style.height = '0px';
    rowsEl.replaceChildren(
      h('div', { class: 'no-results' }, ctx.repo.branches.length === 0 ? 'Este repositorio aún no tiene ramas.' : 'Ninguna rama coincide con el filtro.'),
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
    fragment.append(renderRow(branch, i, selected, id, ctx.repo.baseBranch, ctx.protectedBranches, now));
  }
  rowsEl.replaceChildren(fragment);
  if (activeId) listEl.setAttribute('aria-activedescendant', activeId);
  else listEl.removeAttribute('aria-activedescendant');
}

function renderRow(
  branch: BranchInfo,
  index: number,
  selected: boolean,
  id: string,
  baseBranch: string | undefined,
  protectedBranches: string[],
  now: number,
): HTMLElement {
  const tags = h('span', { class: 'tags' });
  tags.append(h('span', { class: `tag ${branch.kind}` }, branch.kind === 'local' ? 'local' : 'remota'));
  if (branch.isCurrent) tags.append(h('span', { class: 'tag current-tag' }, 'actual'));
  if (branch.kind === 'local' && branch.name === baseBranch) tags.append(h('span', { class: 'tag base' }, 'base'));
  if (branch.merged) tags.append(h('span', { class: 'tag merged' }, 'fusionada'));
  if (branch.kind === 'local' && isListedProtected(branch.name, protectedBranches)) {
    tags.append(h('span', { class: 'tag protected' }, 'protegida'));
  }

  const right = h('span', { class: 'track' });
  if (branch.ahead !== undefined && (branch.ahead > 0 || (branch.behind ?? 0) > 0)) {
    right.append(h('span', { class: 'ahead' }, `↑${branch.ahead}`), h('span', { class: 'behind' }, `↓${branch.behind ?? 0}`));
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
      h('div', { class: 'row-title' }, h('span', { class: 'row-name' }, branch.name), tags),
      h('div', { class: 'row-sub' }, `${branch.lastCommit.subject || '—'} · ${relativeTime(branch.lastCommit.date, now)}`),
    ),
    right,
  );
  row.style.height = `${ROW_HEIGHT}px`;
  row.addEventListener('click', () => {
    ui.selectedRef = branch.fullRef;
    listEl?.focus();
    renderRows();
  });
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
  renderHeader(ctx.repo, protectedNow);
  renderChips(countByFilter(ctx.repo.branches, now, ctx.staleDays));
  renderFooter(ctx.repo);
  renderList(resetScroll);
}

window.addEventListener('message', (event: MessageEvent<ToWebview>) => {
  const message = event.data;
  if (message?.type !== 'state') return;
  ui.panel = message.state;
  renderAll(false);
});

// Mantiene frescos los tiempos relativos sin pedir datos nuevos.
setInterval(() => {
  if (currentRepo()) renderAll(false);
}, 60_000);

vscode.postMessage({ type: 'ready' });
