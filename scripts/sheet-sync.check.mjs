/**
 * בדיקת סנכרון מול גיליון מזויף.
 *
 * זה המסלול היחיד שהבדיקות של `npm test` לא מגיעות אליו — הוא דורש
 * דפדפן ו-OAuth — ובדיוק שם התחבא באג שכתב את רשימת י״א ללשונית של ט׳.
 *
 * לא חלק מ-`npm test` בכוונה: `node --test` רץ בלי שום תלות, וזה נשאר כך.
 * להרצה ידנית אחרי שינוי ב-pull או ב-sheets.js:
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npm i --no-save playwright && node scripts/sheet-sync.check.mjs
 */
import { chromium } from "playwright";

/* גיליון מזויף בזיכרון: מאפשר לבדוק את מסלול הסנכרון בלי OAuth אמיתי. */
const SHEET_INIT = `
  window.__sheet = {};                 // title -> rows
  window.__ids = {};                   // title -> sheetId יציב
  window.__nextId = 1;
  window.__writes = [];                // תיעוד כל כתיבה
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg) => ({
          requestAccessToken: () => cfg.callback({ access_token: "fake", expires_in: 3600 }),
        }),
      },
    },
  };
`;

const EXE = process.env.CHROMIUM_PATH || undefined;
let failures = 0;
const check = (ok, msg) => {
  console.log((ok ? "✓ " : "✗ ") + msg);
  if (!ok) failures++;
};

const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
const p = await b.newPage({ viewport: { width: 390, height: 900 } });
await p.addInitScript(SHEET_INIT);

await p.route("https://sheets.googleapis.com/**", async (route) => {
  const url = route.request().url();
  const method = route.request().method();
  const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });

  const state = await p.evaluate(() => window.__sheet).catch(() => ({}));

  if (method === "GET" && url.includes("fields=sheets.properties")) {
    const ids = await p.evaluate(() => window.__ids);
    return json({
      sheets: Object.keys(state).map((t) => ({ properties: { sheetId: ids[t], title: t } })),
    });
  }
  if (method === "GET" && url.includes("/values/")) {
    const tab = decodeURIComponent(url.split("/values/")[1].split("!")[0]);
    return json({ values: state[tab] || [] });
  }
  if (method === "POST" && url.includes(":batchUpdate")) {
    const body = JSON.parse(route.request().postData() || "{}");
    const req = (body.requests || [])[0] || {};
    if (req.addSheet) {
      const title = req.addSheet.properties.title;
      const id = await p.evaluate((t) => {
        window.__sheet[t] = window.__sheet[t] || [];
        window.__ids[t] = window.__ids[t] || window.__nextId++;
        return window.__ids[t];
      }, title);
      return json({ replies: [{ addSheet: { properties: { sheetId: id, title } } }] });
    }
    if (req.updateCells) {
      const id = req.updateCells.range.sheetId;
      const rows = (req.updateCells.rows || []).map((r) =>
        (r.values || []).map((c) => (c.userEnteredValue ? (c.userEnteredValue.stringValue ?? String(c.userEnteredValue.numberValue)) : ""))
      );
      await p.evaluate(
        ([sid, rws]) => {
          // מיפוי מדויק לפי המזהה, ולא לפי מיקום — אחרת הבדיקה עצמה משקרת
          const title = Object.keys(window.__ids).find((t) => window.__ids[t] === sid);
          if (!title) throw new Error("כתיבה ללשונית לא מוכרת: " + sid);
          window.__sheet[title] = rws;
          window.__writes.push({ title, first: (rws[2] || rws[1] || [])[0] || "", count: rws.length });
        },
        [id, rows]
      );
      return json({});
    }
  }
  return json({});
});

await p.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(500);

/* שיעור אחד נשמר בי״א, כדי שיהיה לה פנקס מקומי. בלעדיו לא היינו בודקים
   את החצי השני של אותו באג: העלאת הפנקס של הכיתה הקודמת ללשונית החדשה. */
await p.getByRole("button", { name: /חלק את/ }).click();
await p.waitForTimeout(900);
await p.getByRole("button", { name: /שמור את השיעור/ }).click();
await p.waitForTimeout(400);

// מתחברים לגיליון (ריק לגמרי, כמו גיליון שעוד אין בו לשונית תלמידים)
await p.getByRole("button", { name: /גיליון/ }).click();
await p.waitForTimeout(1200);

// ועכשיו עוברים לט׳ — הרגע שבו זה נשבר
await p.getByRole("button", { name: "ט׳", exact: true }).click();
await p.waitForTimeout(1800);

const sheet = await p.evaluate(() => window.__sheet);
const writes = await p.evaluate(() => window.__writes);
const g9 = sheet["תלמידים ט׳"] || [];
const names9 = g9.slice(1).map((r) => r[0]);
console.log("לשוניות שנוצרו:", Object.keys(sheet).join(" | "));
console.log("כתיבות:", writes.map((w) => `${w.title}(${w.count})`).join(" , "));
console.log("מי נכתב ל'תלמידים ט׳':", names9.slice(0, 6).join(", "), names9.length > 6 ? `… סה״כ ${names9.length}` : "");

const board = await p.locator("section").filter({ hasText: "מי כאן היום?" }).first().locator("button").allTextContents();
console.log("על לוח ט׳ מופיעים:", board.slice(0, 6).map((t) => t.trim()).join(", "));

check(
  !names9.includes("מעיין") && !names9.includes("גבריאל"),
  "לשונית 'תלמידים ט׳' לא קיבלה את תלמידי י״א"
);
check(names9.includes("אילה") || names9.includes("ניב"), "לשונית 'תלמידים ט׳' קיבלה את תלמידי ט׳");
check(names9.length === 14, `בלשונית ט׳ יש 14 תלמידים (בפועל ${names9.length})`);

/* החצי השני של אותו באג: הפנקס. לי״א יש שיעור שמור, לט׳ אין —
   ואסור שהפנקס של י״א יועלה ללשונית g9. */
const g9Ledger = sheet["g9"] || [];
const lessons9 = Number((g9Ledger[0] || [])[1] || 0);
check(lessons9 === 0, `הפנקס של ט׳ ריק ולא ירש את של י״א (שיעורים=${lessons9})`);

/* והמירוץ: החלפה מהירה הלוך ושוב לא משאירה כיתה עם נתוני האחרת. */
await p.getByRole("button", { name: "י״א", exact: true }).click();
await p.getByRole("button", { name: "ט׳", exact: true }).click();
await p.waitForTimeout(1800);
const after = await p.evaluate(() => window.__sheet);
const names9b = (after["תלמידים ט׳"] || []).slice(1).map((r) => r[0]);
check(
  !names9b.includes("מעיין") && names9b.length === 14,
  "גם אחרי החלפה מהירה הלוך ושוב, ט׳ נשארה עם התלמידים שלה"
);
const board2 = await p
  .locator("section")
  .filter({ hasText: "מי כאן היום?" })
  .first()
  .locator("button")
  .allTextContents();
check(!board2.some((t) => t.trim() === "מעיין"), "לוח הנוכחות מציג את ט׳ ולא את י״א");

await b.close();
console.log(failures ? `\n${failures} בדיקות נכשלו` : "\nהכול עבר");
process.exit(failures ? 1 : 0);
