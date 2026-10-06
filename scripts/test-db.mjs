// pnpm test:db — start local Supabase (only the services the tests need), rebuild the database
// from migrations, then run the pgTAP suite in supabase/tests.
import { execFileSync } from "node:child_process";

const EXCLUDE = "studio,imgproxy,vector,logflare,edge-runtime,realtime,supavisor,mailpit,postgres-meta";
const run = (args) => execFileSync("pnpm", ["exec", "supabase", ...args], { stdio: "inherit" });

run(["start", "-x", EXCLUDE]);
run(["db", "reset"]);
run(["test", "db"]);
