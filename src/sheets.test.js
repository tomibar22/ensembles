import test from "node:test";
import assert from "node:assert/strict";
import { readRows, writeRows } from "./sheets.js";

/* fetch מזויף שמתעד את הקריאות, כדי לבדוק את צורת הבקשות בלי רשת */
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || "GET", body: opts.body });
    return {
      ok: true,
      status: 200,
      json: async () => handler(String(url), opts) ?? {},
      text: async () => "",
    };
  };
  return calls;
}

const META = { sheets: [{ properties: { sheetId: 42, title: "g9" } }] };
const ROWS = [
  ["שיעורים", 3, "צירופים", "0-1:2"],
  ["תלמיד", "הרכבים", "מזהה", ""],
  ["אילה", 2, "אילה-אוריין", ""],
];

test("כתיבה לגיליון היא קריאה אחת, בלי מחיקה נפרדת (רגרסיה)", async () => {
  const calls = stubFetch(() => META);
  await writeRows("g9", ROWS);

  const writes = calls.filter((c) => c.method !== "GET");
  assert.equal(writes.length, 1, `נשלחו ${writes.length} קריאות כתיבה במקום אחת`);
  assert.ok(
    !calls.some((c) => c.url.includes(":clear")),
    "עדיין נשלחת קריאת clear — כשל רשת אחריה ימחק את הגיליון"
  );
  assert.match(writes[0].url, /:batchUpdate$/);
});

test("הכתיבה מכסה את כל העמודות ומנקה שורות ישנות", async () => {
  const calls = stubFetch(() => META);
  await writeRows("g9", ROWS);
  const req = JSON.parse(calls.find((c) => c.method === "POST").body).requests[0].updateCells;

  assert.equal(req.range.sheetId, 42);
  assert.equal(req.range.startRowIndex, 0);
  assert.equal(req.range.endColumnIndex, 4);
  // בלי endRowIndex הטווח לא חסום, ולכן שורות שנשארו מעבר לנתונים החדשים נמחקות
  assert.equal(req.range.endRowIndex, undefined, "הטווח חסום ולכן שורות ישנות ישרדו");
  assert.equal(req.fields, "userEnteredValue");
  assert.equal(req.rows.length, ROWS.length);
});

test("מספרים נשמרים כמספרים, ותאים ריקים באמת ריקים", async () => {
  const calls = stubFetch(() => META);
  await writeRows("g9", ROWS);
  const rows = JSON.parse(calls.find((c) => c.method === "POST").body).requests[0].updateCells.rows;

  assert.deepEqual(rows[0].values[1], { userEnteredValue: { numberValue: 3 } });
  assert.deepEqual(rows[0].values[0], { userEnteredValue: { stringValue: "שיעורים" } });
  assert.deepEqual(rows[1].values[3], {}, "תא ריק נכתב כמחרוזת ריקה במקום להתנקות");
});

test("לשונית חסרה נוצרת, והמזהה שלה משמש לכתיבה", async () => {
  const calls = stubFetch((url, opts) =>
    opts.method === "POST" && url.endsWith(":batchUpdate") && String(opts.body).includes("addSheet")
      ? { replies: [{ addSheet: { properties: { sheetId: 77, title: "g11" } } }] }
      : { sheets: [] }
  );
  await writeRows("g11", ROWS);
  const posts = calls.filter((c) => c.method === "POST");
  assert.ok(String(posts[0].body).includes("addSheet"), "הלשונית לא נוצרה");
  const req = JSON.parse(posts[1].body).requests[0].updateCells;
  assert.equal(req.range.sheetId, 77, "הכתיבה לא השתמשה במזהה הלשונית החדשה");
});

test("קריאה מחזירה שורות, ולשונית ריקה מחזירה מערך ריק", async () => {
  stubFetch((url) => (url.includes("/values/") ? { values: ROWS } : META));
  assert.deepEqual(await readRows("g9"), ROWS);
  stubFetch((url) => (url.includes("/values/") ? {} : META));
  assert.deepEqual(await readRows("g9"), []);
});
