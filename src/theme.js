/* הפלטה וכמה עוזרי סגנון, במקום אחד.
   קודם הם היו משוכפלים בתוך App.jsx בעשרות אובייקטי style — וכל שינוי
   צבע דרש לרדוף אחריהם. */

export const C = {
  bg: "#161320",
  panel: "#211D2E",
  soft: "#2A2539",
  line: "#3A3350",
  ink: "#F3EFE7",
  dim: "#A79FBD",
  brass: "#E3A84C",
  teal: "#63B7A6",
  rose: "#D4737E",
};

/* צבע לפי כלי. כלי שאינו כאן — כלומר כל כלי מלודי — מקבל את צבע העמעום,
   וכך אפשר להוסיף כלי חדש בלי לגעת בעיצוב. */
export const TINT = { "תופים": C.rose, "בס": C.teal, "פסנתר": C.brass, "גיטרה": C.brass };

export const btn = (bg, fg) => ({
  background: bg,
  color: fg,
  border: "none",
  borderRadius: 10,
  padding: "11px 18px",
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
});

export const ghost = (fg = C.dim) => ({
  ...btn("transparent", fg),
  border: `1px solid ${C.line}`,
});

/* 16px ומעלה — מתחת לזה ספארי בטלפון מזוּם את הדף בכל לחיצה על שדה */
export const field = {
  background: C.bg,
  color: C.ink,
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  padding: "9px 10px",
  fontSize: 16,
  fontFamily: "inherit",
  minWidth: 0,
  boxSizing: "border-box",
};

export const panel = {
  background: C.panel,
  border: `1px solid ${C.line}`,
  borderRadius: 14,
  padding: 16,
};
