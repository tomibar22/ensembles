import { useState } from "react";
import { C } from "./theme.js";

/* סיכום השיעור הקודם, מתוך מסמך התיעוד של הכיתה. פתוח כל עוד אין חלוקה
   על המסך — זה הרגע שבו המורה מתכנן — ומתקפל לשורה אחת אחריה. */
export default function LessonNote({ last, err, stale, folded }) {
  const [open, setOpen] = useState(null); // null = לפי מצב החלוקה
  if (!last && !err) return null;
  const isOpen = open === null ? !folded : open;

  return (
    <section style={{ maxWidth: 760, margin: "0 auto 12px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: "10px 14px" }}>
      <button
        onClick={() => setOpen(!isOpen)}
        aria-expanded={isOpen}
        style={{ all: "unset", cursor: "pointer", display: "flex", width: "100%", alignItems: "baseline", gap: 8, fontSize: 15, color: C.ink }}
      >
        <span style={{ color: C.brass, fontWeight: 600 }}>בשיעור הקודם</span>
        {last && <span style={{ color: C.dim, fontSize: 14 }}>{last.date}</span>}
        <span style={{ color: C.dim, marginRight: "auto", fontSize: 13 }}>{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div style={{ marginTop: 8 }}>
          {last && last.items.length > 0 && (
            <ul style={{ margin: 0, paddingInlineStart: 20, lineHeight: 1.6, fontSize: 15 }}>
              {last.items.map((line, i) => {
                const depth = (/^ */.exec(line)[0].length / 2) | 0;
                return (
                  <li key={i} style={{ marginInlineStart: depth * 16, color: depth ? C.dim : C.ink }}>
                    {line.trim().replace(/^- /, "")}
                  </li>
                );
              })}
            </ul>
          )}
          {last && !last.items.length && <p style={{ margin: 0, color: C.dim, fontSize: 14 }}>אין פירוט לשיעור הזה במסמך.</p>}
          {(err || stale) && (
            <p style={{ margin: "8px 0 0", color: err ? C.rose : C.dim, fontSize: 13 }}>
              {err || "מהמכשיר — התחבר לגיליון כדי לרענן מהמסמך"}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
