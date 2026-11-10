/* רשימת הכיתה והקבועים של החלוקה: כלים, תפקידים, תקרות, ובניית הרשימה
   מהשורות שבגיליון. כל שאר המודולים נשענים על זה.
   בלי React ובלי דפדפן — נבדק ישירות ב-`npm test`. */

/* ====================== רשימת התלמידים ======================

   הרשימה היא נתון, לא קוד: מקור האמת הוא הגיליון (לשונית "תלמידים
   <כיתה>"), עותק שלה שמור במכשיר, והיא נערכת מתוך האפליקציה. בקוד אין
   שמות של תלמידים — הריפו ציבורי, וכך גם קובץ ה-JS של האתר. מכשיר חדש
   מתחיל מרשימה ריקה ומקבל אותה בחיבור הראשון לגיליון.

   שורה: ["שם פרטי", "שם משפחה", ["כלי ראשי"], "מזהה", ["כלי משני"]]
   ================================================================== */

const ROLE_OF = { "תופים": "drums", "בס": "bass", "פסנתר": "harmony", "גיטרה": "harmony" };
const UNIQUE = new Set(["תופים", "בס", "פסנתר", "גיטרה"]);
/* סדר התווים: קודם הריתמיקה, ואחריה הכלים המלודיים מהנמוך לגבוה.
   משמש גם לסידור הנגנים בתוך הרכב וגם לחלוקת לוח הנוכחות לפי כלים,
   כדי שהעין תמצא כלי באותו מקום בשני המסכים. */
const ORDER = [
  "תופים",
  "בס",
  "פסנתר",
  "גיטרה",
  "טרומבון",
  "טנור",
  "אלט",
  "חצוצרה",
  "חליל",
  "שירה",
];
const orderOf = (i) => (ORDER.indexOf(i) === -1 ? 99 : ORDER.indexOf(i));
const CLASSES = ["י״א", "ט׳"];
const KEYS = { "ט׳": "ens-ledger-g9", "י״א": "ens-ledger-g11" };
const TABS = { "ט׳": "g9", "י״א": "g11" }; // לשוניות בגיליון
/* תלמיד לא ינגן ביותר משני הרכבים באותו שיעור — אלא אם אין ברירה:
   הדרישה ל-REQUIRED בכל הרכב גוברת. בסיסט יחיד בכיתה ינגן
   בכל ההרכבים, כי אחרת חלקם יישארו בלי בס. ההקלה תקפה רק לתפקידים
   החיוניים; צירוף מלודי והעשרה לעולם לא יחרגו. */
const MAX_LOAD = 2;
/* ארבעת התפקידים שכל הרכב חייב: תופים, בס, כלי הרמוני וכלי מלודי.
   מהם נגזר גם גודל ההרכב המינימלי — פחות מארבעה נגנים אינו הרכב. */
const REQUIRED = ["drums", "bass", "harmony", "melody"];
const ROLE_LABEL = {
  drums: "מתופפים",
  bass: "בסיסטים",
  harmony: "כלים הרמוניים",
  melody: "כלים מלודיים",
};
const MIN_GROUP = REQUIRED.length;
const MAX_GROUP = 7; // מעבר לזה כבר לא באמת מנגנים יחד, רק יושבים
const MAX_GROUPS = 5; // יותר מזה לא מנוהל בשיעור אחד
/* מחיר של תלמיד שיושב בחוץ, בניקוד החלוקה. גדול מכל מה שהפנקס יכול
   לצבור, כדי ששום שיקול אחר לא יצדיק ספסל שאפשר היה להימנע ממנו. */
const BENCH_COST = 1e6;
const TEACHER = {
  id: "__teacher",
  name: "תומר",
  instruments: ["פסנתר"],
  roles: ["harmony"],
  teacher: true,
};

/**
 * האיבר הרביעי בכל שורה הוא המזהה, והוא הדבר היחיד ששומר על ההיסטוריה.
 * הוא לא נגזר מהשם בכוונה: כך אפשר לתקן שם שנכתב לא נכון בלי לאפס לתלמיד
 * את הפנקס. שורה בלי מזהה נופלת חזרה לנגזרת הישנה, כדי לא לשבור נתונים.
 * את המזהה של תלמיד קיים אין לשנות — הוא המפתח בגיליון ובגיבויים.
 */
function buildRoster(list) {
  const c = {};
  list.forEach(([f]) => (c[f] = (c[f] || 0) + 1));
  const roster = list.map(([first, last, inst, id, backup = []]) => ({
    id: id || `${first}-${last}`,
    name: c[first] > 1 ? `${first} ${last}` : first,
    instruments: inst,
    roles: [...new Set(inst.map((x) => ROLE_OF[x] || "melody"))],
    // כלים משניים: רזרבה בלבד. נכנסים רק כשאין אף נוכח שזה כליו הראשי.
    backup,
    backupRoles: [...new Set(backup.map((x) => ROLE_OF[x] || "melody"))],
  }));
  const ids = new Set(roster.map((s) => s.id));
  if (ids.size !== roster.length) throw new Error("יש מזהה כפול ברשימת התלמידים");
  return roster;
}
/* מי יכול למלא תפקיד חיוני. כלי משני הוא רזרבה: הוא נכנס רק כשאין אף
   נוכח שזה כליו הראשי — כלומר בחיסור, ולא כדי להקל על מי שכן נוכח. */
const forRole = (pool, role) => {
  const primary = pool.filter((s) => s.roles.includes(role));
  return primary.length ? primary : pool.filter((s) => (s.backupRoles || []).includes(role));
};

/* התפקידים החיוניים שאין להם אף נגן נוכח — הדבר היחיד שחוסם חלוקה לגמרי.
   נגן אחד בתפקיד מספיק לכמה הרכבים שצריך, ולכן מספר הנגנים בתפקיד אינו
   מגביל את מספר ההרכבים; רק תפקיד ריק לגמרי חוסם.
   שתי הפונקציות האלה עולות לכאן, לפני הבדיקה שמשתמשת בהן: ערך שנקרא
   לפני שהוגדר הוא הדפוס שכבר הפיל את האפליקציה יותר מפעם אחת. */
const emptyRoles = (pool) => REQUIRED.filter((r) => !forRole(pool, r).length);

/* =================== הרשימה כנתון: גיליון ועריכה ===================

   הרשימה חיה בלשונית "תלמידים <כיתה>" בגיליון, ונערכת גם מתוך
   האפליקציה. אותה צורת שורה בגיליון, במטמון ובעורך, כדי ש-buildRoster
   יעבוד על כולם. */

const ROSTER_TAB = (cls) => `תלמידים ${cls}`;
const ROSTER_HEAD = ["שם פרטי", "שם משפחה", "כלי", "כלי משני", "מזהה"];

/* הכלים המוכרים, לבורר בממשק. כלי שאינו ברשימה עדיין עובד — הוא נחשב
   מלודי ולא ייחודי — ולכן אפשר להוסיף כלי חדש בלי לגעת בקוד. */
const INSTRUMENTS = ORDER;

const splitInst = (v) =>
  String(v || "")
    .split(/[,،]/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * התלמידים מקובצים לפי כלי, בסדר התווים — כמו מפתחות בפרטיטורה.
 * ברשימה של 22 שמות רצופים המורה מחפש שם; מקובץ לפי כלי הוא סורק קבוצה.
 *
 * כלי שאינו ב-ORDER אינו נעלם אלא מופיע בסוף: מורה שהוסיף קלרינט חייב
 * לראות את התלמיד שלו בלוח הנוכחות.
 */
function byInstrument(roster) {
  const groups = new Map();
  roster.forEach((s) => {
    const inst = s.instruments[0] || "";
    if (!groups.has(inst)) groups.set(inst, []);
    groups.get(inst).push(s);
  });
  return [...groups.entries()]
    .map(([instrument, students]) => ({ instrument, students }))
    .sort(
      (a, b) =>
        orderOf(a.instrument) - orderOf(b.instrument) ||
        a.instrument.localeCompare(b.instrument, "he")
    );
}

/** שורות הגיליון → רשימת שורות */
function rowsToRoster(rows) {
  return (rows || [])
    .slice(1)
    .filter((r) => r && (String(r[0] || "").trim() || String(r[4] || "").trim()))
    .map((r) => [
      String(r[0] || "").trim(),
      String(r[1] || "").trim(),
      splitInst(r[2]),
      String(r[4] || "").trim(),
      splitInst(r[3]),
    ]);
}

/** רשימת שורות → שורות הגיליון */
function rosterToRows(list) {
  return [
    ROSTER_HEAD,
    ...list.map(([first, last, inst, id, backup = []]) => [
      first,
      last || "",
      (inst || []).join(", "),
      (backup || []).join(", "),
      id,
    ]),
  ];
}

/**
 * מזהה לתלמיד חדש. המזהה הוא המפתח של כל ההיסטוריה ואין לשנות אותו
 * אחר כך, ולכן הוא נוצר פעם אחת — כאן — ומוודא ייחודיות מול הרשימה.
 */
function makeId(first, last, list) {
  const taken = new Set(list.map((r) => r[3]).filter(Boolean));
  const base = `${String(first).trim()}-${String(last || "").trim()}`.replace(/-$/, "");
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * משלים מזהה לכל שורה שאין לה — ורק לה.
 *
 * לתלמיד חדש אין מזהה עד שהוא נשמר, ולתלמיד קיים המזהה הוא כל ההיסטוריה
 * שלו ואין לגעת בו לעולם. שתי הדרישות האלה חיות באותה פונקציה כדי שלא
 * ייווצר מסלול שמחדש מזהה לתלמיד קיים בטעות.
 */
function assignIds(list) {
  return list.reduce((acc, row) => {
    const [first, last, inst, id, backup = []] = row;
    const name = String(first || "").trim();
    return [...acc, [name, String(last || "").trim(), inst || [], id || makeId(name, last, acc), backup]];
  }, []);
}

/**
 * מה לא תקין ברשימה. מוחזר כרשימת הודעות ולא כזריקה, כדי שהממשק יוכל
 * להראות את כולן יחד — מורה שמזין כיתה שלמה לא אמור לגלות שגיאה אחת
 * בכל פעם.
 */
function rosterProblems(list) {
  const out = [];
  const seen = new Map();
  list.forEach(([first, , inst, id, backup = []], i) => {
    const where = String(first || "").trim() || `שורה ${i + 1}`;
    if (!String(first || "").trim()) out.push(`שורה ${i + 1}: אין שם פרטי`);
    if (!(inst || []).length) out.push(`${where}: אין כלי`);
    if (!id) out.push(`${where}: אין מזהה`);
    else if (seen.has(id)) out.push(`${where}: מזהה כפול עם ${seen.get(id)}`);
    else seen.set(id, where);
    (backup || []).forEach((b) => {
      if ((inst || []).includes(b)) out.push(`${where}: ${b} מופיע גם כראשי וגם כמשני`);
    });
  });
  /* הרכב חייב תופים, בס, כלי הרמוני וכלי מלודי — כיתה שאין בה אחד מהם
     לא תוכל להתחלק כלל, ועדיף לומר את זה בעריכה מאשר בשיעור.
     נבנה רק ממה שתקין: buildRoster זורק על מזהה כפול, ובדיקה שקורסת
     במקום לדווח הייתה מסתירה מהמורה את שאר הבעיות ברשימה. */
  const clean = [];
  const used = new Set();
  list.forEach((r) => {
    if (r[3] && !used.has(r[3]) && (r[2] || []).length) (used.add(r[3]), clean.push(r));
  });
  if (clean.length)
    emptyRoles(buildRoster(clean)).forEach((r) =>
      out.push(`אין בכיתה אף ${ROLE_LABEL[r]} — אי אפשר יהיה לחלק`)
    );
  return out;
}

/**
 * הרשימה כפי שנקראה מהגיליון, אחרי בדיקה: `{ list, problems, ok }`.
 *
 * הגיליון נערך גם ביד, ושורה שהועתקה נושאת את המזהה של המקור. `ok` אומר
 * אם אפשר לבנות מהרשימה כיתה בכלל — רשימה שאינה `ok` אסור לשמור במטמון:
 * buildRoster זורק עליה ברנדר, וכך כל רענון של הדף קרס מחדש.
 */
function sheetRoster(rows) {
  const list = assignIds(rowsToRoster(rows));
  let ok = list.length > 0;
  try {
    buildRoster(list);
  } catch {
    ok = false;
  }
  return { list, problems: rosterProblems(list), ok };
}

/* שני יסודות של הפנקס שגם החלוקה נשענת עליהם */
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const EMPTY = { plays: {}, pairs: {}, lessons: 0 };

export {
  ROLE_OF,
  UNIQUE,
  ORDER,
  orderOf,
  CLASSES,
  KEYS,
  TABS,
  MAX_LOAD,
  REQUIRED,
  ROLE_LABEL,
  MIN_GROUP,
  MAX_GROUP,
  MAX_GROUPS,
  BENCH_COST,
  TEACHER,
  buildRoster,
  forRole,
  emptyRoles,
  ROSTER_TAB,
  ROSTER_HEAD,
  INSTRUMENTS,
  splitInst,
  byInstrument,
  rowsToRoster,
  rosterToRows,
  makeId,
  assignIds,
  rosterProblems,
  sheetRoster,
  pairKey,
  EMPTY,
};
