/* יומן הנוכחות: חיסורים, איחורים ומי שיצא באמצע.
   בלי React ובלי דפדפן — נבדק ישירות ב-`npm test`. */

/* ============================ יומן נוכחות ============================ */

const ATT_LABEL = { present: "נוכח", late: "איחור", absent: "חיסור", left: "יצא" };
const ATT_TAB = (cls) => `נוכחות ${cls}`;

/**
 * מצב הנוכחות של כל תלמיד בשיעור, מתוך השוואה בין מי שסומן חסר בזמן
 * החלוקה לבין מי שסומן חסר בסופו:
 *   סומן חסר ונשאר חסר   → חיסור
 *   סומן חסר ואז הוחזר    → איחור (הגיע אחרי שההרכבים כבר חולקו)
 *   היה נוכח ואז סומן חסר → יצא באמצע
 *   אחרת                  → נוכח
 */
function attendanceOf(roster, absentAtDraw, absentNow) {
  return roster.map((s) => {
    const was = absentAtDraw.has(s.id);
    const now = absentNow.has(s.id);
    return {
      id: s.id,
      name: s.name,
      status: was ? (now ? "absent" : "late") : now ? "left" : "present",
    };
  });
}

/* ביומן נרשמות רק החריגות. מי שהיה נוכח לכל אורך השיעור לא נרשם —
   אחרת היומן היה מתמלא בשורות שאין בהן מידע. */
function lessonAttendance(roster, absentAtDraw, absentNow, lesson, date) {
  return attendanceOf(roster, absentAtDraw, absentNow)
    .filter((e) => e.status !== "present")
    .map((e) => ({ date, lesson, id: e.id, name: e.name, status: e.status }));
}

/* שמירה חוזרת של אותו שיעור מחליפה את רשומותיו, ולא מוסיפה כפילויות */
function mergeAttendance(log, lesson, entries) {
  return [...log.filter((e) => e.lesson !== lesson), ...entries];
}

function attToRows(log) {
  return [
    ["תאריך", "שיעור", "תלמיד", "מזהה", "סטטוס"],
    ...[...log]
      .sort((a, b) => a.lesson - b.lesson || a.name.localeCompare(b.name, "he"))
      .map((e) => [e.date, e.lesson, e.name, e.id, ATT_LABEL[e.status] || e.status]),
  ];
}

/**
 * מרענן את שמות התצוגה ביומן לפי הרשימה הנוכחית.
 *
 * השם הוא השתקפות של הרשימה ולא נתון עצמאי, אבל הוא משוכפל גם ללשונית
 * הפנקס וגם ליומן הנוכחות — שתיהן מזוהות לפי מזהה, והשם בהן הוא עותק
 * שנכתב ברגע השמירה. בלי רענון, תיקון שם נשאר רק בלשונית התלמידים:
 * כך שם ישן נשאר בלשונית הפנקס ובשורות היומן אחרי שכבר תוקן ברשימה,
 * והמורה רואה בגיליון שם שהוא כבר שינה.
 *
 * מי שהוסר מהרשימה שומר על השם שנרשם לו — אין לנו טוב ממנו, ומחיקתו
 * הייתה הופכת שורת חיסור ישנה לשורה בלי שם.
 */
function renameInAtt(log, roster) {
  const byId = Object.fromEntries(roster.map((s) => [s.id, s.name]));
  return (log || []).map((e) =>
    byId[e.id] && byId[e.id] !== e.name ? { ...e, name: byId[e.id] } : e
  );
}

function rowsToAtt(rows) {
  const byLabel = Object.fromEntries(Object.entries(ATT_LABEL).map(([k, v]) => [v, k]));
  return (rows || [])
    .slice(1)
    .filter((r) => r && r[3])
    .map((r) => ({
      date: r[0] || "",
      lesson: Number(r[1]) || 0,
      name: r[2] || "",
      id: String(r[3]).trim(),
      status: byLabel[String(r[4] || "").trim()] || "absent",
    }));
}

/**
 * סיכום לכל תלמיד, לצורך מעקב וציונים.
 *
 * הנתונים כבר נרשמים — ביומן הנוכחות ובפנקס — אבל עד עכשיו הדרך היחידה
 * לראות אותם הייתה לפתוח את הגיליון ביד.
 *
 * ביומן נרשמות רק חריגות, ולכן הנוכחות מחושבת בחיסור: כל שיעור שלא
 * נרשם בו חיסור הוא שיעור שהתלמיד היה בו. תלמיד שנוסף באמצע השנה ייראה
 * לכן נוכח בשיעורים שקדמו לו — אין לנו תאריך הצטרפות, ועדיף לומר את זה
 * בממשק מאשר להמציא נתון.
 */
function attendanceSummary(roster, log, ledger) {
  const lessons = ledger.lessons || 0;
  const byId = {};
  (log || []).forEach((e) => {
    const b = (byId[e.id] ||= { absent: 0, late: 0, left: 0 });
    if (b[e.status] !== undefined) b[e.status] += 1;
  });
  return roster.map((s) => {
    const b = byId[s.id] || { absent: 0, late: 0, left: 0 };
    const present = Math.max(0, lessons - b.absent);
    return {
      id: s.id,
      name: s.name,
      instrument: s.instruments[0] || "",
      lessons,
      present,
      absent: b.absent,
      late: b.late,
      left: b.left,
      plays: ledger.plays[s.id] || 0,
      // אחוז נוכחות. בלי שיעורים כלל אין מה להציג, ו-100% היה שקר נוח.
      rate: lessons ? Math.round((present / lessons) * 100) : null,
    };
  });
}

export {
  ATT_LABEL,
  ATT_TAB,
  attendanceOf,
  lessonAttendance,
  mergeAttendance,
  attToRows,
  renameInAtt,
  rowsToAtt,
  attendanceSummary,
};
