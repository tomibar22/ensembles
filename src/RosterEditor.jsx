import { useState } from "react";
import { INSTRUMENTS, SEED, assignIds, rosterProblems } from "./ensembles.js";
import { C, btn, ghost, field, panel } from "./theme.js";

/**
 * ניהול רשימת הכיתה — הוספה, עריכה והסרה של תלמידים וכליהם.
 *
 * הרשימה הייתה עד היום קבועה בקוד, ובכל ספטמבר נכנסים תלמידים חדשים
 * לט׳ ולי״א. מורה לא אמור לערוך JavaScript ולדחוף ל-git כדי לרשום כיתה.
 *
 * העריכה נעשית על טיוטה מקומית ונשמרת בבת אחת: כך אפשר להזין כיתה שלמה
 * בלי שכל הקלדה תיגע בגיליון, ואפשר לבטל.
 *
 * המזהה נוצר פעם אחת בהוספה ואינו משתנה לעולם — הוא המפתח של הפנקס
 * ושל יומן הנוכחות, ושינוי שלו היה מוחק לתלמיד את כל ההיסטוריה.
 */
export default function RosterEditor({ cls, list, onSave, onCancel, busy }) {
  const [draft, setDraft] = useState(() => list.map((r) => [...r]));
  const [note, setNote] = useState("");

  /* המזהה מושלם לפני האימות ולא אחריו: לשורה חדשה עוד אין מזהה, ובלי
     ההשלמה כל תלמיד שנוסף היה נראה שגוי עד לשמירה — והשמירה נעולה. */
  const filled = assignIds(draft);
  const problems = rosterProblems(filled);
  const edit = (i, fn) =>
    setDraft((d) => d.map((row, j) => (j === i ? fn([...row]) : row)));

  const setText = (i, col, v) => edit(i, (row) => ((row[col] = v), row));
  const setInst = (i, col, v) =>
    edit(i, (row) => ((row[col] = v.trim() ? [v.trim()] : []), row));

  const add = () => setDraft((d) => [...d, ["", "", [], "", []]]);

  /* שחזור לרשימה המקורית של הכיתה.
     קיים בשביל מצב שבו הרשימה התקלקלה — למשל סנכרון שכתב לכיתה אחת את
     הרשימה של השנייה — ואז הקלדה ידנית של כיתה שלמה היא עונש מיותר.
     דורש אישור, כי הוא מוחק עריכות אמיתיות. */
  const restore = () => {
    const original = SEED[cls] || [];
    if (!original.length) return setNote("אין רשימה מקורית לכיתה הזאת");
    setDraft(original.map((r) => [...r]));
    setNote(`הוחזרה הרשימה המקורית — ${original.length} תלמידים. לחץ "שמור" כדי לאשר.`);
  };

  const remove = (i) => {
    const [first, , , id] = draft[i];
    setDraft((d) => d.filter((_, j) => j !== i));
    /* מה קורה להיסטוריה שלו, בדיוק: הפנקס נכתב לפי הרשימה הנוכחית ולכן
       מספר ההרכבים שלו יימחק בשמירה הבאה; יומן הנוכחות נכתב לפי הרישומים
       עצמם ולכן החיסורים והאיחורים שלו נשארים. אומרים את שניהם. */
    if (id)
      setNote(
        `${first || "התלמיד"} הוסר. מספר ההרכבים שלו יימחק מהפנקס בשמירה הבאה; החיסורים והאיחורים שלו נשארים ביומן.`
      );
  };

  const save = () => {
    if (problems.length) return setNote(problems[0]);
    onSave(filled);
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(list);

  return (
    <section style={{ ...panel, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 20, margin: 0 }}>
          כיתה {cls}
        </h2>
        <span style={{ color: C.dim, fontSize: 14 }}>{draft.length} תלמידים</span>
      </div>
      <p style={{ color: C.dim, fontSize: 13, margin: "8px 0 14px", lineHeight: 1.6 }}>
        כאן רושמים כיתה חדשה בתחילת שנה. כלי שאינו ברשימה אפשר פשוט להקליד.
        שם משפחה מוצג רק כששני תלמידים חולקים שם פרטי.
      </p>

      <datalist id="ens-instruments">
        {INSTRUMENTS.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {draft.map((row, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              // בטלפון שתי עמודות, במסך רחב ארבע — בלי שום שדה שגולש
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 6,
              alignItems: "center",
              background: C.soft,
              borderRadius: 10,
              padding: 8,
            }}
          >
            <input
              value={row[0]}
              onChange={(e) => setText(i, 0, e.target.value)}
              placeholder="שם פרטי"
              aria-label="שם פרטי"
              style={field}
            />
            <input
              value={row[1] || ""}
              onChange={(e) => setText(i, 1, e.target.value)}
              placeholder="שם משפחה"
              aria-label="שם משפחה"
              style={field}
            />
            <input
              list="ens-instruments"
              value={(row[2] || [])[0] || ""}
              onChange={(e) => setInst(i, 2, e.target.value)}
              placeholder="כלי"
              aria-label="כלי"
              style={field}
            />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                list="ens-instruments"
                value={(row[4] || [])[0] || ""}
                onChange={(e) => setInst(i, 4, e.target.value)}
                placeholder="כלי משני"
                aria-label="כלי משני"
                title="רזרבה — נכנס לפעולה רק כשאין אף נוכח שזה כליו הראשי"
                style={{ ...field, flex: 1 }}
              />
              <button
                onClick={() => remove(i)}
                aria-label={`הסר את ${row[0] || "התלמיד"}`}
                title="הסר מהרשימה"
                style={{ ...ghost(C.rose), padding: "9px 12px", fontSize: 15, minHeight: 40 }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button onClick={add} style={{ ...ghost(C.teal), fontSize: 15 }}>
          + הוסף תלמיד
        </button>
        <button
          onClick={restore}
          style={{ ...ghost(), fontSize: 15 }}
          title={`מחזיר את ${draft.length ? "" : ""}רשימת כיתה ${cls} המקורית, אם הרשימה הנוכחית התקלקלה`}
        >
          שחזר רשימה מקורית
        </button>
      </div>

      {problems.length > 0 && (
        <ul style={{ color: C.rose, fontSize: 14, lineHeight: 1.7, margin: "12px 0 0", paddingInlineStart: 20 }}>
          {problems.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={busy || !!problems.length || !dirty}
          style={btn(problems.length || !dirty ? C.soft : C.brass, problems.length || !dirty ? C.dim : "#241B08")}
        >
          {busy ? "שומר…" : "שמור את הרשימה"}
        </button>
        <button onClick={onCancel} style={ghost()}>
          {dirty ? "בטל שינויים" : "סגור"}
        </button>
        {note && <span style={{ color: C.dim, fontSize: 14 }}>{note}</span>}
      </div>
    </section>
  );
}
