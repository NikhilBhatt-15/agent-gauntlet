// Production build: SPA → dist/public, server → dist/server.mjs (single file, no runtime deps).
import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
fs.rmSync(dist, { recursive: true, force: true });

await viteBuild({ configFile: path.resolve('vite.config.ts'), logLevel: 'warn' });
console.log('✓ web    → dist/public');

await esbuild({
  entryPoints: ['server/index.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
console.log('✓ server → dist/server.mjs');



const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
fs.writeFileSync(
  path.join(dist, 'package.json'),
  JSON.stringify({ name: pkg.name, version: pkg.version, private: true, type: 'module', engines: { node: '>=22' }, scripts: { start: 'node server.mjs' } }, null, 2),
);
console.log('✓ dist/package.json  (deploy the dist/ folder as-is)');
