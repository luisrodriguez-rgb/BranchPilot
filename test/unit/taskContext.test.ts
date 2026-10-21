import { describe, expect, it } from 'vitest';
import {
  AGENT_RULE_BEGIN,
  AGENT_RULE_END,
  buildAgentRuleSnippet,
  evaluateAgentPrecheck,
  inferTaskPrefix,
  slugifyTask,
  suggestTaskBranchName,
  upsertAgentRuleInContent,
} from '../../src/ai/taskContext';
import type { WorkingTreeStatus } from '../../src/shared/types';

const CLEAN_WT: WorkingTreeStatus = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 };

describe('inferTaskPrefix y suggestTaskBranchName', () => {
  it('detecta prefijos convencionales según palabras clave en español e inglés', () => {
    expect(inferTaskPrefix('Corregir validación de email en registro')).toBe('fix');
    expect(inferTaskPrefix('Fix crash when opening empty repo')).toBe('fix');
    expect(inferTaskPrefix('Refactorizar servicio de autenticación')).toBe('refactor');
    expect(inferTaskPrefix('Actualizar documentación del README')).toBe('docs');
    expect(inferTaskPrefix('Agregar pruebas unitarias de guards')).toBe('test');
    expect(inferTaskPrefix('Actualizar dependencias de CI')).toBe('chore');
    expect(inferTaskPrefix('Agregar selector de ramas para agentes')).toBe('feat');
  });

  it('limpia acentos, símbolos y palabras vacías al generar el slug', () => {
    expect(slugifyTask('Corregir la validación de correo electrónico en el login!')).toBe(
      'corregir-validacion-correo-electronico-login',
    );
    expect(slugifyTask('   ')).toBe('tarea');
  });

  it('genera nombres de rama únicos evitando colisiones con ramas existentes', () => {
    const existing = ['fix/corregir-bug-login', 'fix/corregir-bug-login-2'];
    expect(suggestTaskBranchName('Corregir bug en login', existing)).toBe('fix/corregir-bug-login-3');
    expect(suggestTaskBranchName('Nueva pantalla de perfil', [], 'feat')).toBe('feat/nueva-pantalla-perfil');
  });
});

describe('evaluateAgentPrecheck', () => {
  it('bloquea cuando hay una operación Git en curso o archivos en conflicto', () => {
    const mergeRes = evaluateAgentPrecheck({
      head: { branch: 'feat/a', detached: false },
      workingTree: { ...CLEAN_WT, operation: 'rebase' },
      protection: { mode: 'all', protectedBranches: ['main'] },
      baseBranch: 'main',
    });
    expect(mergeRes.status).toBe('blocked');

    const conflictRes = evaluateAgentPrecheck({
      head: { branch: 'feat/a', detached: false },
      workingTree: { ...CLEAN_WT, conflicted: 1 },
      protection: { mode: 'all', protectedBranches: ['main'] },
    });
    expect(conflictRes.status).toBe('blocked');
  });

  it('advierte y sugiere crear rama de tarea cuando se está en HEAD desacoplado o rama protegida', () => {
    const detachedRes = evaluateAgentPrecheck({
      head: { detached: true, shortHash: 'abc1234' },
      workingTree: CLEAN_WT,
      protection: { mode: 'list', protectedBranches: ['main'] },
    });
    expect(detachedRes.status).toBe('warn-detached');
    expect(detachedRes.suggestNewTaskBranch).toBe(true);

    const protectedRes = evaluateAgentPrecheck({
      head: { branch: 'main', detached: false },
      workingTree: CLEAN_WT,
      protection: { mode: 'list', protectedBranches: ['main'] },
      baseBranch: 'main',
    });
    expect(protectedRes.status).toBe('warn-protected');
    expect(protectedRes.suggestNewTaskBranch).toBe(true);
  });

  it('marca ready en una rama de trabajo normal e informa si hay cambios sin guardar', () => {
    const readyRes = evaluateAgentPrecheck({
      head: { branch: 'feat/panel', detached: false },
      workingTree: { staged: 1, unstaged: 1, untracked: 0, conflicted: 0 },
      protection: { mode: 'list', protectedBranches: ['main'] },
      baseBranch: 'main',
    });
    expect(readyRes.status).toBe('ready');
    expect(readyRes.suggestNewTaskBranch).toBe(false);
    expect(readyRes.details.some((d) => d.includes('2 cambios sin guardar'))).toBe(true);
  });
});

describe('upsertAgentRuleInContent', () => {
  it('crea documento nuevo cuando no existe contenido previo y reemplaza de forma idempotente', () => {
    const created = upsertAgentRuleInContent(undefined, ['main', 'develop']);
    expect(created).toContain(AGENT_RULE_BEGIN);
    expect(created).toContain('`main`, `develop`');
    expect(created).toContain(AGENT_RULE_END);

    const withSurrounding = `# Proyecto X\n\nTexto inicial.\n\n${buildAgentRuleSnippet(['main'])}\n\n## Otra sección\n`;
    const updated = upsertAgentRuleInContent(withSurrounding, ['main', 'release/*']);
    expect(updated).toContain('# Proyecto X');
    expect(updated).toContain('## Otra sección');
    expect(updated).toContain('`main`, `release/*`');
    expect(updated.split(AGENT_RULE_BEGIN).length - 1).toBe(1);
  });
});
