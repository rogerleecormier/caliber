import Database from "better-sqlite3";

console.log("Opening root database local.db...");
const db = new Database("local.db");

console.log("=== USERS ===");
try {
  console.log(db.prepare("SELECT * FROM user").all());
} catch(e) {
  console.log("Error querying user:", e.message);
}

console.log("\n=== MASTER RESUME ===");
try {
  console.log(db.prepare("SELECT id, user_id, full_name, email, summary FROM master_resume").all());
} catch(e) {
  console.log("Error querying master_resume:", e.message);
}

console.log("\n=== RESUME SECTIONS ===");
try {
  console.log(db.prepare("SELECT section_type, substr(content, 1, 100) as content_start FROM resume_sections").all());
} catch(e) {
  console.log("Error querying resume_sections:", e.message);
}

console.log("\n=== NORMALIZED JOBS ===");
try {
  console.log(db.prepare("SELECT id, user_id, job_title, employer_name, current_stage FROM normalized_jobs").all());
} catch(e) {
  console.log("Error querying normalized_jobs:", e.message);
}

console.log("\n=== JOB ANALYSES ===");
try {
  console.log(db.prepare("SELECT id, user_id, job_title, company FROM job_analyses").all());
} catch(e) {
  console.log("Error querying job_analyses:", e.message);
}
