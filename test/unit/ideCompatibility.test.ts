import { describe, expect, it } from 'vitest';
import {
  buildCompatibilityReport,
  detectIdeFamily,
  parseGitVersion,
  probeGitVersion,
} from '../../src/shared/ideCompatibility';

describe('detectIdeFamily', () => {
  it('identifica Antigravity, Cursor, Windsurf, Kiro, Trae, Qoder, VSCodium y VS Code', () => {
    expect(detectIdeFamily('Antigravity', 'antigravity')).toBe('antigravity');
    expect(detectIdeFamily('Cursor', 'cursor')).toBe('cursor');
    expect(detectIdeFamily('Windsurf', 'windsurf')).toBe('windsurf');
    expect(detectIdeFamily('Kiro', 'kiro')).toBe('kiro');
    expect(detectIdeFamily('Trae', 'trae')).toBe('trae');
    expect(detectIdeFamily('Qoder IDE', 'qoder')).toBe('qoder');
    expect(detectIdeFamily('VSCodium', 'vscodium')).toBe('vscodium');
    expect(detectIdeFamily('Visual Studio Code', 'vscode')).toBe('vscode');
    expect(detectIdeFamily('CustomEditor', 'custom')).toBe('unknown');
  });
});

describe('parseGitVersion y probeGitVersion', () => {
  it('interpreta versiones de Git en macOS, Linux y Windows y calcula capacidades', () => {
    const modern = parseGitVersion('git version 2.45.2 (Apple Git-150)');
    expect(modern).toMatchObject({
      major: 2,
      minor: 45,
      patch: 2,
      supportsBatchAheadBehind: true,
      supportsWorktreePorcelainZ: true,
    });

    const older = parseGitVersion('git version 2.34.1');
    expect(older).toMatchObject({
      major: 2,
      minor: 34,
      patch: 1,
      supportsBatchAheadBehind: false,
      supportsWorktreePorcelainZ: true,
    });

    expect(parseGitVersion('no version here')).toBeUndefined();
  });

  it('devuelve undefined cuando el comando git falla en probeGitVersion', async () => {
    const failing = () => Promise.reject(new Error('ENOENT'));
    expect(await probeGitVersion('/tmp', failing)).toBeUndefined();
  });
});

describe('buildCompatibilityReport', () => {
  it('informa correctamente cuando vscode.git no está presente pero el motor CLI funciona', () => {
    const report = buildCompatibilityReport({
      appName: 'Antigravity',
      uriScheme: 'antigravity',
      vscodeVersion: '1.96.0',
      hasVscodeGitExtension: false,
      gitVersion: parseGitVersion('git version 2.46.0'),
    });
    expect(report.ideFamily).toBe('antigravity');
    expect(report.gitAvailable).toBe(true);
    expect(report.notes.join(' ')).toContain('motor Git CLI autónomo');
  });
});
