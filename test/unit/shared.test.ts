import { describe, expect, it } from 'vitest';
import { computeWindow, scrollTopToReveal } from '../../src/shared/virtual';
import { relativeTime } from '../../src/shared/time';
import { isListedProtected, requiresConfirmation } from '../../src/shared/protection';

describe('computeWindow', () => {
  it('devuelve rango vacío sin elementos', () => {
    expect(computeWindow(0, 400, 0, 50)).toEqual({ start: 0, end: 0, offsetTop: 0, totalHeight: 0 });
  });

  it('pinta solo las filas visibles más overscan', () => {
    const w = computeWindow(1000, 400, 500, 50, 4);
    expect(w.start).toBe(16);
    expect(w.end).toBe(20 + 9 + 4);
    expect(w.offsetTop).toBe(16 * 50);
    expect(w.totalHeight).toBe(25_000);
  });

  it('no excede los límites', () => {
    const w = computeWindow(10_000_000, 400, 10, 50);
    expect(w.end).toBe(10);
    expect(w.start).toBeLessThanOrEqual(9);
    expect(computeWindow(-50, 400, 10, 50).start).toBe(0);
  });
});

describe('scrollTopToReveal', () => {
  it('mantiene el scroll si la fila ya es visible', () => {
    expect(scrollTopToReveal(3, 100, 400, 50)).toBe(100);
  });
  it('sube o baja lo justo', () => {
    expect(scrollTopToReveal(0, 100, 400, 50)).toBe(0);
    expect(scrollTopToReveal(20, 0, 400, 50)).toBe(20 * 50 + 50 - 400);
  });
});

describe('relativeTime', () => {
  const now = 1_000_000_000_000;
  const ago = (s: number): string => relativeTime(now / 1000 - s, now);
  it('formatea en español con singular y plural', () => {
    expect(ago(1)).toBe('hace un momento');
    expect(ago(90)).toBe('hace 1 minuto');
    expect(ago(2 * 3600)).toBe('hace 2 horas');
    expect(ago(86_400)).toBe('hace 1 día');
    expect(ago(40 * 86_400)).toBe('hace 1 mes');
    expect(ago(800 * 86_400)).toBe('hace 2 años');
  });
  it('no devuelve tiempos negativos con fechas futuras', () => {
    expect(relativeTime(now / 1000 + 500, now)).toBe('hace un momento');
  });
});

describe('protección', () => {
  it('coincide con nombres y patrones', () => {
    const list = ['main', 'release/*'];
    expect(isListedProtected('main', list)).toBe(true);
    expect(isListedProtected('release/1.0', list)).toBe(true);
    expect(isListedProtected('feat/main', list)).toBe(false);
    expect(isListedProtected('mainx', list)).toBe(false);
  });
  it('trata los metacaracteres de regex como texto', () => {
    expect(isListedProtected('a.b', ['a.b'])).toBe(true);
    expect(isListedProtected('axb', ['a.b'])).toBe(false);
  });
  it('aplica el modo de confirmación', () => {
    const base = { protectedBranches: ['main'] };
    expect(requiresConfirmation('feat/x', { ...base, mode: 'all' })).toBe(true);
    expect(requiresConfirmation('feat/x', { ...base, mode: 'list' })).toBe(false);
    expect(requiresConfirmation('main', { ...base, mode: 'list' })).toBe(true);
    expect(requiresConfirmation('main', { ...base, mode: 'off' })).toBe(false);
  });
});

describe('isFromWebview', () => {
  it('valida mensajes reconocidos incluyendo quickCommit y openScm', async () => {
    const { isFromWebview } = await import('../../src/shared/messages');
    expect(isFromWebview({ type: 'openScm' })).toBe(true);
    expect(isFromWebview({ type: 'quickCommit', message: 'feat: new test' })).toBe(true);
    expect(isFromWebview({ type: 'quickCommit' })).toBe(false);
    expect(isFromWebview({ type: 'invalid' })).toBe(false);
    expect(isFromWebview(null)).toBe(false);
  });
});
