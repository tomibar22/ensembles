/* פענוח מסמך תיעוד השיעורים.
   בלי React ובלי דפדפן — נבדק ישירות ב-`npm test`. */

/* ============================ תיעוד השיעורים ============================ */

/* מסמך התיעוד של כל כיתה ב-Google Docs. הוא נכתב ביד, בנוסח קבוע: שורת
   תאריך ("5.10.26") ומתחתיה תבליטים של מה שנעשה. מכאן נשלף סיכום השיעור
   האחרון, כדי שיופיע מול המורה כשהוא פותח את האפליקציה. */

const SOFT_BREAK = String.fromCharCode(11);

/** ממיר את תשובת Docs API לשורות טקסט. תבליט מקבל "- " ושתי רווחים לכל רמת קינון. */
function docToLines(doc) {
  const out = [];
  for (const el of (doc && doc.body && doc.body.content) || []) {
    const para = el.paragraph;
    if (!para) continue;
    const text = (para.elements || [])
      .map((e) => (e.textRun && e.textRun.content) || "")
      .join("")
      .split(SOFT_BREAK) // Shift+Enter במסמך — שבירת שורה בתוך אותה פסקה
      .join(" ")
      .trim();
    if (!text) continue;
    const b = para.bullet;
    out.push(b ? "  ".repeat(b.nestingLevel || 0) + "- " + text : text);
  }
  return out;
}

const DATE_LINE = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/;

/** "5.10.26" → מספר שאפשר להשוות, או null אם השורה אינה תאריך */
function lessonDate(line) {
  const m = DATE_LINE.exec(line.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return (y < 100 ? 2000 + y : y) * 10000 + mo * 100 + d;
}

/**
 * השיעור האחרון במסמך: { date, items }, או null אם אין בו אף שורת תאריך.
 *
 * "אחרון" לפי התאריך ולא לפי המקום במסמך — יש מסמכים שבהם השיעור החדש
 * נכתב למעלה, ויש שבהם הוא נכתב למטה.
 */
function lastLesson(lines) {
  let best = null;
  let cur = null;
  for (const line of lines) {
    const key = lessonDate(line);
    if (key !== null) {
      cur = { date: line.trim(), key, items: [] };
      if (!best || key >= best.key) best = cur;
    } else if (cur) {
      cur.items.push(line);
    }
  }
  return best && { date: best.date, items: best.items };
}

export {
  SOFT_BREAK,
  docToLines,
  DATE_LINE,
  lessonDate,
  lastLesson,
};
