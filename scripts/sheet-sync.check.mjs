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
import { LISTS } from "../src/fixtures.js";

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

/* רשימות הכיתה במטמון, כמו במכשיר שכבר עבד: בקוד אין רשימות, ומכשיר
   בלי רשימה מציג לוח ריק. הכיתות כאן בדויות (src/fixtures.js). */
await p.addInitScript((seed) => {
  for (const [key, list] of Object.entries(seed))
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(list));
}, { "ens-roster-g9": LISTS["ט׳"], "ens-roster-g11": LISTS["י״א"] });

/* הספרייה האמיתית של גוגל נטענת מ-index.html ודורסת את window.google
   המזויף — ואז שום דבר לא מתחבר וכל הבדיקות נכשלות בלי קשר לקוד. */
await p.route("https://accounts.google.com/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));

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
    // כל הבקשות שבאצווה, לפי הסדר — כתיבה של כמה לשוניות מגיעה בקריאה אחת
    const replies = [];
    for (const req of body.requests || []) {
      if (req.addSheet) {
        const title = req.addSheet.properties.title;
        const id = await p.evaluate((t) => {
          window.__sheet[t] = window.__sheet[t] || [];
          window.__ids[t] = window.__ids[t] || window.__nextId++;
          return window.__ids[t];
        }, title);
        replies.push({ addSheet: { properties: { sheetId: id, title } } });
      } else if (req.updateCells) {
        const id = req.updateCells.range.sheetId;
        const rows = (req.updateCells.rows || []).map((r) =>
          (r.values || []).map((c) =>
            c.userEnteredValue ? (c.userEnteredValue.stringValue ?? String(c.userEnteredValue.numberValue)) : ""
          )
        );
        await p.evaluate(
          ([sid, rws]) => {
            // מיפוי מדויק לפי המזהה, ולא לפי מיקום — אחרת הבדיקה עצמה משקרת
            const title = Object.keys(window.__ids).find((t) => window.__ids[t] === sid);
            if (!title) throw new Error("כתיבה ללשונית לא מוכרת: " + sid);
            window.__sheet[title] = rws;
            (window.__writes = window.__writes || []).push({ title, first: (rws[2] || rws[1] || [])[0] || "", count: rws.length });
          },
          [id, rows]
        );
        replies.push({});
      }
    }
    return json({ replies });
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
  !names9.includes("רון") && !names9.includes("יואב"),
  "לשונית 'תלמידים ט׳' לא קיבלה את תלמידי י״א"
);
check(names9.includes("נועה") || names9.includes("אריאל"), "לשונית 'תלמידים ט׳' קיבלה את תלמידי ט׳");
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
  !names9b.includes("רון") && names9b.length === 14,
  "גם אחרי החלפה מהירה הלוך ושוב, ט׳ נשארה עם התלמידים שלה"
);
const board2 = await p
  .locator("section")
  .filter({ hasText: "מי כאן היום?" })
  .first()
  .locator("button")
  .allTextContents();
check(!board2.some((t) => t.trim() === "רון"), "לוח הנוכחות מציג את ט׳ ולא את י״א");

/* ================== איחור: מי שהגיע רק אחרי החלוקה ==================

   המסלול שהמורה עובר בפועל: מסמנים שניים כחסרים, מחלקים, ואז אחד מהם
   נכנס לכיתה ומוחזר ללוח. ההפרש בין הנוכחות בזמן החלוקה לנוכחות בסוף
   הוא כל מה שמבדיל "איחור" מ"חיסור", והוא חי בזיכרון בלבד — אם הוא
   נשבר, הגיליון פשוט מקבל חיסור במקום איחור בלי שום שגיאה. */
const LATE = "רותם";
const OUT = "שקד";

await p.getByRole("button", { name: LATE, exact: true }).click();
await p.getByRole("button", { name: OUT, exact: true }).click();
await p.waitForTimeout(200);
await p.getByRole("button", { name: /חלק את/ }).click();
await p.waitForTimeout(900);

// רותם נכנסת לכיתה אחרי שההרכבים כבר חולקו
await p.getByRole("button", { name: "שנה נוכחות" }).click();
await p.waitForTimeout(200);
await p.getByRole("button", { name: LATE, exact: true }).click();
await p.waitForTimeout(400);
await p.getByRole("button", { name: /שמור את השיעור/ }).click();
await p.waitForTimeout(1200);

const att = ((await p.evaluate(() => window.__sheet))["נוכחות ט׳"] || []).slice(1);
const cell = (n, i) => (att.find((r) => r[2] === n) || [])[i] || "";
console.log("יומן נוכחות ט׳:", att.map((r) => `${r[2]}=${r[4]}`).join(", ") || "(ריק)");

check(cell(LATE, 4) === "איחור", `${LATE} נרשמה בגיליון כאיחור (בפועל: ${cell(LATE, 4) || "לא נרשמה"})`);
check(cell(OUT, 4) === "חיסור", `${OUT} נרשם בגיליון כחיסור (בפועל: ${cell(OUT, 4) || "לא נרשם"})`);
check(att.length === 2, `ביומן רק שתי שורות — נוכח רגיל אינו נרשם (בפועל ${att.length})`);
check(cell(LATE, 3) !== "", "שורת האיחור נושאת מזהה, ולא רק שם");

/* ותיקון נוכחות אחרי השמירה: דנה יוצאת באמצע, והשיעור נשמר שוב.
   זו השמירה שמחליפה את שורות היומן — ואם היא מוסיפה במקום להחליף,
   הגיליון מתמלא בכפילויות של אותו שיעור. */
await p.getByRole("button", { name: "דנה", exact: true }).click();
await p.waitForTimeout(400);
await p.getByRole("button", { name: /עדכן את השיעור/ }).click();
await p.waitForTimeout(1200);

const again = ((await p.evaluate(() => window.__sheet))["נוכחות ט׳"] || []).slice(1);
const cell2 = (n, i) => (again.find((r) => r[2] === n) || [])[i] || "";
console.log("אחרי העדכון:", again.map((r) => `${r[2]}=${r[4]}`).join(", "));
check(again.length === 3, `העדכון החליף את שורות השיעור ולא הכפיל אותן (בפועל ${again.length})`);
check(cell2("דנה", 4) === "יצא", `דנה נרשמה כיצאה באמצע (בפועל: ${cell2("דנה", 4) || "לא נרשמה"})`);
check(cell2(LATE, 4) === "איחור", "האיחור נשמר גם אחרי העדכון");
check(new Set(again.map((r) => r[1])).size === 1, "כל השורות שייכות לאותו מספר שיעור");

/* ============ שיעור שנשמר אינו נספר פעמיים ============

   אחרי שמירה מוצלחת, החלפת כיתה וחזרה מושכת שוב מהגיליון. קודם המשיכה
   הזאת איפסה את "נשמר" ואת הבסיס, הכפתור חזר ל"שמור את השיעור" — ולחיצה
   עליו ספרה את אותו שיעור כשיעור שני. */
const lessonsBefore = Number((((await p.evaluate(() => window.__sheet))["g9"] || [])[0] || [])[1] || 0);
await p.getByRole("button", { name: "י״א", exact: true }).click();
await p.waitForTimeout(1500);
await p.getByRole("button", { name: "ט׳", exact: true }).click();
await p.waitForTimeout(1800);
check(
  (await p.getByRole("button", { name: "נשמר בפנקס" }).count()) === 1 &&
    (await p.getByRole("button", { name: /שמור את השיעור/ }).count()) === 0,
  "אחרי החלפת כיתה וחזרה השיעור עדיין מסומן כשמור"
);
/* ועריכה נוספת ושמירה מעדכנות את אותו שיעור */
await p.getByRole("button", { name: "שנה נוכחות" }).click();
await p.waitForTimeout(200);
await p.getByRole("button", { name: "דנה", exact: true }).click();
await p.waitForTimeout(400);
await p.getByRole("button", { name: /עדכן את השיעור/ }).click();
await p.waitForTimeout(1200);
const lessonsAfter = Number((((await p.evaluate(() => window.__sheet))["g9"] || [])[0] || [])[1] || 0);
check(lessonsAfter === lessonsBefore, `שמירה חוזרת עדכנה את השיעור ולא הוסיפה אחד (${lessonsBefore} → ${lessonsAfter})`);

/* ============ רשימה פגומה בגיליון ============

   שורה שהועתקה ביד בגיליון נושאת את המזהה של המקור. קודם הרשימה נשמרה
   למטמון לפני כל בדיקה, והאפליקציה קרסה בכל רענון. */
await p.evaluate(() => {
  const rows = window.__sheet["תלמידים ט׳"];
  rows.push([...rows[1]]);
});
await p.getByRole("button", { name: /גיליון/ }).first().click();
await p.waitForTimeout(1500);
const text = await p.locator("body").innerText();
check(text.includes("לא תקינה") && !text.includes("משהו נשבר"), "רשימה עם מזהה כפול נדחית בהודעה, והאפליקציה ממשיכה לעבוד");
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(700);
check(!(await p.locator("body").innerText()).includes("משהו נשבר"), "וגם אחרי רענון היא עולה");

await b.close();
console.log(failures ? `\n${failures} בדיקות נכשלו` : "\nהכול עבר");
process.exit(failures ? 1 : 0);
