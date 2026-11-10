import { MAX_GROUP } from "./ensembles.js";
import { C, btn, ghost } from "./theme.js";

const TAP = { padding: "0 13px", minHeight: 44, fontSize: 14 }; // מטרת מגע נוחה באצבע

/**
 * שורת ההגדרות: מספר ההרכבים, תומר, הגיליון, והכניסה למסכים הנוספים.
 *
 * נדחסה לשורות בודדות: במסך טלפון היא תפסה 500px לפני שהתוכן התחיל,
 * וכפתור החלוקה נפל מתחת לקיפול.
 */
export default function Toolbar({ caps, k, onPickK, teacherOn, onTeacher, sync, onSync, panelOpen, onPanel, lessons, avg }) {
  const { on, busy, pending, msg } = sync;
  /* שלושה מצבים ולא שניים: מחובר, מנותק, ומחובר־אבל־יש־מה־להעלות. בלי
     השלישי שיעור שנשמר במכשיר בלבד נראה כמו שיעור שנשמר. ההסבר כתוב
     בשורה שמתחת ולא ב-title — בטלפון אין ריחוף. */
  const hint = pending
    ? "יש שינוי שנשמר במכשיר בלבד. לחיצה על ״ממתין לגיליון״ מעלה אותו."
    : !on && !msg
      ? "בלי חיבור לגיליון הפנקס נשמר רק במכשיר הזה."
      : "";
  const panelBtn = (name, label, closeLabel, extra) => (
    <button
      onClick={() => onPanel(name)}
      aria-expanded={panelOpen === name}
      style={{ ...ghost(), ...TAP, ...extra }}
    >
      {panelOpen === name ? closeLabel : label}
    </button>
  );

  return (
    <div style={{ maxWidth: 760, margin: "0 auto 12px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 7, color: C.dim, fontSize: 14 }}>
          הרכבים
          <select
            value={k}
            onChange={(e) => onPickK(Number(e.target.value))}
            style={{ background: C.soft, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: "0 9px", minHeight: 44, fontSize: 16, fontFamily: "inherit" }}
          >
            {/* לכל מספר כתוב מה הוא אומר בפועל: גודל ההרכב, וכמה יישבו
                בחוץ. קודם היה כאן רק "מומלץ", בלי שום דרך לדעת למה. */}
            {caps.playable.map((o) => (
              <option key={o.k} value={o.k}>
                {o.k} · {o.smallest === o.biggest ? `${o.biggest} נגנים` : `${o.smallest}–${o.biggest} נגנים`}
                {o.bench ? ` · ${o.bench} בחוץ` : ""}
                {o.k === caps.rec ? " · מומלץ" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={onTeacher}
          aria-pressed={teacherOn}
          style={{
            ...btn(teacherOn ? C.soft : "transparent", teacherOn ? C.ink : C.dim),
            border: `1px solid ${teacherOn ? C.teal + "88" : C.line}`,
            ...TAP,
          }}
          title="תומר תופס כיסא פסנתר בהרכב אחד, ומחליף תלמיד שהיה צריך לנגן פעמיים"
        >
          {teacherOn ? "✓ " : ""}תומר
        </button>
        <button
          onClick={onSync}
          disabled={busy}
          style={{
            ...btn("transparent", pending ? C.brass : on ? C.teal : C.dim),
            border: `1px solid ${pending ? C.brass : on ? C.teal + "88" : C.line}`,
            ...TAP,
          }}
        >
          {busy ? "מסנכרן…" : pending ? "⚠ ממתין לגיליון" : on ? "● גיליון" : "○ גיליון"}
        </button>
        {panelBtn("track", "מעקב", "סגור מעקב")}
        {panelBtn("roster", "רשימת הכיתה", "סגור רשימה")}
        {panelBtn("help", "איך זה עובד?", "סגור הסבר", { marginRight: "auto" })}
      </div>

      {(msg || hint || lessons > 0) && (
        <p role="status" style={{ color: C.dim, fontSize: 13, margin: "10px 0 0", lineHeight: 1.5 }}>
          {[msg || hint, lessons > 0 && `${lessons} שיעורים בפנקס · ממוצע ${avg} הרכבים לתלמיד`].filter(Boolean).join(" · ")}
        </p>
      )}

      {panelOpen === "help" && (
        <div style={{ color: C.dim, fontSize: 14, margin: "12px 0 0", lineHeight: 1.7, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          תופים, בס, כלי הרמוני וכלי מלודי בכל הרכב, ולכל היותר {MAX_GROUP} נגנים. מספר ההרכבים הוא הקטן ביותר שבו אף אחד
          לא יושב בחוץ — פחות הרכבים, יותר זמן נגינה לכל אחד. מי שנדרש ביותר מהרכב אחד מסומן במספר ההרכבים שלו, והפנקס
          דואג שזה יתחלף בין השיעורים. תומר נכנס להרכב אחד ואינו נספר בפנקס.
          {!lessons && " אחרי כל שיעור לחץ ״שמור״, וההגרלות הבאות יתקנו את מי שקופח."}
        </div>
      )}
    </div>
  );
}
