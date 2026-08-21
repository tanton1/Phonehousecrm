import { createRequire } from 'node:module';

// Vercel's Node 24 runtime executes functions as strict ESM. Load the bundled
// CommonJS server artifact produced by `npm run build` so internal TypeScript
// imports are already resolved and cannot fail on extensionless ESM paths.
const require = createRequire(import.meta.url);
const { app } = require('../dist/server.cjs') as typeof import('../server.js');

export default app;
