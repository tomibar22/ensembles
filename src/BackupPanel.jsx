import { useState } from "react";
import { encodeLedger, decodeLedger } from "./ensembles.js";
import { C, btn } from "./theme.js";

/**
 * הפנקס כטקסט — להעתקה למקום בטוח, ולטעינה חזרה.
 *
 * טעינה מחליפה את הפנקס של הכיתה ונכתבת גם לגיליון (`onImport`). קודם
 * היא נשארה במכשיר בלי סימון, והסנכרון הבא דרס אותה.
 */
export default function BackupPanel({ cls, roster, ledger, onImport }) {
  const [text, setText] = useState(() => encodeLedger(cls, roster, ledger));
  const [note, setNote] = useState("");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNote("הועתק");
    } catch {
      setNote("סמן והעתק ידנית");
    }
  };
  const load = () => {
    try {
      const { ledger: next, dropped, added } = decodeLedger(cls, roster, text.trim());
      onImport(next);
      // מה השתנה ביחס לגיבוי — לא משנים היסטוריה בשקט
      const extra = [
        dropped ? `${dropped} מהגיבוי כבר לא ברשימה` : "",
        added ? `${added} תלמידים חדשים מתחילים מאפס` : "",
      ].filter(Boolean);
      setNote(`נטען: ${next.lessons} שיעורים` + (extra.length ? " · " + extra.join(" · ") : ""));
    } catch (e) {
      setNote("הטקסט לא תקין — " + (e.message || ""));
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ color: C.dim, fontSize: 14, marginBottom: 8, lineHeight: 1.6 }}>
        זה הפנקס של כיתה {cls} כטקסט. העתק ושמור אותו איפה שנוח — ואם האפליקציה תתחיל מאפס, הדבק אותו כאן ולחץ ״טען״.
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        dir="ltr"
        aria-label="הפנקס כטקסט"
        style={{
          width: "100%",
          minHeight: 110,
          background: C.bg,
          color: C.ink,
          border: `1px solid ${C.line}`,
          borderRadius: 10,
          padding: 10,
          fontSize: 16, // מתחת לזה ספארי מזוּם את הדף בלחיצה על השדה
          fontFamily: "ui-monospace, monospace",
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={copy} style={btn(C.soft, C.ink)}>
          העתק
        </button>
        <button onClick={load} style={btn(C.brass, C.onBrass)}>
          טען
        </button>
        {note && <span role="status" style={{ color: C.dim, fontSize: 14 }}>{note}</span>}
      </div>
    </div>
  );
}
