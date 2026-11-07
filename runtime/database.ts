import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import type * as schema from '../db/schema';

export type TrainingDatabase =
  BaseSQLiteDatabase<'async', unknown, typeof schema>
  & Pick<SqliteRemoteDatabase<typeof schema>, 'batch'>;
