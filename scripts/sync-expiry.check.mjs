/**
 * הטוקן של גוגל פג באמצע יום ההוראה — מה קורה לשיעור שנשמר אחריו.
 *
 * זה התרחיש שקרה בפועל: שיעור של י״א נשמר לגיליון, וכשעה אחר כך שיעור
 * של ט׳ נשמר במכשיר בלבד — בלי שום סימן בממשק — והתיקון של שם תלמיד
 * נשאר גם הוא מאחור. הסנכרון הבא היה מוחק את שניהם.
 *
 * הטוקן חי שעה, ולכן אי אפשר לחכות לו בבדיקה: הגיליון המזויף מנפיק
 * טוקן לחמש שניות (`__expiresIn`), וזה מספיק כדי לעבור את אותו גבול.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npm i --no-save playwright && node scripts/sync-expiry.check.mjs
 */
import { chromium } from "playwright";

const SHEET_INIT = `
  window.__sheet = {};
  window.__ids = {};
  window.__nextId = 1;
  window.__expiresIn = 3600;           // נשלט מהבדיקה
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg) => ({
          requestAccessToken: () =>
            cfg.callback({ access_token: "fake", expires_in: window.__expiresIn }),
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
    return json({ sheets: Object.keys(state).map((t) => ({ properties: { sheetId: ids[t], title: t } })) });
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
        (r.values || []).map((c) =>
          c.userEnteredValue ? (c.userEnteredValue.stringValue ?? String(c.userEnteredValue.numberValue)) : ""
        )
      );
      await p.evaluate(
        ([sid, rws]) => {
          const title = Object.keys(window.__ids).find((t) => window.__ids[t] === sid);
          if (!title) throw new Error("כתיבה ללשונית לא מוכרת: " + sid);
          window.__sheet[title] = rws;
        },
        [id, rows]
      );
      return json({});
    }
  }
  return json({});
});

const sheet = () => p.evaluate(() => window.__sheet);
const lessonsIn = async (tab) => Number(((await sheet())[tab] || [])[0]?.[1] || 0);
const saveLesson = async () => {
  await p.getByRole("button", { name: /חלק את|חלק מחדש/ }).first().click();
  await p.waitForTimeout(900);
  await p.getByRole("button", { name: /שמור את השיעור/ }).click();
  await p.waitForTimeout(900);
};

await p.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(500);

/* מתחברים עם טוקן שחי חמש שניות — אותו גבול, בקנה מידה של בדיקה */
await p.evaluate(() => (window.__expiresIn = 65));
await p.getByRole("button", { name: /גיליון/ }).click();
await p.waitForTimeout(1500);

/* שיעור ראשון, בזמן שהטוקן עוד בתוקף — הוא אמור להגיע לגיליון */
await saveLesson();
const g11 = await lessonsIn("g11");
check(g11 === 1, `השיעור של י״א נכתב לגיליון בזמן שהחיבור חי (שיעורים=${g11})`);

/* וכאן פג הטוקן, כמו שעה אחרי תחילת יום ההוראה */
await p.waitForTimeout(4000);
await p.getByRole("button", { name: "ט׳", exact: true }).click();
await p.waitForTimeout(1200);

await saveLesson();

const g9After = await lessonsIn("g9");
const btn = (await p.getByRole("button", { name: /גיליון|ממתין/ }).first().textContent()) || "";
const msg = (await p.locator("body").innerText()).includes("נשמר במכשיר בלבד");
console.log("מצב הכפתור אחרי השמירה:", btn.trim());

check(g9After === 0, `אחרי שהטוקן פג השיעור של ט׳ לא נכתב לגיליון (שיעורים=${g9After})`);
check(/ממתין/.test(btn), `הממשק מסמן שיש מה להעלות (בכפתור: "${btn.trim()}")`);
check(msg, "ההודעה אומרת במפורש שהשמירה היא במכשיר בלבד");

/* ותיקון שם, באותו חלון בלי חיבור */
await p.getByRole("button", { name: "רשימת הכיתה" }).click();
await p.waitForTimeout(600);
const firstName = p.locator('input[aria-label="שם פרטי"][value="אוריה"]').first();
const hasEditor = await firstName.count();
if (hasEditor) {
  await firstName.fill("אוריה-בדיקה");
  await p.getByRole("button", { name: /שמור את הרשימה/ }).click();
  await p.waitForTimeout(800);
} else {
  console.log("(שדה השם של אוריה לא נמצא — מדלג על חלק תיקון השם)");
}

/* מתחברים מחדש — הרגע שבו הבאג מחק את מה שנשמר במכשיר */
await p.evaluate(() => (window.__expiresIn = 3600));
await p.getByRole("button", { name: /גיליון|ממתין/ }).first().click();
await p.waitForTimeout(2500);

const g9Final = await lessonsIn("g9");
check(g9Final === 1, `אחרי החיבור מחדש השיעור של ט׳ עלה לגיליון ולא נמחק (שיעורים=${g9Final})`);

if (hasEditor) {
  const names = ((await sheet())["תלמידים ט׳"] || []).slice(1).map((r) => r[0]);
  check(names.includes("אוריה-בדיקה"), `גם תיקון השם עלה לגיליון (${names.slice(0, 3).join(", ")}…)`);
}

/* ותיקון שם **בזמן שהחיבור חי**: הוא חייב להגיע גם ללשונית הפנקס ולא רק
   לרשימה. השם שם הוא עותק לצד המזהה, וקודם הוא התרענן רק בשמירת שיעור —
   וכך "סמואל" נשאר ב-g9 אחרי שהשם כבר תוקן ברשימה. */
await p.getByRole("button", { name: "רשימת הכיתה" }).click();
await p.waitForTimeout(600);
const live = p.locator('input[aria-label="שם פרטי"][value="אוריה-בדיקה"]').first();
if (await live.count()) {
  await live.fill("אוריה-חי");
  await p.getByRole("button", { name: /שמור את הרשימה/ }).click();
  await p.waitForTimeout(1200);
  const after = await sheet();
  const inRoster = (after["תלמידים ט׳"] || []).slice(1).map((r) => r[0]);
  const inLedger = (after["g9"] || []).slice(2).map((r) => r[0]);
  check(inRoster.includes("אוריה-חי"), "השם המתוקן נכתב ללשונית התלמידים");
  check(
    inLedger.includes("אוריה-חי") && !inLedger.includes("אוריה-בדיקה"),
    `השם המתוקן רוענן גם בלשונית הפנקס g9 (${inLedger.slice(0, 4).join(", ")}…)`
  );
} else {
  console.log("(שדה השם לא נמצא — מדלג על בדיקת רענון g9)");
}

const btnEnd = (await p.getByRole("button", { name: /גיליון|ממתין/ }).first().textContent()) || "";
check(!/ממתין/.test(btnEnd), `אחרי ההעלאה הסימון נעלם (בכפתור: "${btnEnd.trim()}")`);

/* והכיוון ההפוך עדיין עובד: גיליון מעודכן אינו נדרס על ידי מכשיר מפגר */
const g11End = await lessonsIn("g11");
check(g11End === 1, `הפנקס של י״א נשאר בגיליון כפי שהיה (שיעורים=${g11End})`);

await b.close();
console.log(failures ? `\n${failures} בדיקות נכשלו` : "\nהכול עבר");
process.exit(failures ? 1 : 0);
