// מריץ קובצי SQL מול הפרויקט ב-Supabase דרך ה-Management API.
//
//   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=xxxx node scripts/db-apply.mjs [file.sql ...]
//
// בלי ארגומנטים: כל הקבצים ב-supabase/migrations לפי הסדר. כל המיגרציות
// כתובות כך שאפשר להריץ אותן שוב.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const REF = process.env.SUPABASE_PROJECT_REF || "jkgxiazbzkakydqychxh";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "proxy-injected";

export async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL נכשל (${res.status}): ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = "supabase/migrations";
  const files = process.argv.slice(2).length
    ? process.argv.slice(2)
    : readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => join(dir, f));
  for (const f of files) {
    await sql(readFileSync(f, "utf8"));
    console.log("✓", f);
  }
}
