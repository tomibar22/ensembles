import { useMemo, useState } from "react";
import { Check, Confirm, Field, Sheet } from "../components/ui";
import { newParticipant } from "../data/actions";
import type { ProjectCtx } from "../data/hooks";
import { remove, upsert, useTables } from "../data/store";
import type { Participant } from "../data/types";
import { ROLE_NAME } from "../engine/engine";

/** המשתתפים בפרויקט: הוספה, עריכה, השבתה והסרה. */
export default function PeopleTab({ ctx }: { ctx: ProjectCtx }) {
  const [editing, setEditing] = useState<Participant | null>(null);
  const inactive = ctx.participants.filter((p) => !p.active);
  const roleCount = useMemo(() => {
    const n: Record<string, number> = {};
    ctx.active.forEach((p) => p.instrument && (n[ctx.catalog.role(p.instrument)] = (n[ctx.catalog.role(p.instrument)] || 0) + 1));
    return n;
  }, [ctx.active, ctx.catalog]);
  const missing = ctx.features.ensembles && ctx.active.length ? ctx.rules.required.filter((r) => !roleCount[r] && !ctx.active.some((p) => p.instrument2 && ctx.catalog.role(p.instrument2) === r)) : [];

  const row = (p: Participant) => (
    <button key={p.id} className="list-row" onClick={() => setEditing(p)}>
      <span className="grow" style={{ opacity: p.active ? 1 : 0.55 }}>
        <b>{p.first_name}</b> {p.last_name}
        {p.notes && <span className="sub"> · {p.notes}</span>}
      </span>
      <span className="inst">
        {p.instrument || "—"}
        {p.instrument2 && ` (+${p.instrument2})`}
      </span>
    </button>
  );

  return (
    <>
      <section className="card">
        <div className="section-title">
          <h2>משתתפים</h2>
          <span className="count">{ctx.active.length}</span>
        </div>
        {!ctx.participants.length && <p className="muted">עוד אין משתתפים. הוסף את הראשון:</p>}
        <div className="list">{ctx.active.map(row)}</div>
        {missing.length > 0 && (
          <p className="banner warn" style={{ marginTop: 10 }}>
            אין בקבוצה {missing.map((r) => ROLE_NAME[r]).join(" ואין ")} — לפי החוקים הנוכחיים אי אפשר יהיה לחלק להרכבים.
          </p>
        )}
        <button className="btn accent big" style={{ marginTop: 12 }} onClick={() => setEditing(newParticipant(ctx.project.id))}>
          ＋ הוסף משתתף
        </button>
      </section>
      {inactive.length > 0 && (
        <section className="card flat">
          <h3 style={{ marginBottom: 6 }}>לא פעילים</h3>
          <div className="list">{inactive.map(row)}</div>
        </section>
      )}
      {editing && <Editor ctx={ctx} initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function Editor({ ctx, initial, onClose }: { ctx: ProjectCtx; initial: Participant; onClose: () => void }) {
  const t = useTables();
  const [p, setP] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const exists = ctx.participants.some((x) => x.id === initial.id);
  const set = (change: Partial<Participant>) => setP((cur) => ({ ...cur, ...change }));
  const marks = t.marks.filter((m) => m.participant_id === p.id).length;
  const save = () => {
    upsert("participants", { ...p, first_name: p.first_name.trim(), last_name: p.last_name.trim(), instrument: p.instrument.trim(), instrument2: p.instrument2.trim() });
    onClose();
  };
  return (
    <Sheet title={exists ? "עריכת משתתף" : "משתתף חדש"} onClose={onClose}>
      <datalist id="instruments">
        {[...t.instruments].sort((a, b) => a.sort - b.sort).map((i) => (
          <option key={i.name} value={i.name} />
        ))}
      </datalist>
      <div className="stack">
        <div className="row nowrap">
          <Field label="שם פרטי">
            <input className="field" value={p.first_name} onChange={(e) => set({ first_name: e.target.value })} autoFocus={!exists} />
          </Field>
          <Field label="שם משפחה">
            <input className="field" value={p.last_name} onChange={(e) => set({ last_name: e.target.value })} />
          </Field>
        </div>
        <div className="row nowrap">
          <Field label="כלי ראשי">
            <input className="field" list="instruments" value={p.instrument} onChange={(e) => set({ instrument: e.target.value })} />
          </Field>
          <Field label="כלי משני (רזרבה)">
            <input className="field" list="instruments" value={p.instrument2} onChange={(e) => set({ instrument2: e.target.value })} />
          </Field>
        </div>
        <Field label="הערות">
          <input className="field" value={p.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <Field label="הצטרף בתאריך (שיעורים שקדמו לו לא נספרים)">
          <input type="date" className="field date" value={p.joined_on || ""} onChange={(e) => set({ joined_on: e.target.value || null })} />
        </Field>
        <Check checked={p.active} onChange={(v) => set({ active: v })}>
          פעיל — מופיע בנוכחות ובחלוקה
        </Check>
        <button className="btn primary big" disabled={!p.first_name.trim()} onClick={save}>
          שמור
        </button>
        {exists && (
          <button className="btn quiet danger" style={{ border: 0 }} onClick={() => setConfirm(true)}>
            מחק לצמיתות
          </button>
        )}
      </div>
      {confirm && (
        <Confirm
          title={`למחוק את ${p.first_name}?`}
          body={`המשתתף יימחק יחד עם ${marks} רישומי משמעת שלו. אין לזה ביטול. אם הוא רק עזב את הקבוצה — עדיף לסמן “לא פעיל”, וההיסטוריה נשמרת.`}
          action="מחק לצמיתות"
          onConfirm={() => {
            remove("participants", { id: p.id });
            onClose();
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </Sheet>
  );
}
