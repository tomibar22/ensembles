import { BENCH, MAX_GROUP, movePlayer, addPlayer, removePlayer, changeInstrument } from "./ensembles.js";
import { C } from "./theme.js";

/* כפתור עריכה. פעולה שאינה אפשרית מעומעמת אבל עדיין לחיצה: הלחיצה מציגה
   את הסיבה בהודעה הקבועה בראש המסך, כמו בהחלפה — עדיף לומר למה מאשר
   להיראות תקוע. */
function Pill({ ok = true, on = false, danger = false, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on || undefined}
      style={{
        font: "inherit",
        cursor: "pointer",
        minHeight: 40,
        padding: "0 14px",
        borderRadius: 999,
        fontSize: 15,
        color: on ? "#241B08" : danger ? C.rose : C.ink,
        background: on ? C.brass : "transparent",
        border: `1px solid ${on ? C.brass : danger ? C.rose + "88" : C.line}`,
        opacity: ok || on ? 1 : 0.35,
        transition: "opacity .12s",
      }}
    >
      {children}
    </button>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ color: C.dim, fontSize: 13, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </div>
  );
}

const box = {
  background: C.soft,
  border: `1px solid ${C.brass}66`,
  borderRadius: 12,
  padding: 12,
  marginTop: 10,
};

/**
 * מה אפשר לעשות עם הנגן שנבחר: להעביר, להוסיף להרכב נוסף, להחליף כלי,
 * להוציא. החלפה עם נגן אחר נשארת כמו שהייתה — לחיצה על הנגן השני.
 * כל כפתור מחושב מול הלוגיקה עצמה, כך שמה שמעומעם הוא בדיוק מה שיסורב.
 */
export function ChipTools({ res, sel, edit }) {
  const onBench = sel.g === BENCH;
  const m = onBench ? res.bench.find((s) => s.id === sel.id) : res.groups[sel.g]?.find((x) => x.id === sel.id);
  if (!m) return null;
  const load = res.load[m.id] || 0;
  // הרכבים שהוא עדיין לא בהם — אין טעם להציע לו אותם
  const others = res.groups.map((g, i) => i).filter((i) => i !== sel.g && !res.groups[i].some((x) => x.id === m.id));
  const insts = [...new Set([...m.instruments, ...(m.backup || [])])];

  return (
    <div style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15 }}>
          <b>{m.name}</b>
          <span style={{ color: C.dim }}>
            {onBench ? " · על הספסל" : ` · ${m.playing} · הרכב ${sel.g + 1}`}
          </span>
        </span>
        <Pill onClick={edit.close}>סגור</Pill>
      </div>
      <p style={{ color: C.dim, fontSize: 13, margin: "8px 0 0", lineHeight: 1.5 }}>
        להחלפה עם נגן אחר — לחץ עליו. או בחר פעולה:
      </p>

      {onBench && others.length > 0 && (
        <Row label="הוסף להרכב">
          {others.map((i) => (
            <Pill key={i} ok={!addPlayer(res, m.id, i).error} onClick={() => edit.run(addPlayer(res, m.id, i))}>
              הרכב {i + 1}
            </Pill>
          ))}
        </Row>
      )}

      {!onBench && others.length > 0 && (
        <Row label="העבר להרכב">
          {others.map((i) => (
            <Pill key={i} ok={!movePlayer(res, sel, i).error} onClick={() => edit.run(movePlayer(res, sel, i))}>
              הרכב {i + 1}
            </Pill>
          ))}
        </Row>
      )}

      {!onBench && !m.teacher && others.length > 0 && (
        <Row label="הוסף גם להרכב (יהיה בשניים)">
          {others.map((i) => (
            <Pill key={i} ok={!addPlayer(res, m.id, i).error} onClick={() => edit.run(addPlayer(res, m.id, i))}>
              הרכב {i + 1}
            </Pill>
          ))}
        </Row>
      )}

      {!onBench && insts.length > 1 && (
        <Row label="כלי בהרכב הזה">
          {insts.map((inst) => (
            <Pill
              key={inst}
              on={inst === m.playing}
              ok={!changeInstrument(res, sel, inst).error}
              onClick={() => edit.run(changeInstrument(res, sel, inst))}
            >
              {inst}
              {!m.instruments.includes(inst) && " (משני)"}
            </Pill>
          ))}
        </Row>
      )}

      {!onBench && (
        <Row label="הוצאה">
          <Pill danger ok={!removePlayer(res, sel).error} onClick={() => edit.run(removePlayer(res, sel))}>
            {load > 1 ? `הוצא מהרכב ${sel.g + 1}` : "הוצא לספסל"}
          </Pill>
        </Row>
      )}
    </div>
  );
}

/**
 * בורר ההוספה של הרכב: קודם מי שיושב בחוץ, ואחריו מי שכבר מנגן
 * בהרכב אחר ויכול לקחת כיסא נוסף. מי שלא נוכח לא מופיע כאן — הוא
 * מצטרף דרך לוח הנוכחות, שמטפל גם ברישום האיחור.
 */
export function AddPicker({ res, g, edit }) {
  const here = new Set(res.groups[g].map((m) => m.id));
  const seen = new Set();
  const take = (list) =>
    list.filter((s) => {
      if (here.has(s.id) || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  const sitting = take(res.bench);
  const playing = take(res.groups.flat().filter((m) => !m.teacher)).sort(
    (a, b) => (res.load[a.id] || 0) - (res.load[b.id] || 0) || a.name.localeCompare(b.name, "he")
  );

  const pill = (s, tag) => (
    <Pill key={s.id} ok={!addPlayer(res, s.id, g).error} onClick={() => edit.run(addPlayer(res, s.id, g))}>
      {s.name} <span style={{ color: C.dim, fontSize: 13 }}>{s.playing || s.instruments[0]}</span>
      {tag && <span style={{ color: C.brass, fontSize: 12 }}> {tag}</span>}
    </Pill>
  );

  return (
    <div style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ fontSize: 15 }}>הוסף להרכב {g + 1}</b>
        <Pill onClick={() => edit.openAdd(g)}>סגור</Pill>
      </div>
      {res.groups[g].length >= MAX_GROUP && (
        <p style={{ color: C.rose, fontSize: 13, margin: "8px 0 0", lineHeight: 1.5 }}>
          ההרכב מלא ({MAX_GROUP} נגנים). אפשר להחליף נגן, או להוציא מישהו כדי לפנות כיסא.
        </p>
      )}
      {sitting.length > 0 && <Row label="יושבים בחוץ">{sitting.map((s) => pill(s))}</Row>}
      {playing.length > 0 && (
        <Row label="כבר מנגנים בהרכב אחר — יקבלו כיסא נוסף">
          {playing.map((s) => pill(s, `×${res.load[s.id] || 1}`))}
        </Row>
      )}
      <p style={{ color: C.dim, fontSize: 13, margin: "10px 0 0", lineHeight: 1.5 }}>
        מי שלא ברשימה לא סומן כנוכח — סמן אותו בלוח הנוכחות והוא יצטרף.
      </p>
    </div>
  );
}
