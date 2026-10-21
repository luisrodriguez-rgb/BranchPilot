export type ProtectionMode = 'all' | 'list' | 'off';

export interface ProtectionConfig {
  mode: ProtectionMode;
  protectedBranches: string[];
}

export const DEFAULT_PROTECTION: ProtectionConfig = {
  mode: 'all',
  protectedBranches: ['main', 'master', 'develop'],
};

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** ¿El nombre coincide con la lista de ramas protegidas (admite `*`)? */
export function isListedProtected(name: string, protectedBranches: string[]): boolean {
  return protectedBranches.some((pattern) => globToRegExp(pattern).test(name));
}

/** ¿Debe pedirse confirmación antes de operar sobre esta rama? */
export function requiresConfirmation(name: string, config: ProtectionConfig): boolean {
  switch (config.mode) {
    case 'all':
      return true;
    case 'list':
      return isListedProtected(name, config.protectedBranches);
    case 'off':
      return false;
  }
}
