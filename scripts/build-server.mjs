import { rm } from 'node:fs/promises';
import { build } from 'esbuild';

const includeSourceMap = String(process.env.GENERATE_SERVER_SOURCEMAP || '').toLowerCase() === 'true';

if (!includeSourceMap) {
  await rm('dist/server.cjs.map', { force: true });
}

await build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['vite'],
  sourcemap: includeSourceMap ? 'external' : false,
  outfile: 'dist/server.cjs'
});

console.log(`Server bundle built${includeSourceMap ? ' with external source map' : ' without production source map'}.`);
