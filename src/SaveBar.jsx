import { C, btn } from "./theme.js";

/**
 * פעולות השיעור עצמו: שמירה לפנקס וביטולה. ניהול הנתונים (מעקב, גיבוי,
 * איפוס) יושב במסך המעקב.
 */
export default function SaveBar({ saved, hasBase, onSave, onUndoSave }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
      <button onClick={onSave} disabled={saved} style={btn(saved ? C.soft : C.brass, saved ? C.dim : C.onBrass)}>
        {saved ? "נשמר בפנקס" : hasBase ? "עדכן את השיעור בפנקס" : "שמור את השיעור בפנקס"}
      </button>
      {hasBase && (
        <button
          onClick={onUndoSave}
          style={{ ...btn("transparent", C.dim), border: `1px solid ${C.line}` }}
          title="מחזיר את הפנקס בדיוק למצב שלפני השיעור הזה"
        >
          בטל שמירה
        </button>
      )}
    </div>
  );
}
