import { divergenceText, integrationText } from '../../../shared/branchSummary';
import type { Locale } from '../../../shared/i18n';
import { relativeTime, shortRelativeTime } from '../../../shared/time';
import type { BranchInfo, CommitSummary } from '../../../shared/types';
import { h } from './dom';

type Tab = 'summary' | 'commits';

interface CommitsEntry {
  commits?: CommitSummary[];
  error?: string;
}

export interface HoverCardOptions {
  host: HTMLElement;
  requestCommits: (fullRef: string) => void;
  getLocale?: () => Locale;
}

const SHOW_DELAY_MS = 250;
const HIDE_DELAY_MS = 150;

/**
 * Tarjeta flotante con el detalle de una rama. Es de solo lectura: muestra datos ya
 * cargados (resumen) y pide el historial al abrir la pestaña de commits.
 */
export class HoverCard {
  private readonly el: HTMLElement;
  private branch: BranchInfo | undefined;
  private baseBranch: string | undefined;
  private tab: Tab = 'summary';
  private anchor: HTMLElement | undefined;
  private showTimer: number | undefined;
  private hideTimer: number | undefined;
  private readonly commits = new Map<string, CommitsEntry>();

  constructor(private readonly options: HoverCardOptions) {
    this.el = h('div', { class: 'hover-card', role: 'dialog', 'aria-label': 'Branch details', hidden: '' });
    this.el.addEventListener('mouseenter', () => this.cancelHide());
    this.el.addEventListener('mouseleave', () => this.scheduleHide());
    options.host.append(this.el);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
  }

  private locale(): Locale {
    return this.options.getLocale ? this.options.getLocale() : 'es';
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  /** Muestra la tarjeta tras una breve espera, para no parpadear al recorrer la lista. */
  scheduleShow(branch: BranchInfo, anchor: HTMLElement, baseBranch: string | undefined, immediate = false): void {
    this.cancelHide();
    window.clearTimeout(this.showTimer);
    const open = (): void => this.open(branch, anchor, baseBranch);
    if (immediate || this.visible) open();
    else this.showTimer = window.setTimeout(open, SHOW_DELAY_MS);
  }

  scheduleHide(): void {
    window.clearTimeout(this.showTimer);
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), HIDE_DELAY_MS);
  }

  cancelHide(): void {
    window.clearTimeout(this.hideTimer);
  }

  hide(): void {
    window.clearTimeout(this.showTimer);
    window.clearTimeout(this.hideTimer);
    this.el.hidden = true;
    this.branch = undefined;
    this.anchor = undefined;
  }

  /** Descarta la caché de commits cuya rama cambió o desapareció. */
  prune(branches: BranchInfo[]): void {
    const live = new Set(branches.map((b) => cacheKey(b)));
    for (const key of this.commits.keys()) if (!live.has(key)) this.commits.delete(key);
    if (this.branch && !live.has(cacheKey(this.branch))) this.hide();
  }

  setCommits(fullRef: string, commits: CommitSummary[], error?: string): void {
    for (const [key] of this.commits) {
      if (key.startsWith(`${fullRef}@`)) {
        const entry: CommitsEntry = { commits };
        if (error) entry.error = error;
        this.commits.set(key, entry);
      }
    }
    if (this.visible && this.branch?.fullRef === fullRef && this.tab === 'commits') this.render();
  }

  private open(branch: BranchInfo, anchor: HTMLElement, baseBranch: string | undefined): void {
    if (this.branch?.fullRef !== branch.fullRef) this.tab = 'summary';
    this.branch = branch;
    this.anchor = anchor;
    this.baseBranch = baseBranch;
    this.render();
    this.el.hidden = false;
    this.position();
  }

  private position(): void {
    if (!this.anchor) return;
    const margin = 8;
    const hostRect = this.options.host.getBoundingClientRect();
    const rect = this.anchor.getBoundingClientRect();
    const containerWidth = hostRect.width > 0 ? hostRect.width : window.innerWidth;
    const containerLeft = hostRect.left;
    const width = Math.min(320, containerWidth - margin * 2);
    this.el.style.width = `${Math.max(160, width)}px`;
    this.el.style.left = `${containerLeft + margin + Math.max(0, (containerWidth - margin * 2 - width) / 2)}px`;
    const height = this.el.offsetHeight;
    const below = rect.bottom + 4;
    const fitsBelow = below + height <= window.innerHeight - margin;
    const top = fitsBelow ? below : Math.max(margin, rect.top - height - 4);
    this.el.style.top = `${top}px`;
  }

  private selectTab(tab: Tab): void {
    if (!this.branch) return;
    this.tab = tab;
    if (tab === 'commits' && !this.commits.has(cacheKey(this.branch))) {
      this.commits.set(cacheKey(this.branch), {});
      this.options.requestCommits(this.branch.fullRef);
    }
    this.render();
    this.position();
  }

  private render(): void {
    const branch = this.branch;
    if (!branch) return;
    const now = Date.now();
    const loc = this.locale();

    const tabs = h('div', { class: 'hc-tabs', role: 'tablist' });
    for (const [id, label] of [
      ['summary', loc === 'en' ? 'Summary' : 'Resumen'],
      ['commits', 'Commits'],
    ] as const) {
      const active = this.tab === id;
      const button = h('button', { class: `hc-tab${active ? ' active' : ''}`, role: 'tab', type: 'button', 'aria-selected': String(active) }, label);
      button.addEventListener('click', () => this.selectTab(id));
      tabs.append(button);
    }

    const kindLabel = branch.kind === 'local' ? 'local' : loc === 'en' ? 'remote' : 'remota';
    const title = h(
      'div',
      { class: 'hc-title' },
      h('span', { class: `hc-dot ${branch.kind}` }),
      h('span', { class: 'hc-name', title: branch.name }, branch.name),
      h('span', { class: 'tag' }, kindLabel),
    );

    this.el.replaceChildren(title, tabs, this.tab === 'summary' ? this.summary(branch, now, loc) : this.history(branch, now, loc));
  }

  private summary(branch: BranchInfo, now: number, loc: Locale): HTMLElement {
    const c = branch.lastCommit;
    const body = h('div', { class: 'hc-body' });
    body.append(
      h('div', { class: 'hc-commit' }, h('span', { class: 'mono' }, c.hash), ` ${c.subject || '—'}`),
      h('div', { class: 'hc-meta' }, `${c.author} · ${relativeTime(c.date, now, loc)}`),
      h('div', { class: 'hc-meta' }, new Date(c.date * 1000).toLocaleString(loc === 'en' ? 'en-US' : 'es-ES')),
    );
    const upstreamLine = branch.upstream
      ? loc === 'en'
        ? `Tracks ${branch.upstream}.`
        : `Sigue a ${branch.upstream}.`
      : branch.kind === 'local'
        ? loc === 'en'
          ? 'No upstream branch.'
          : 'Sin rama remota asociada.'
        : undefined;
    const remoteLine =
      branch.kind === 'remote'
        ? loc === 'en'
          ? 'Remote ref: valid as of last fetch.'
          : 'Dato remoto: válido hasta el último fetch.'
        : undefined;
    const lines = [divergenceText(branch, this.baseBranch, loc), integrationText(branch, this.baseBranch, loc), upstreamLine, remoteLine];
    const facts = h('ul', { class: 'hc-facts' });
    for (const line of lines) if (line) facts.append(h('li', {}, line));
    body.append(facts);
    return body;
  }

  private history(branch: BranchInfo, now: number, loc: Locale): HTMLElement {
    const entry = this.commits.get(cacheKey(branch));
    const body = h('div', { class: 'hc-body' });
    if (!entry || (!entry.commits && !entry.error)) {
      body.append(h('div', { class: 'hc-meta' }, loc === 'en' ? 'Loading commits…' : 'Cargando commits…'));
    } else if (entry.error) {
      body.append(
        h('div', { class: 'hc-error' }, loc === 'en' ? `Could not read history: ${entry.error}` : `No se pudo leer el historial: ${entry.error}`),
      );
    } else if (!entry.commits?.length) {
      body.append(h('div', { class: 'hc-meta' }, loc === 'en' ? 'No commits.' : 'Sin commits.'));
    } else {
      const list = h('ul', { class: 'hc-commits' });
      for (const commit of entry.commits) {
        list.append(
          h(
            'li',
            {},
            h('span', { class: 'mono' }, commit.hash),
            h('span', { class: 'hc-subject', title: commit.subject }, commit.subject || '—'),
            h('span', { class: 'hc-when' }, shortRelativeTime(commit.date, now, loc)),
          ),
        );
      }
      body.append(list);
    }
    return body;
  }
}

function cacheKey(branch: BranchInfo): string {
  return `${branch.fullRef}@${branch.lastCommit.hash}`;
}
