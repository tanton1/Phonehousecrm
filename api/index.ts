// Use the emitted file extension explicitly so Node ESM does not resolve the
// sibling `server/` directory instead of the root `server.ts` entrypoint.
import { app } from '../server.js';

export default app;
