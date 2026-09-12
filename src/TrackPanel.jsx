import { C, ghost, panel } from "./theme.js";

/**
 * מעקב וציונים — הפנקס ויומן הנוכחות באותה טבלה.
 *
 * הנתונים נרשמו תמיד; מה שהיה חסר זו הדרך לראות אותם בלי לפתוח את
 * הגיליון ביד. זמין גם בלי חלוקה, כי זה נתון של הכיתה ולא של השיעור.
 *
 * "גיבוי / שחזור" ו"אפס" יושבים כאן ולא בשורת השיעור: הם ניהול נתונים.
 */
export default function TrackPanel({ rows, lessons, sort, onSort, onTransfer, onReset }) {
  return (
    <section style={{ ...panel, marginTop: 12 }}>
      <div style={{ color: C.dim, fontSize: 14, marginBottom: 8 }}>
        {lessons} שיעורים בפנקס · מיון לפי
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        {[
          ["plays", "הרכבים"],
          ["absent", "חיסורים"],
          ["name", "שם"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => onSort(key)}
            aria-pressed={sort === key}
            style={{
              ...ghost(sort === key ? C.ink : C.dim),
              padding: "6px 11px",
              fontSize: 14,
              borderColor: sort === key ? C.teal + "88" : C.line,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* טבלה, ולא רשימה: לציונים צריך לראות את העמודות זו לצד זו.
          גולשת אופקית בתוך עצמה בלבד, כדי שגוף הדף לא יזוז בטלפון. */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15, minWidth: 340 }}>
          <thead>
            <tr style={{ color: C.dim, fontSize: 13, textAlign: "start" }}>
              <th style={{ textAlign: "start", padding: "0 0 6px" }}>תלמיד</th>
              <th style={{ padding: "0 6px 6px" }} title="בכמה הרכבים ניגן בסך הכול">הרכבים</th>
              <th style={{ padding: "0 6px 6px" }}>נוכחות</th>
              <th style={{ padding: "0 6px 6px" }}>חיסורים</th>
              <th style={{ padding: "0 6px 6px" }} title="הגיע אחרי שההרכבים כבר חולקו">איחורים</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: "6px 0" }}>
                  {e.name}
                  <span style={{ color: C.dim, fontSize: 12, marginInlineStart: 6 }}>{e.instrument}</span>
                </td>
                <td style={{ textAlign: "center", padding: "6px", color: e.plays === rows[0].plays && sort === "plays" ? C.teal : C.dim }}>
                  {e.plays}
                </td>
                <td style={{ textAlign: "center", padding: "6px", color: e.rate === null ? C.dim : e.rate < 80 ? C.rose : C.ink }}>
                  {e.rate === null ? "—" : `${e.rate}%`}
                </td>
                <td style={{ textAlign: "center", padding: "6px", color: e.absent ? C.rose : C.dim }}>{e.absent || "—"}</td>
                <td style={{ textAlign: "center", padding: "6px", color: e.late ? C.brass : C.dim }}>{e.late || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ color: C.dim, fontSize: 13, margin: "12px 0 0", lineHeight: 1.6 }}>
        הנוכחות מחושבת מתוך {lessons} השיעורים ששמורים בפנקס. ביומן נרשמות רק חריגות, ולכן תלמיד שהצטרף
        באמצע השנה ייראה נוכח גם בשיעורים שקדמו לו.
        {rows.some((e) => e.left > 0) &&
          ` ${rows.filter((e) => e.left).length} תלמידים יצאו באמצע שיעור לפחות פעם אחת.`}
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
        <button
          onClick={onTransfer}
          style={ghost()}
        >
          גיבוי / שחזור
        </button>
        {lessons > 0 && (
          <button onClick={onReset} style={ghost()} title="מאפס את הפנקס ואת יומן הנוכחות — לתחילת שנה">
            אפס הכול
          </button>
        )}
      </div>
    </section>
  );
}
