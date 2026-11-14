/* בניית הבקשות ל-Google Docs API מתוך בלוקי התיעוד. טהור — נבדק ישירות.
   המסמך נכתב מחדש כולו בכל סנכרון: המסד הוא מקור האמת, והמסמך הוא תצוגה שלו. */
import type { DocBlock } from "./derive";

export function docRequests(blocks: DocBlock[], endIndex: number): any[] {
  let text = "";
  const styles: any[] = [];
  const bullets: { start: number; end: number }[] = [];
  const range = (start: number, end: number) => ({ startIndex: 1 + start, endIndex: 1 + end });
  const para = (start: number, end: number, namedStyleType: string) =>
    styles.push({ updateParagraphStyle: { range: range(start, end), paragraphStyle: { namedStyleType }, fields: "namedStyleType" } });
  const bold = (start: number, end: number) =>
    styles.push({ updateTextStyle: { range: range(start, end), textStyle: { bold: true }, fields: "bold" } });

  for (const b of blocks) {
    const start = text.length;
    if (b.type === "field" || b.type === "link") {
      const label = `${b.label}: `;
      text += label + b.text + "\n";
      bold(start, start + label.length);
      if (b.type === "link")
        styles.push({
          updateTextStyle: {
            range: range(start + label.length, text.length - 1),
            textStyle: { link: { url: b.url } },
            fields: "link",
          },
        });
      continue;
    }
    text += b.text + "\n";
    if (b.type === "title") para(start, text.length, "TITLE");
    if (b.type === "h2") para(start, text.length, "HEADING_2");
    if (b.type === "bullet") {
      const last = bullets[bullets.length - 1];
      if (last && last.end === start) last.end = text.length;
      else bullets.push({ start, end: text.length });
    }
  }

  const all = range(0, text.length);
  const out: any[] = [];
  // מוחקים את התוכן הקודם (הפסקה האחרונה של מסמך אינה ניתנת למחיקה)
  if (endIndex > 2) out.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
  if (!text) return out;
  out.push({ insertText: { location: { index: 1 }, text } });
  // הפסקה שנשארה עלולה לשאת תבליט או כותרת מהגרסה הקודמת — מאפסים הכול
  out.push({ deleteParagraphBullets: { range: all } });
  out.push({
    updateParagraphStyle: {
      range: all,
      paragraphStyle: { namedStyleType: "NORMAL_TEXT", direction: "RIGHT_TO_LEFT" },
      fields: "namedStyleType,direction",
    },
  });
  out.push({ updateTextStyle: { range: all, textStyle: {}, fields: "bold,link,underline,foregroundColor" } });
  out.push(...styles);
  // אחרונים: יצירת תבליטים אינה מזיזה אינדקסים כשאין טאבים, אבל כך בטוח
  bullets.forEach((b) =>
    out.push({ createParagraphBullets: { range: range(b.start, b.end), bulletPreset: "BULLET_DISC_CIRCLE_SQUARE" } })
  );
  return out;
}
