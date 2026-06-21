import Database from "better-sqlite3";

const db = new Database("./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9c117c4215954e1e6b97018ccea359e46f9f64cd0aaa7eeae7dcb63e04b7547e.sqlite");

const tables = ["user", "canonical_jobs", "normalized_jobs", "job_sources", "boards"];
for (const table of tables) {
  try {
    const row = db.prepare(`SELECT count(*) as count FROM ${table}`).get();
    console.log(`${table}: ${row.count}`);
  } catch(e) {
    console.log(`Error querying ${table}:`, e.message);
  }
}
