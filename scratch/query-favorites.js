import Database from "better-sqlite3";

const db = new Database("./.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9c117c4215954e1e6b97018ccea359e46f9f64cd0aaa7eeae7dcb63e04b7547e.sqlite");

console.log("=== ALL FAVORITED / NORMALIZED JOBS ===");
try {
  const rows = db.prepare("SELECT id, user_id, job_title, employer_name, current_stage, is_favorited FROM normalized_jobs").all();
  console.log(rows);
} catch(e) {
  console.log("Error querying normalized_jobs:", e.message);
}
