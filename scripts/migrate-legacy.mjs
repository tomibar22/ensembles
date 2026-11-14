// הגירת הנתונים מהמערכת הקודמת (Google Sheets + מסמכי התיעוד) ל-Supabase.
//
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/migrate-legacy.mjs [migration-data/legacy.json]
//
// * אפשר להריץ שוב: כל מזהה נגזר מהמקור (md5), וכל שורה נכנסת ב-
//   "on conflict do nothing". הרצה חוזרת לא יוצרת כפילויות ולא דורסת שינוי
//   שנעשה באפליקציה אחרי ההגירה.
// * המקור אינו נפגע: הסקריפט רק קורא את הקובץ, וכותב ל-Supabase בלבד.
// * קובץ הנתונים מכיל שמות תלמידים ולכן אינו בריפו (migration-data/ ב-.gitignore).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "./db-apply.mjs";

const file = process.argv[2] || "migration-data/legacy.json";
const data = JSON.parse(readFileSync(file, "utf8"));

const id = (...parts) => {
  const h = createHash("md5").update(["shiur-iltur", ...parts].join("\u0001")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const q = (v) => (v === null || v === undefined ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => `${q(JSON.stringify(v))}::jsonb`;
const norm = (t) => t.toLowerCase().replace(/[״"׳'`’]/g, "").replace(/\s+/g, " ").trim();
const insert = (table, cols, rows) =>
  rows.length ? `insert into ${table} (${cols.join(", ")}) values\n${rows.map((r) => `  (${r.join(", ")})`).join(",\n")}\non conflict do nothing;` : "";

const stmts = [];
const bank = new Map(); // kind|norm → { id, kind, title }
const bankId = (kind, title) => {
  const key = `${kind}|${norm(title)}`;
  if (!bank.has(key)) bank.set(key, { id: id("bank", key), kind, title });
  return bank.get(key).id;
};
const report = [];

data.projects.forEach((p, order) => {
  const projectId = id("project", p.key);
  const pid = (legacyId) => id("participant", p.key, legacyId);
  const known = new Set(p.students.map((s) => s[4]));
  const lessonId = (date) => `${projectId}:${date}`;

  // הצבירה מהפנקס הישן: כמה הרכבים כל אחד ניגן, ומי ניגן עם מי
  const plays = {};
  const pairs = {};
  let lost = 0;
  Object.entries(p.ledger.plays).forEach(([lid, n]) => (known.has(lid) ? (plays[pid(lid)] = n) : lost++));
  Object.entries(p.ledger.pairs).forEach(([key, n]) => {
    const [a, b] = key.split("|");
    if (!known.has(a) || !known.has(b)) return lost++;
    const [x, y] = [pid(a), pid(b)].sort();
    pairs[`${x}|${y}`] = n;
  });

  stmts.push(
    insert(
      "projects",
      ["id", "name", "type_id", "grade", "active", "baseline", "sort"],
      [[q(projectId), q(p.name), q(p.type_id), q(p.grade), "true", j({ plays, pairs, lessons: p.ledger.lessons }), order]]
    )
  );
  stmts.push(
    insert(
      "participants",
      ["id", "project_id", "first_name", "last_name", "instrument", "instrument2", "sort"],
      p.students.map(([first, last, inst, inst2, lid], i) => [q(pid(lid)), q(projectId), q(first), q(last), q(inst), q(inst2), i])
    )
  );

  // כל תאריך שיש עליו תיעוד או רישום נוכחות הוא שיעור
  const dates = [...new Set([...p.lessons.map((l) => l.date), ...p.attendance.map((a) => a.date)])].sort();
  const byDate = new Map(p.lessons.map((l) => [l.date, l]));
  stmts.push(
    insert(
      "lessons",
      ["id", "project_id", "date", "description"],
      dates.map((d) => [q(lessonId(d)), q(projectId), q(d), q(byDate.get(d)?.description || "")])
    )
  );

  const marks = p.attendance.filter((a) => known.has(a.id));
  stmts.push(
    insert(
      "marks",
      ["lesson_id", "participant_id", "project_id", "status"],
      marks.map((a) => [q(lessonId(a.date)), q(pid(a.id)), q(projectId), q(a.status)])
    )
  );

  const items = [];
  p.lessons.forEach((l) =>
    ["repertoire", "exercise", "homework"].forEach((kind) =>
      (l[kind] || []).forEach((title, i) => {
        const item = bankId(kind, title);
        items.push([q(id("lesson_item", lessonId(l.date), item)), q(lessonId(l.date)), q(projectId), q(item), q(kind), i]);
      })
    )
  );
  p.media.forEach((m) => m.item && bankId(m.item[0], m.item[1]));
  report.push({ p, projectId, dates, marks, items, lost, deferred: () => [
    insert("lesson_items", ["id", "lesson_id", "project_id", "item_id", "kind", "position"], items),
    insert(
      "media",
      ["id", "project_id", "lesson_id", "item_id", "kind", "title", "filename", "drive_file_id", "url", "size"],
      p.media.map((m) => [
        q(id("media", m.drive_file_id)), q(projectId), q(lessonId(m.date)), q(m.item ? bankId(m.item[0], m.item[1]) : null),
        q(m.kind), q(m.title), q(m.filename), q(m.drive_file_id), q(m.url), m.size ?? "null",
      ])
    ),
  ] });
});

// פריטי הבנק קודם — השיעורים והמדיה מצביעים עליהם
stmts.push(insert("bank_items", ["id", "kind", "title"], [...bank.values()].map((b) => [q(b.id), q(b.kind), q(b.title)])));
report.forEach((r) => stmts.push(...r.deferred()));

await sql(`begin;\n${stmts.filter(Boolean).join("\n")}\ncommit;`);

console.log("ההגירה הושלמה.\n");
for (const r of report) {
  const [row] = await sql(`select
    (select count(*) from participants where project_id = ${q(r.projectId)}) participants,
    (select count(*) from lessons where project_id = ${q(r.projectId)}) lessons,
    (select count(*) from marks where project_id = ${q(r.projectId)}) marks,
    (select count(*) from lesson_items where project_id = ${q(r.projectId)}) items,
    (select count(*) from media where project_id = ${q(r.projectId)}) media`);
  console.log(
    `${r.p.name}: במקור ${r.p.students.length} תלמידים, ${r.dates.length} שיעורים, ${r.p.attendance.length} רישומי נוכחות, ` +
      `${r.items.length} פריטי תיעוד, ${r.p.media.length} קבצים, צבירה של ${r.p.ledger.lessons} שיעורים.`
  );
  console.log(`   במסד עכשיו: ${row.participants} משתתפים, ${row.lessons} שיעורים, ${row.marks} רישומים, ${row.items} פריטים, ${row.media} קבצים.`);
  const skipped = r.p.attendance.length - r.marks.length;
  if (skipped) console.log(`   ⚠ ${skipped} רישומי נוכחות דולגו: המזהה שלהם אינו ברשימת התלמידים.`);
  if (r.lost) console.log(`   ⚠ ${r.lost} ערכי צבירה דולגו: שייכים לתלמיד שאינו ברשימה.`);
}
const [b] = await sql("select count(*) n from bank_items");
console.log(`\nבנקים: ${bank.size} פריטים במקור, ${b.n} במסד.`);
