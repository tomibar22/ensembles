import { useState } from "react";
import { ATT_LABEL } from "./ensembles.js";
import { C, btn, ghost } from "./theme.js";

const TONE = { absent: C.rose, late: C.brass, left: C.dim };

/**
 * סוף השיעור: מה ייכתב ביומן הנוכחות, שמירה לפנקס וביטולה, ושיתוף
 * החלוקה. ניהול הנתונים (מעקב, גיבוי, איפוס) יושב במסך המעקב.
 *
 * היומן מוצג **לפני** השמירה: קודם הוא נכתב לגיליון בלי שהמורה ראה
 * אותו, ומי שסומן חסר בטעות ותוקן אחרי החלוקה נרשם כמאחר — בלי דרך
 * לתקן חוץ מלמחוק שורה בגיליון. לחיצה על איחור מבטלת אותו.
 */
export default function SaveBar({ saved, hasBase, entries, shareText, onOnTime, onSave, onUndoSave }) {
  const [note, setNote] = useState("");
  const late = entries.some((e) => e.status === "late");

  /* חלון השיתוף של הטלפון כשיש, ואחרת העתקה. שיתוף שנכשל (לא בוטל)
     נופל גם הוא להעתקה, כדי שתמיד יהיה מה להדביק. */
  const share = async () => {
    if (navigator.share) {
      try {
        return await navigator.share({ text: shareText });
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setNote("החלוקה הועתקה — אפשר להדביק אותה בכל מקום");
    } catch {
      setNote("הדפדפן לא מרשה לשתף או להעתיק מכאן");
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      {entries.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: C.dim, fontSize: 13, marginBottom: 6 }}>
            יירשם ביומן הנוכחות{late ? " · לחיצה על איחור מבטלת אותו, למי שסומן חסר בטעות" : ""}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {entries.map((e) => {
              const label = `${e.name} · ${ATT_LABEL[e.status]}`;
              const look = { ...ghost(C.ink), borderColor: TONE[e.status] + "88", borderRadius: 999, padding: "0 13px", minHeight: 40, fontSize: 14, fontWeight: 400 };
              return e.status === "late" ? (
                <button key={e.id} onClick={() => onOnTime(e.id)} aria-label={`${label} — בטל את האיחור`} style={look}>
                  {label} <span style={{ color: C.dim }}>✕</span>
                </button>
              ) : (
                <span key={e.id} style={{ ...look, cursor: "default", display: "inline-flex", alignItems: "center" }}>
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={onSave} disabled={saved} style={btn(saved ? C.soft : C.brass, saved ? C.dim : C.onBrass)}>
          {saved ? "נשמר בפנקס" : hasBase ? "עדכן את השיעור בפנקס" : "שמור את השיעור בפנקס"}
        </button>
        {hasBase && (
          <button onClick={onUndoSave} style={ghost()}>
            בטל שמירה
          </button>
        )}
        <button onClick={share} style={{ ...ghost(C.ink), marginRight: "auto" }}>
          שתף חלוקה
        </button>
      </div>
      {note && <p role="status" style={{ color: C.dim, fontSize: 13, margin: "8px 0 0" }}>{note}</p>}
    </div>
  );
}
