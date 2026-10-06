import pg from "pg";

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createDb(url: string): Db {
  return new pg.Pool({ connectionString: url, max: 10 });
}

export async function withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function audit(
  tx: Pick<Tx, "query">,
  actor: string,
  ownerId: string,
  action: string,
  subjectType: string | null,
  subjectId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  await tx.query(
    `insert into audit_log (actor, owner_id, action, subject_type, subject_id, details) values ($1, $2, $3, $4, $5, $6)`,
    [actor, ownerId, action, subjectType, subjectId, details],
  );
}
