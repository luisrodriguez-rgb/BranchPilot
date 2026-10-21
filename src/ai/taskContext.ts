import { validateBranchName } from '../guards/branchGuards';
import type { ProtectionConfig } from '../shared/protection';
import { isListedProtected, requiresConfirmation } from '../shared/protection';
import type { HeadInfo, WorkingTreeStatus } from '../shared/types';
import { isDirty } from '../shared/types';

export type TaskBranchPrefix = 'feat' | 'fix' | 'chore' | 'refactor' | 'docs' | 'test';

const STOP_WORDS = new Set([
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'de',
  'del',
  'al',
  'a',
  'en',
  'con',
  'por',
  'para',
  'sin',
  'sobre',
  'y',
  'o',
  'que',
  'se',
  'su',
  'sus',
  'the',
  'an',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'from',
  'by',
  'and',
  'or',
]);

const FIX_KEYWORDS = /\b(fix|bug|error|fallo|corrige|corregir|arregla|arreglar|crash|hotfix|issue)\b/i;
const REFACTOR_KEYWORDS = /\b(refactor|refactorizar|limpiar|simplificar|extraer|reorganizar)\b/i;
const DOCS_KEYWORDS = /\b(doc|docs|readme|documentar|documentacion|documentación)\b/i;
const TEST_KEYWORDS = /\b(test|tests|prueba|pruebas|vitest|cobertura)\b/i;
const CHORE_KEYWORDS = /\b(chore|deps|dependencias|ci|build|config|lint|release)\b/i;

/** Detecta el prefijo convencional más adecuado según la descripción de la tarea. */
export function inferTaskPrefix(description: string): TaskBranchPrefix {
  if (FIX_KEYWORDS.test(description)) return 'fix';
  if (REFACTOR_KEYWORDS.test(description)) return 'refactor';
  if (DOCS_KEYWORDS.test(description)) return 'docs';
  if (TEST_KEYWORDS.test(description)) return 'test';
  if (CHORE_KEYWORDS.test(description)) return 'chore';
  return 'feat';
}

/** Convierte una descripción libre en un slug limpio apto para nombres de rama Git. */
export function slugifyTask(description: string, maxLength = 50): string {
  const normalized = description
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^(feat|fix|chore|refactor|docs|test)\s*[:/ -]\s*/i, '');

  const tokens = normalized
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));

  const rawSlug = (tokens.length > 0 ? tokens : normalized.split(/[^a-z0-9]+/).filter(Boolean)).join('-');
  const trimmed = rawSlug.slice(0, maxLength).replace(/-+$/g, '').replace(/^-+/g, '');
  return trimmed || 'tarea';
}

/**
 * Sugiere un nombre de rama válido y único a partir de la descripción de una tarea
 * (p. ej. `"Corregir validación de email en login"` → `"fix/corregir-validacion-email-login"`).
 */
export function suggestTaskBranchName(
  description: string,
  existingBranches: Iterable<string> = [],
  explicitPrefix?: TaskBranchPrefix,
): string {
  const prefix = explicitPrefix ?? inferTaskPrefix(description);
  const slug = slugifyTask(description);
  const baseCandidate = `${prefix}/${slug}`;
  const candidate = validateBranchName(baseCandidate) ? `${prefix}/tarea` : baseCandidate;

  const taken = new Set(existingBranches);
  if (!taken.has(candidate)) return candidate;

  let suffix = 2;
  while (taken.has(`${candidate}-${suffix}`)) suffix++;
  return `${candidate}-${suffix}`;
}

export interface AgentPrecheckInput {
  head: HeadInfo;
  workingTree: WorkingTreeStatus;
  protection: ProtectionConfig;
  baseBranch?: string;
}

export type AgentPrecheckStatus = 'blocked' | 'warn-protected' | 'warn-detached' | 'ready';

export interface AgentPrecheckResult {
  status: AgentPrecheckStatus;
  branchLabel: string;
  headline: string;
  details: string[];
  /** Si se recomienda ofrecer crear una rama de tarea dedicada antes de delegar al agente. */
  suggestNewTaskBranch: boolean;
}

/**
 * Evalúa el estado actual del repositorio antes de delegar una tarea a un agente de IA
 * (Cline, Claude Code, Copilot, Antigravity, Cursor).
 */
export function evaluateAgentPrecheck(input: AgentPrecheckInput): AgentPrecheckResult {
  const { head, workingTree: wt, protection, baseBranch } = input;
  const branchLabel = head.detached ? `HEAD (${head.shortHash ?? 'desacoplado'})` : (head.branch ?? 'HEAD');
  const details: string[] = [];

  if (wt.operation) {
    return {
      status: 'blocked',
      branchLabel,
      headline: `Operación Git en curso (${wt.operation}). No delegues tareas al agente hasta finalizarla o abortarla.`,
      details: ['Los cambios del agente durante una fusión o rebase activo pueden corromper el estado del árbol.'],
      suggestNewTaskBranch: false,
    };
  }

  if (wt.conflicted > 0) {
    return {
      status: 'blocked',
      branchLabel,
      headline: `Hay ${wt.conflicted} ${wt.conflicted === 1 ? 'archivo en conflicto' : 'archivos en conflicto'}.`,
      details: ['Resuelve los conflictos pendientes antes de iniciar una tarea con el agente.'],
      suggestNewTaskBranch: false,
    };
  }

  if (isDirty(wt)) {
    const count = wt.staged + wt.unstaged + wt.untracked;
    details.push(`Tienes ${count} ${count === 1 ? 'cambio sin guardar' : 'cambios sin guardar'} que se mezclarán con los del agente.`);
  } else {
    details.push('Árbol de trabajo limpio.');
  }

  if (head.detached || !head.branch) {
    return {
      status: 'warn-detached',
      branchLabel,
      headline: `Estás en HEAD desacoplado (${head.shortHash ?? 'sin rama'}).`,
      details: ['Los commits que cree el agente no pertenecerán a ninguna rama. Crea una rama para esta tarea primero.', ...details],
      suggestNewTaskBranch: true,
    };
  }

  const listedProtected = isListedProtected(head.branch, protection.protectedBranches);
  const needsConfirm = requiresConfirmation(head.branch, protection);

  if (listedProtected || (baseBranch && head.branch === baseBranch)) {
    return {
      status: 'warn-protected',
      branchLabel: head.branch,
      headline: `Estás en la rama protegida «${head.branch}».`,
      details: [
        `Se recomienda crear una rama dedicada antes de pedirle cambios al agente para no modificar «${head.branch}» directamente.`,
        ...details,
      ],
      suggestNewTaskBranch: true,
    };
  }

  if (needsConfirm) {
    details.push(`Modo de protección activo (${protection.mode}): confirma que deseas que el agente trabaje en «${head.branch}».`);
  }

  return {
    status: 'ready',
    branchLabel: head.branch,
    headline: `Rama activa para el agente: «${head.branch}».`,
    details,
    suggestNewTaskBranch: false,
  };
}

export const AGENT_RULE_BEGIN = '<!-- branchpilot:start -->';
export const AGENT_RULE_END = '<!-- branchpilot:end -->';

/**
 * Genera el bloque de instrucciones Markdown para `AGENTS.md` (o `.cursorrules` / `.clinerules`)
 * indicando a los agentes de IA cómo verificar la rama antes de modificar código.
 */
export function buildAgentRuleSnippet(protectedBranches: string[]): string {
  const list = protectedBranches.length > 0 ? protectedBranches.map((b) => `\`${b}\``).join(', ') : '`main`, `master`';
  return [
    AGENT_RULE_BEGIN,
    '## Control de Ramas con BranchPilot (Regla para Agentes de IA)',
    '',
    'Antes de crear, modificar o eliminar archivos de código en este repositorio:',
    '1. Verifica la rama activa con `git branch --show-current` y el estado con `git status --short`.',
    `2. Si la rama activa es una rama base o protegida (${list}) o \`HEAD\` está desacoplado, **detente y pregunta al usuario** si desea crear una rama dedicada para la tarea (p. ej. \`git checkout -b feat/<tarea>\` o ejecutando el comando **BranchPilot: Crear rama para esta tarea…** en el IDE).`,
    '3. Si existen cambios sin guardar de otra tarea o una operación en curso (`merge`, `rebase`, `cherry-pick`), advierte al usuario antes de sobrescribir archivos.',
    '4. Nunca ejecutes `git reset --hard`, `git push --force` ni elimines ramas sin confirmación explícita del usuario.',
    AGENT_RULE_END,
  ].join('\n');
}

/**
 * Inserta o actualiza de forma idempotente el bloque de reglas de BranchPilot
 * dentro del contenido de un archivo `AGENTS.md`.
 */
export function upsertAgentRuleInContent(existingContent: string | undefined, protectedBranches: string[]): string {
  const snippet = buildAgentRuleSnippet(protectedBranches);
  if (!existingContent || !existingContent.trim()) {
    return `# Instrucciones para Agentes de IA\n\n${snippet}\n`;
  }
  const startIdx = existingContent.indexOf(AGENT_RULE_BEGIN);
  const endIdx = existingContent.indexOf(AGENT_RULE_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existingContent.slice(0, startIdx).trimEnd();
    const after = existingContent.slice(endIdx + AGENT_RULE_END.length).trimStart();
    const parts = [before, snippet, after].filter((p) => p.length > 0);
    return `${parts.join('\n\n')}\n`;
  }
  return `${existingContent.trimEnd()}\n\n${snippet}\n`;
}
