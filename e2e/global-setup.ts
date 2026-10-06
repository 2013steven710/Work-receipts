import pg from "pg";

export default async function globalSetup(): Promise<void> {
  const admin = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await admin.connect();
  await admin.query("delete from auth.users where email like '%@e2e.claimtidy.test'");
  await admin.end();
}
