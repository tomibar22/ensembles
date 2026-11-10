/* המטמון המקומי — כל מה שהאפליקציה שומרת במכשיר, במקום אחד.

   מקור האמת הוא הגיליון; המטמון הוא מה שמאפשר לעבוד בכיתה בלי רשת, ומה
   שמחזיק שיעור שעוד לא הספיק להיכתב. כל פונקציה כאן תלויה ב-`cls` בלבד
   ולא במצב של React, ולכן אינה יכולה לפגר אחרי החלפת כיתה. */

import { KEYS, TABS, SEED, EMPTY, TEACHER, buildRoster, packLesson, unpackLesson } from "./ensembles.js";

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null; // גלישה פרטית — ממשיכים בלי מטמון
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

const readJSON = (k) => {
  try {
    const v = store.get(k);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
};
const writeJSON = (k, o) => store.set(k, JSON.stringify(o));
const key = (name) => (cls) => `ens-${name}-${TABS[cls]}`;

/* התאריך לפי השעון של המכשיר. קודם זה היה toISOString — כלומר UTC —
   ואז עד שתיים־שלוש בלילה "היום" היה עדיין אתמול. */
export function todayStamp(now = new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/* ---- מי לא הגיע היום. ליום אחד בלבד: היעדרות שנגררת בשקט לשיעור הבא
        מסוכנת יותר מהטרחה לסמן מחדש. ---- */
const ABSENT_KEY = key("absent");
export function loadAbsent(cls) {
  const o = readJSON(ABSENT_KEY(cls));
  return o && o.d === todayStamp() && Array.isArray(o.ids) ? o.ids : [];
}
export const saveAbsent = (cls, ids) => writeJSON(ABSENT_KEY(cls), { d: todayStamp(), ids });

/* ---- רשימת הכיתה. רשימה שאי אפשר לבנות ממנה כיתה (מזהה כפול) אינה
        נטענת: buildRoster היה זורק עליה ברנדר, בכל רענון מחדש. ---- */
const ROSTER_KEY = key("roster");
function cachedRoster(cls) {
  const o = readJSON(ROSTER_KEY(cls));
  if (!Array.isArray(o) || !o.length) return null;
  try {
    buildRoster(o);
    return o;
  } catch {
    return null;
  }
}
export const loadRosterList = (cls) => cachedRoster(cls) || SEED[cls];
/** האם יש במכשיר רשימה אמיתית של הכיתה, ולא רק הזרע שבקוד */
export const hasRoster = (cls) => !!cachedRoster(cls);
export const saveRosterList = (cls, list) => writeJSON(ROSTER_KEY(cls), list);

/* ---- הפנקס ---- */
export const loadLedger = (cls) => ({ ...EMPTY, ...(readJSON(KEYS[cls]) || {}) });
export const saveLedger = (cls, ledger) => writeJSON(KEYS[cls], ledger);

/* ---- יומן הנוכחות ---- */
const ATT_KEY = key("att");
export function loadAtt(cls) {
  const o = readJSON(ATT_KEY(cls));
  return Array.isArray(o) ? o : [];
}
export const saveAtt = (cls, log) => writeJSON(ATT_KEY(cls), log);

/* ---- השיעור של היום, כדי שרענון או סגירה של הדף ברקע לא ימחקו חלוקה
        ועריכות ידניות. ---- */
const LESSON_KEY = key("lesson");
export function loadLesson(cls) {
  const v = store.get(LESSON_KEY(cls));
  if (!v) return null;
  const ids = [...buildRoster(loadRosterList(cls)).map((s) => s.id), TEACHER.id];
  return unpackLesson(v, todayStamp(), ids);
}
// חלוקה שירדה מהמסך נמחקת גם מהמכשיר ("" נקרא כאין-כלום)
export const saveLesson = (cls, st, teacher) =>
  store.set(LESSON_KEY(cls), st.res ? packLesson(st, todayStamp(), teacher) : "");

/* ---- שינוי מקומי שעדיין לא הגיע לגיליון. הסימון הוא מה שמאפשר לסנכרון
        הבא להעלות את מה שנשאר מאחור במקום לדרוס אותו. ---- */
const PENDING_KEY = key("pending");
export const loadPending = (cls) => store.get(PENDING_KEY(cls)) === "1";
export const savePending = (cls, on) => store.set(PENDING_KEY(cls), on ? "1" : "0");

/* ---- סיכום השיעור הקודם, כפי שנקרא לאחרונה ממסמך התיעוד ---- */
const NOTE_KEY = key("note");
export function loadNote(cls) {
  const o = readJSON(NOTE_KEY(cls));
  return o && typeof o.date === "string" && Array.isArray(o.items) ? o : null;
}
export const saveNote = (cls, note) => writeJSON(NOTE_KEY(cls), note);

/* ---- האם המכשיר הזה כבר התחבר פעם לגוגל. רק אז שמירה מנסה להתחבר
        מחדש בעצמה — מי שבחר לעבוד בלי גיליון לא יקבל חלון של גוגל. ---- */
const GOOGLE_KEY = "ens-google";
export const usedGoogle = () => store.get(GOOGLE_KEY) === "1";
export const markGoogle = () => store.set(GOOGLE_KEY, "1");
