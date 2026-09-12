import { BENCH } from "./ensembles.js";
import { C, TINT } from "./theme.js";

function Chip({ m, load, onClick, state }) {
  const tint = m.teacher ? C.teal : TINT[m.playing] || C.dim;
  const picked = state === "selected";
  const blocked = state === "blocked";
  return (
    <button
      onClick={onClick}
      aria-pressed={picked}
      title={picked ? "לחץ שוב לביטול" : "לחץ כדי להחליף"}
      style={{
        font: "inherit",
        color: "inherit",
        cursor: "pointer",
        opacity: blocked ? 0.3 : 1,
        transition: "opacity .12s",
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 40,
        borderRadius: 999,
        background: picked
          ? C.brass + "2E"
          : m.slot !== "melody"
            ? "rgba(255,255,255,0.06)"
            : "transparent",
        border: picked
          ? `2px solid ${C.brass}`
          : `1px ${m.teacher ? "dashed" : "solid"} ${m.slot !== "melody" ? tint + "66" : C.line}`,
        padding: picked ? "0 12px" : "0 13px",
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 500 }}>{m.name}</span>
      {m.teacher && <span style={{ color: C.teal, fontSize: 12 }}>מורה</span>}
      <span style={{ color: tint, fontSize: 14 }}>{m.playing}</span>
      {load > 1 && (
        <span
          title={`מנגן ב-${load} הרכבים היום`}
          style={{
            background: C.brass + "26",
            color: C.brass,
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 5,
            padding: "2px 5px",
            alignSelf: "center",
          }}
        >
          ×{load}
        </span>
      )}
    </button>
  );
}

/**
 * ההרכבים על המסך, והספסל מתחתיהם.
 *
 * העריכה הידנית עובדת כאן: לחיצה על תלמיד בוחרת אותו, ואז כל מי
 * שההחלפה איתו אינה אפשרית מעומעם — עדיף להראות את זה מראש מאשר לתת
 * ללחוץ ולקבל סירוב.
 */
export default function Groups({ res, sel, chipState, onPick }) {
  return (
    <>
        {(
          <p style={{ color: sel ? C.brass : C.dim, fontSize: 13, margin: "0 0 10px", lineHeight: 1.5 }}>
            {sel
              ? "בחר עם מי להחליף — מי שמסומן חיוור אינו אפשרי, כי זה היה שובר הרכב. לחיצה חוזרת מבטלת."
              : "אפשר לערוך ידנית: לחץ על תלמיד ואז על מי שתרצה להחליף אותו איתו."}
          </p>
        )}

        {
          res.groups.map((g, i) => (
            <section key={i} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h2 style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: "'Frank Ruhl Libre', serif", fontSize: 19, margin: 0 }}>
                  הרכב
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background: C.brass,
                      color: "#241B08",
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  >
                    {i + 1}
                  </span>
                </h2>
                <span style={{ color: C.dim, fontSize: 13 }}>{g.length} נגנים</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {g.map((m) => (
                  <Chip
                    key={m.id + m.playing}
                    m={m}
                    load={res.load[m.id] || 1}
                    state={chipState(i, m.id)}
                    onClick={() => onPick(i, m)}
                  />
                ))}
              </div>
            </section>
          ))}

        {res.bench.length > 0 && (
          <section style={{ border: `1px dashed ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <div style={{ color: C.dim, fontSize: 14, marginBottom: 8 }}>יושבים היום (הכי הרבה הרכבים עד עכשיו) — יקבלו עדיפות בשיעור הבא</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {res.bench.map((st) => {
                const state = chipState(BENCH, st.id);
                return (
                  <button
                    key={st.id}
                    onClick={() => onPick(BENCH, st)}
                    aria-pressed={state === "selected"}
                    title="לחץ כדי להחליף עם נגן בהרכב"
                    style={{
                      font: "inherit",
                      color: "inherit",
                      cursor: "pointer",
                      minHeight: 40,
                      padding: "0 13px",
                      borderRadius: 999,
                      fontSize: 15,
                      background: state === "selected" ? C.brass + "2E" : "transparent",
                      border: state === "selected" ? `2px solid ${C.brass}` : `1px solid ${C.line}`,
                      opacity: state === "blocked" ? 0.3 : 1,
                    }}
                  >
                    {st.name} <span style={{ color: C.dim, fontSize: 13 }}>{st.instruments[0]}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
    </>
  );
}
