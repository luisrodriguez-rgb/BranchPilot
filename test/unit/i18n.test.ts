import { describe, expect, it } from 'vitest';
import { getUiStrings, resolveLocale } from '../../src/shared/i18n';

describe('i18n (es / en)', () => {
  it('resolves English and Spanish locales accurately', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('es')).toBe('es');
    expect(resolveLocale('es-CO')).toBe('es');
    expect(resolveLocale(undefined)).toBe('es');
  });

  it('returns localized UI strings for both English and Spanish', () => {
    const es = getUiStrings('es-ES');
    const en = getUiStrings('en-US');

    expect(es.currentBranchEyebrow).toBe('Rama actual');
    expect(en.currentBranchEyebrow).toBe('Current branch');
    expect(es.changesBadge(1)).toBe('1 cambio');
    expect(es.changesBadge(3)).toBe('3 cambios');
    expect(en.changesBadge(1)).toBe('1 change');
    expect(en.changesBadge(3)).toBe('3 changes');
    expect(es.branchesCount(5, 10)).toBe('5 de 10 ramas');
    expect(en.branchesCount(5, 10)).toBe('5 of 10 branches');
    expect(es.badgeProtected).toBe('protegida');
    expect(en.badgeProtected).toBe('protected');
    expect(es.badgeCurrent).toBe('actual');
    expect(en.badgeCurrent).toBe('current');
    expect(es.quickCommitBtn).toBe('Commit');
    expect(en.quickCommitBtn).toBe('Commit');
    expect(es.quickCommitProtectedBtn('main')).toBe('Commit en main');
    expect(en.quickCommitProtectedBtn('main')).toBe('Commit to main');
    expect(es.noBranchesInRepo).toBe('Este repositorio aún no tiene ramas.');
    expect(en.noBranchesInRepo).toBe('This repository has no branches yet.');
  });
});
