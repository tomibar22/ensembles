/* שכבת התחברות ל-Google Sheets ישירות מהדפדפן.
   OAuth דרך Google Identity Services — הטוקן חי בזיכרון בלבד, בערך שעה. */

export const CLIENT_ID =
  "521413250620-09c34bu4o2nhne004nkgcrvn1kkoh9bc.apps.googleusercontent.com";
export const SPREADSHEET_ID = "1lDLqOU4yvWGPg23pk6QJuKaQdOG1EvMflqwr1QqrWyY";

/* מסמכי תיעוד השיעורים, לכל כיתה. מתחלפים בכל שנת לימודים. */
export const LESSON_DOCS = {
  "ט׳": "11lRWcR9tYJFPQ5Hq3bObEjpk3eO0ND3qps4VdDwBLpE",
  "י״א": "1PjRn9w53ZTwVmXtwIZO9C_TbT2_THYENYb345-tFy3I",
};

// קריאה בלבד במסמכים — האפליקציה לא כותבת לתיעוד
const SCOPE = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents.readonly",
].join(" ");
const API = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

let token = null;
let expiry = 0;
let client = null;

export const connected = () => !!token && Date.now() < expiry;

export function connect() {
  return new Promise((resolve, reject) => {
    const g = window.google && window.google.accounts && window.google.accounts.oauth2;
    if (!g) return reject(new Error("הספרייה של גוגל לא נטענה — בדוק חיבור לרשת"));
    if (!client) {
      client = g.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (r) => {
          if (r.error) return client._reject(new Error(r.error_description || r.error));
          token = r.access_token;
          expiry = Date.now() + (r.expires_in - 60) * 1000;
          client._resolve(true);
        },
      });
    }
    client._resolve = resolve;
    client._reject = reject;
    client.requestAccessToken({ prompt: token ? "" : "consent" });
  });
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
      token = null;
      throw new Error("ההרשאה פגה — התחבר שוב");
    }
    throw new Error(`שגיאת גיליון ${res.status}: ${body.slice(0, 120)}`);
  }
  return res.json();
}

/** מזהה הלשונית המספרי, ויוצר אותה אם אינה קיימת */
export async function tabId(tab) {
  const meta = await api("?fields=sheets.properties(sheetId,title)");
  const found = (meta.sheets || []).find((sh) => sh.properties.title === tab);
  if (found) return found.properties.sheetId;
  const r = await api(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
  });
  return r.replies[0].addSheet.properties.sheetId;
}

const COL = (n) => String.fromCharCode(64 + n); // 4 → "D"

/** מחזיר מערך דו-ממדי של תאים, או [] אם הלשונית ריקה */
export async function readRows(tab, cols = 4) {
  await tabId(tab);
  const r = await api(`/values/${encodeURIComponent(tab)}!A1:${COL(cols)}5000`);
  return r.values || [];
}

const cell = (v) =>
  v === "" || v === null || v === undefined
    ? {} // תא ריק באמת, ולא מחרוזת ריקה
    : { userEnteredValue: typeof v === "number" ? { numberValue: v } : { stringValue: String(v) } };

/**
 * כותב את הפנקס ללשונית — בקריאה אחת.
 *
 * קודם זה היה clear ואז PUT: שתי קריאות נפרדות, וכשל רשת ביניהן היה מוחק
 * את הגיליון ומשאיר אותו ריק. בכיתה, עם רשת בית ספר, זה תרחיש אמיתי.
 *
 * updateCells על טווח לא חסום בעמודות A:D מחליף את התוכן ומנקה את מה
 * שמעבר לשורות החדשות באותה פעולה. batchUpdate של Sheets הוא אטומי —
 * או שהכול נכתב, או ששום דבר לא משתנה ומה שהיה קודם נשאר שלם.
 */
export async function writeRows(tab, rows, cols = 4) {
  const sheetId = await tabId(tab);
  await api(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          updateCells: {
            range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: cols },
            fields: "userEnteredValue",
            rows: rows.map((r) => ({ values: r.map(cell) })),
          },
        },
      ],
    }),
  });
}

/**
 * קורא מסמך Google Docs ומחזיר את ה-JSON של Docs API.
 *
 * בכוונה לא דרך `api`: כשל כאן לא אומר שההרשאה לגיליון פגה, ולכן אסור
 * לו לאפס את הטוקן ולנתק את הסנכרון. 403 כאן הוא כמעט תמיד Docs API
 * שלא הופעל בפרויקט, או טוקן ישן שניתן לפני שנוספה ההרשאה למסמכים.
 */
export async function readDoc(id) {
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 403) throw new Error("אין הרשאה לקרוא את מסמך התיעוד — התחבר מחדש, או הפעל את Google Docs API בפרויקט");
    if (res.status === 404) throw new Error("מסמך התיעוד לא נמצא");
    throw new Error(`שגיאה בקריאת התיעוד ${res.status}`);
  }
  return res.json();
}
