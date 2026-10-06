// Creates a database on the local Supabase Postgres if it doesn't exist: node scripts/ensure-db.mjs <name>
import pg from "pg";

const name = process.argv[2];
if (!/^[a-z_][a-z0-9_]*$/.test(name ?? "")) throw new Error("usage: ensure-db.mjs <database name>");
const client = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
await client.connect();
const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [name]);
if (rowCount === 0) await client.query(`create database ${name}`);
await client.end();
