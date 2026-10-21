import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');
const production = !watch;

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  target: 'es2022',
};

/** @type {import('esbuild').BuildOptions[]} */
const targets = [
  {
    ...common,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
  },
  {
    ...common,
    entryPoints: ['src/ui/branchPanel/webview/main.ts'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
  },
];

if (watch) {
  const contexts = await Promise.all(targets.map((t) => context(t)));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('[branchpilot] observando cambios...');
} else {
  await Promise.all(targets.map((t) => build(t)));
}
