import { useState } from "react";
import ClassView from "./ClassView.jsx";
import { C, btn } from "./theme.js";
import { CLASSES } from "./ensembles.js";

/**
 * המעטפת: הכותרת ובחירת הכיתה. כל השאר — המצב, הסנכרון והמסכים — חי
 * ב-ClassView, שנבנה מחדש בכל החלפת כיתה. ה-`key` הוא העיקר כאן: בזכותו
 * אין מצב של כיתה אחת שיכול לדלוף לאחרת.
 */
export default function App() {
  const [cls, setCls] = useState(CLASSES[0]);
  return (
    <div dir="rtl" style={{ background: C.bg, minHeight: "100vh", padding: "22px 16px 48px", fontFamily: "'Heebo', system-ui, sans-serif", color: C.ink }}>
      <header style={{ maxWidth: 760, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 26, margin: 0 }}>חלוקת הרכבים</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {CLASSES.map((c) => (
            <button
              key={c}
              onClick={() => setCls(c)}
              aria-pressed={cls === c}
              style={{ ...btn(cls === c ? C.brass : C.soft, cls === c ? C.onBrass : C.ink), padding: "0 16px", minHeight: 44, fontSize: 15 }}
            >
              {c}
            </button>
          ))}
        </div>
      </header>
      <ClassView key={cls} cls={cls} />
    </div>
  );
}
