/* הפנקס: צבירה בין שיעורים, גיבוי כטקסט, ושורות הגיליון.
   בלי React ובלי דפדפן — נבדק ישירות ב-`npm test`. */

import { pairKey } from "./roster.js";

/**
 * מוסיף חלוקה אחת לפנקס, תמיד מעל `base` — מצב הפנקס שלפני השיעור הזה.
 * זה מה שמאפשר לשמור שוב את אותו שיעור אחרי תיקון נוכחות: השמירה
 * השנייה מחליפה את הראשונה במקום להיספר כשיעור נוסף.
 * המורה לא נספר בפנקס — הוא ממלא כיסא, לא מתחרה על זמן ניגון.
 */
function applyLesson(roster, res, base) {
  const plays = { ...base.plays };
  const pairs = { ...base.pairs };
  roster.forEach((s) => (plays[s.id] = (plays[s.id] || 0) + (res.load[s.id] || 0)));
  res.groups.forEach((g) =>
    g.forEach((a, i) =>
      g.slice(i + 1).forEach((b) => {
        if (a.teacher || b.teacher) return;
        const key = pairKey(a.id, b.id);
        pairs[key] = (pairs[key] || 0) + 1;
      })
    )
  );
  return { plays, pairs, lessons: base.lessons + 1 };
}

/* ייצוא/ייבוא הפנקס כטקסט קצר, כדי לשמור אותו איפה שנוח.
   גרסה 2 נושאת את המזהים עצמם ולא רק מספרים לפי סדר, ולכן הגיבוי שורד
   הוספה או הסרה של תלמידים מהרשימה. גרסה 1 הייתה לפי מיקום בלבד. */
function encodeLedger(cls, roster, ledger) {
  const ids = roster.map((s) => s.id);
  const p = ids.map((id) => ledger.plays[id] || 0);
  const x = Object.entries(ledger.pairs)
    .map(([key, n]) => {
      const [a, b] = key.split("|").map((id) => ids.indexOf(id));
      return a < 0 || b < 0 ? null : `${a}-${b}:${n}`;
    })
    .filter(Boolean)
    .join(",");
  return JSON.stringify({ v: 2, c: cls, l: ledger.lessons, s: ids, p, x });
}

/** מחזיר { ledger, dropped, added } — dropped/added כדי שנוכל להגיד למשתמש
    מה קרה במקום לשנות לו את ההיסטוריה בשקט */
function decodeLedger(cls, roster, text) {
  const o = JSON.parse(text);
  if (!o || typeof o !== "object") throw new Error("זה לא גיבוי של פנקס");
  if (o.c !== cls) throw new Error("הפנקס שייך לכיתה " + o.c);
  // טקסט שהודבק ביד: בלי הבדיקות האלה "abc" היה נטען כמספר השיעורים
  if (!Number.isInteger(o.l) || o.l < 0) throw new Error("מספר השיעורים בגיבוי אינו תקין");
  if (!Array.isArray(o.p) || typeof (o.x ?? "") !== "string") throw new Error("מבנה הגיבוי אינו תקין");
  const list = roster;
  const known = new Set(list.map((s) => s.id));
  // גיבוי בלי מזהים (גרסה 1) נקרא פעם לפי סדר הרשימה — כלומר שייך היסטוריה
  // לתלמיד הלא נכון ברגע שהרשימה השתנתה. הוא כבר לא נטען.
  if (!Array.isArray(o.s)) throw new Error("הגיבוי ישן מדי — אין בו מזהי תלמידים");
  const ids = o.s.map((id) => (known.has(id) ? id : null));
  const plays = {};
  (o.p || []).forEach((n, i) => {
    if (ids[i]) plays[ids[i]] = Number(n) || 0;
  });
  const pairs = {};
  (o.x || "")
    .split(",")
    .filter(Boolean)
    .forEach((part) => {
      const [ij, n] = part.split(":");
      const [a, b] = ij.split("-").map(Number);
      if (ids[a] && ids[b]) pairs[pairKey(ids[a], ids[b])] = Number(n);
    });
  return {
    ledger: { plays, pairs, lessons: o.l },
    dropped: ids.filter((id) => !id).length,
    added: list.filter((s) => !(s.id in plays)).length,
  };
}

/**
 * מי גובר כשגם במכשיר וגם בגיליון יש נתונים — "push" או "pull".
 *
 * השיעור נרשם במכשיר, בכיתה, ורק אחר כך נכתב לגיליון. כשהכתיבה לא
 * יצאה לדרך — הטוקן של גוגל חי כשעה, ושיעור שני באותו יום כבר נופל
 * מחוץ לו — המכשיר מחזיק שיעור שהגיליון לא מכיר. משיכה עיוורת במצב
 * הזה מוחקת אותו בלי שאיש ישים לב, וזה בדיוק מה שקרה: שיעור של ט׳
 * נשמר במכשיר בלבד, והסנכרון הבא היה דורס אותו.
 *
 * לכן: המכשיר גובר כשיש בו סימון `pending` — שינוי שידוע שלא נכתב —
 * או כשיש בו יותר שיעורים מהגיליון. הכלל השני הוא מה שמציל שינוי
 * שנעשה לפני שהסימון היה קיים בכלל.
 *
 * `pending` מנצח גם כשמספר השיעורים שווה: עריכת רשימה או ביטול שמירה
 * אינם משנים את המונה.
 */
function syncDirection(local, sheet, pending = false) {
  if (pending) return "push";
  if ((local.lessons || 0) > (sheet.lessons || 0)) return "push";
  return "pull";
}

/* המרה בין הפנקס לשורות הגיליון:
   A1: "שיעורים" | מספר | "צירופים" | מחרוזת דחוסה
   A2: כותרות, ומשורה 3: שם תלמיד | כמה הרכבים | מזהה
   הצירופים דחוסים לפי מיקום השורה, ועמודת המזהה היא שמפרשת את המיקומים —
   בלעדיה הוספת תלמיד באמצע הרשימה הייתה מזיזה לכולם את ההיסטוריה. */
function ledgerToRows(roster, ledger) {
  const list = roster;
  const ids = list.map((s) => s.id);
  const pairs = Object.entries(ledger.pairs)
    .map(([key, n]) => {
      const [a, b] = key.split("|").map((id) => ids.indexOf(id));
      return a < 0 || b < 0 ? null : `${a}-${b}:${n}`;
    })
    .filter(Boolean)
    .join(",");
  return [
    ["שיעורים", ledger.lessons, "צירופים", pairs],
    ["תלמיד", "הרכבים", "מזהה", ""],
    ...list.map((s) => [s.name, ledger.plays[s.id] || 0, s.id, ""]),
  ];
}

function rowsToLedger(roster, rows) {
  if (!rows.length) return { plays: {}, pairs: {}, lessons: 0 };
  const list = roster;
  const known = new Set(list.map((s) => s.id));
  const lessons = Number(rows[0] && rows[0][1]) || 0;
  const plays = {};
  // סדר השורות בגיליון הוא הבסיס לאינדקסים של הצירופים, ולכן נבנה ממנו
  const order = [];
  rows.slice(2).forEach((r) => {
    /* הזיהוי לפי עמודת המזהה בלבד. שורה שהמזהה שלה אינו ברשימה — תלמיד
       שהוסר — אינה נטענת, אבל שומרת על מקומה: הצירופים דחוסים לפי מיקום. */
    const marked = String(r[2] || "").trim();
    const id = known.has(marked) ? marked : null;
    order.push(id);
    if (id) plays[id] = Number(r[1]) || 0;
  });
  const pairs = {};
  ((rows[0] && rows[0][3]) || "")
    .split(",")
    .filter(Boolean)
    .forEach((part) => {
      const [ij, n] = part.split(":");
      const [a, b] = ij.split("-").map(Number);
      if (order[a] && order[b]) pairs[pairKey(order[a], order[b])] = Number(n);
    });
  return { plays, pairs, lessons };
}

export {
  applyLesson,
  encodeLedger,
  decodeLedger,
  syncDirection,
  ledgerToRows,
  rowsToLedger,
};
