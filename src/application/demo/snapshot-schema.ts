// The demo snapshot as it is stored in object storage (written by scripts/demo/snapshot.mjs). The file comes from outside the
// Worker, so every reset parses it before it writes anything.
import { z } from 'zod';
import { DEMO_ACCOUNT_ID } from '@/domain/demo/demo-account';
import { RESTORE_TABLES } from '@/domain/demo/restore-tables';

/** A column name as SQLite accepts it without quoting. The restore puts these into SQL, so anything else is refused. */
const COLUMN = /^[a-z_][a-z0-9_]*$/;

/** A snapshot: the rows of each restore table, the images they use, and when it was taken. */
export const demoSnapshotSchema = z.object({
  version: z.string().min(1).max(64),
  takenAt: z.iso.datetime(),
  accountId: z.literal(DEMO_ACCOUNT_ID),
  tables: z
    .record(z.string(), z.array(z.record(z.string().regex(COLUMN), z.unknown())))
    .refine(
      (tables) => Object.keys(tables).every((table) => (RESTORE_TABLES as readonly string[]).includes(table)),
      'The snapshot names a table the demo cannot restore',
    ),
  media: z.array(z.string().startsWith('media/').max(200)),
});

/** A parsed snapshot. */
export type DemoSnapshot = z.infer<typeof demoSnapshotSchema>;
