import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(__dirname, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
let dbPath = "";

if (fs.existsSync(dbDir)) {
  const files = fs.readdirSync(dbDir);
  const sqliteFile = files.find(f => f.endsWith(".sqlite"));
  if (sqliteFile) {
    dbPath = path.join(dbDir, sqliteFile);
  }
}

if (!dbPath) {
    console.log("No local DB found");
    process.exit(1);
}

const db = new Database(dbPath);
const user = db.prepare("SELECT id FROM user LIMIT 1").get();
if (!user) {
  console.log("No user found");
  process.exit(1);
}

console.log("User ID:", user.id);
const resume = db.prepare("SELECT * FROM master_resume WHERE user_id = ?").get(user.id);
console.log("Master Resume:", JSON.stringify(resume, null, 2));

const sections = db.prepare("SELECT * FROM resume_sections WHERE user_id = ?").all(user.id);
console.log("Resume Sections Count:", sections.length);
for (const sec of sections) {
  console.log(`Section: ${sec.section_type}`);
  console.log(JSON.stringify(JSON.parse(sec.content), null, 2));
}
