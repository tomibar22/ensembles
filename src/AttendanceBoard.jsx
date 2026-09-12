import { ROLE_LABEL, byInstrument } from "./ensembles.js";
import { C, TINT, btn, ghost } from "./theme.js";

const WRAP = {
  maxWidth: 760,
  margin: "0 auto 16px",
  background: C.panel,
  border: `1px solid ${C.line}`,
  borderRadius: 14,
  padding: 16,
};

/**
 * "מי כאן היום?" — השלב שלפני החלוקה, וגם הדרך לעדכן נוכחות באמצע השיעור.
 *
 * פתוח כל עוד אין חלוקה על המסך, ומתקפל לשורת סיכום אחריה: אחרי החלוקה
 * ההרכבים הם מה שהמורה צריך לראות, לא רשימת 22 שמות.
 *
 * כפתור החלוקה דביק לתחתית המסך כל עוד הלוח פתוח — ברשימה של 22 שמות
 * הוא נפל מתחת לקיפול בטלפון.
 */
export default function AttendanceBoard({
  roster,
  absent,
  present,
  open,
  caps,
  gaps,
  k,
  hasDraw,
  onToggle,
  onClearAbsent,
  onOpen,
  onDraw,
}) {
  if (!open)
    return (
      <section style={WRAP}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, color: absent.size ? C.rose : C.dim }}>
            {absent.size ? `${present.length}/${roster.length} נוכחים` : "כולם נוכחים"}
          </span>
          <button onClick={onOpen} style={{ ...ghost(C.ink), padding: "9px 13px", fontSize: 14 }}>
            שנה נוכחות
          </button>
          <button
            onClick={onDraw}
            style={{ ...btn(C.teal, "#0C2320"), padding: "9px 15px", fontSize: 15, marginRight: "auto" }}
          >
            חלק מחדש
          </button>
        </div>
      </section>
    );

  return (
    <section style={WRAP}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 20, margin: 0 }}>מי כאן היום?</h2>
        <span style={{ color: absent.size ? C.rose : C.dim, fontSize: 14 }}>
          {absent.size ? `${present.length} מתוך ${roster.length}` : "כולם"}
        </span>
      </div>
      <div style={{ color: C.dim, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
        לחץ על מי שלא הגיע. נעדר לא נכנס לחלוקה ולא צובר הרכבים, ולכן תהיה לו עדיפות בשיעור הבא.
      </div>
      {/* מקובץ לפי כלי, בסדר התווים. שם הכלי עבר מ-22 קפסולות לתשע
          כותרות — הקפסולות צרות יותר, והעין סורקת קבוצה במקום לחפש שם. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {byInstrument(roster).map(({ instrument, students }) => {
          const tint = TINT[instrument] || C.dim;
          const missing = students.filter((s) => absent.has(s.id)).length;
          return (
            <div key={instrument} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div
                style={{
                  flex: "0 0 58px",
                  textAlign: "start",
                  color: tint,
                  fontSize: 13,
                  // מיושר לאמצע הקפסולה הראשונה בשורה, לא לראשה
                  lineHeight: "44px",
                  whiteSpace: "nowrap",
                }}
              >
                {instrument}
                {/* כל הקבוצה חסרה — זה מה שמסכן את החלוקה, ולכן מסומן */}
                {missing === students.length && (
                  <span style={{ color: C.rose, marginInlineStart: 4 }}>·</span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1, minWidth: 0 }}>
                {students.map((s) => {
                  const out = absent.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => onToggle(s.id)}
                      aria-pressed={out}
                      style={{
                        display: "flex",
                        // center ולא baseline: עם minHeight, baseline מצמיד
                        // את הטקסט לראש הקפסולה במקום למרכז אותה
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: 44, // מטרת מגע נוחה באצבע
                        padding: "0 13px",
                        borderRadius: 999,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: 16,
                        background: out ? "transparent" : "rgba(255,255,255,0.06)",
                        border: `1px solid ${out ? C.line : tint + "66"}`,
                        color: out ? C.dim : C.ink,
                        textDecoration: out ? "line-through" : "none",
                        opacity: out ? 0.65 : 1,
                      }}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {absent.size > 0 && (
        <p style={{ color: C.dim, fontSize: 13, margin: "12px 0 0", lineHeight: 1.6 }}>
          {present.length} נוכחים · אפשר עד {caps.max} הרכבים
          {gaps.length ? ` — אין ${gaps.map((r) => ROLE_LABEL[r]).join(" ואין ")} נוכחים` : ""}.
        </p>
      )}
      {/* דביק: ברשימה של 22 שמות הכפתור נפל מתחת לקיפול במסך טלפון */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          marginTop: 14,
          position: "sticky",
          bottom: "max(10px, env(safe-area-inset-bottom))",
          zIndex: 2,
        }}
      >
        <button
          onClick={onDraw}
          style={{ ...btn(C.teal, "#0C2320"), minHeight: 48, boxShadow: "0 6px 20px rgba(0,0,0,0.45)" }}
        >
          {hasDraw ? "חלק מחדש" : `חלק את ${present.length} הנוכחים ל-${k} הרכבים`}
        </button>
        {absent.size > 0 && (
          <button onClick={onClearAbsent} style={{ ...ghost(), padding: "8px 14px", fontSize: 14 }}>
            כולם נוכחים
          </button>
        )}
      </div>
    </section>
  );
}
