// Turns off zod's compiled ("JIT") validators. Zod probes for them with `new Function`, which a page policy without
// 'unsafe-eval' reports as a violation on every admin editor page even though zod catches it. Workers refuses the call too, so
// nothing is lost on the server. Schema modules import this file first, so it runs before any schema is built.
import { z } from 'zod';

z.config({ jitless: true });
