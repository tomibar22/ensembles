import { useState } from "react";
import { Check, Field, Sheet, TopBar } from "../components/ui";
import { connect, connected } from "../data/google";
import { supabase } from "../data/supabase";
import { go, useDefaults } from "../data/hooks";
import { refresh, remove, uid, upsert, useStore } from "../data/store";
import { FEATURE_KEYS, FEATURE_LABEL, type Defaults, type Grading, type Instrument, type ProjectType } from "../data/types";
import { ROLES, ROLE_NAME, type Role } from "../engine/engine";

/** הגדרות כלליות: סוגי פרויקטים, קטלוג הכלים, ברירות מחדל, Google והחשבון. */
export default function Settings({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const { tables, pending } = useStore();
  const defaults = useDefaults();
  const [type, setType] = useState<ProjectType | null>(null);
  const [inst, setInst] = useState<Instrument | null>(null);
  const [gmsg, setGmsg] = useState("");
  const [, bump] = useState(0);
  const [password, setPassword] = useState("");
  const [pmsg, setPmsg] = useState("");
  const setDefaults = (change: Partial<Defaults>) => upsert("settings", { key: "defaults", value: { ...defaults, ...change } });
  const types = [...tables.project_types].sort((a, b) => a.sort - b.sort);
  const instruments = [...tables.instruments].sort((a, b) => a.sort - b.sort);

  const google = async () => {
    setGmsg("");
    try {
      await connect();
      bump((n) => n + 1);
    } catch (e) {
      setGmsg((e as Error).message);
    }
  };
  const savePassword = async () => {
    const { error } = await supabase.auth.updateUser({ password });
    setPmsg(error ? error.message : "הסיסמה נשמרה — אפשר להיכנס איתה מכל מכשיר.");
    if (!error) setPassword("");
  };

  return (
    <div className="app stack">
      <TopBar title="הגדרות" back={() => go()} />

      <section className="card stack">
        <h2>סוגי פרויקטים</h2>
        <p className="sub">כל סוג קובע אילו יכולות פעילות כברירת מחדל, והאם יש לו שכבה. אפשר להוסיף סוגים חדשים.</p>
        <div className="list">
          {types.map((x) => (
            <button key={x.id} className="list-row" onClick={() => setType(x)} style={{ opacity: x.archived ? 0.55 : 1 }}>
              <span className="grow">
                <b>{x.name}</b>
                <br />
                <span className="sub">
                  {[x.has_grade && "שכבה", ...FEATURE_KEYS.filter((k) => x.features[k]).map((k) => FEATURE_LABEL[k])].filter(Boolean).join(" · ") || "בלי יכולות"}
                </span>
              </span>
              <span className="muted">‹</span>
            </button>
          ))}
        </div>
        <button
          className="btn accent"
          onClick={() => setType({ id: uid(), name: "", has_grade: false, features: { journal: true }, fields: [], sort: types.length + 1, archived: false })}
        >
          ＋ סוג חדש
        </button>
      </section>

      <section className="card stack">
        <h2>כלים</h2>
        <p className="sub">התפקיד של כל כלי בהרכב. כלי שאינו ברשימה נחשב מלודי — אפשר פשוט להקליד אותו אצל המשתתף.</p>
        <div className="chips">
          {instruments.map((i) => (
            <button key={i.name} className={"chip sm" + (i.role !== "melody" ? " rhythm" : "")} onClick={() => setInst(i)}>
              {i.name} <span className="inst">{ROLE_NAME[i.role]}</span>
            </button>
          ))}
          <button className="chip sm dashed" onClick={() => setInst({ name: "", role: "melody", is_unique: false, sort: instruments.length + 1 })}>
            ＋ כלי
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>ברירות מחדל</h2>
        <h3>ציון</h3>
        <div className="row">
          {(
            [
              ["start", "התחלה"],
              ["absent", "חיסור −"],
              ["late", "איחור −"],
              ["homework", "ש.ב. −"],
            ] as [keyof Grading, string][]
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                className="field"
                type="number"
                inputMode="numeric"
                style={{ minWidth: 70 }}
                defaultValue={defaults.grading[k]}
                onBlur={(e) => e.target.value !== "" && setDefaults({ grading: { ...defaults.grading, [k]: Number(e.target.value) } })}
              />
            </Field>
          ))}
        </div>
        <h3>המורה בהרכבים</h3>
        <div className="row nowrap">
          <Field label="שם">
            <input className="field" defaultValue={defaults.teacher.name} onBlur={(e) => e.target.value.trim() && setDefaults({ teacher: { ...defaults.teacher, name: e.target.value.trim() } })} />
          </Field>
          <Field label="כלי">
            <input className="field" defaultValue={defaults.teacher.instrument} onBlur={(e) => e.target.value.trim() && setDefaults({ teacher: { ...defaults.teacher, instrument: e.target.value.trim() } })} />
          </Field>
        </div>
        <Field label="שכבות (מופרדות בפסיק)">
          <input
            className="field"
            defaultValue={defaults.grades.join(", ")}
            onBlur={(e) => {
              const grades = e.target.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
              if (grades.length) setDefaults({ grades });
            }}
          />
        </Field>
      </section>

      <section className="card stack">
        <h2>Google Drive</h2>
        <div className="row">
          <span className={"dot" + (connected() ? "" : " off")} />
          <span className="grow">{connected() ? "מחובר — מסמכים וסרטונים מתעדכנים" : "לא מחובר כרגע"}</span>
          {!connected() && (
            <button className="btn" onClick={google}>
              התחבר
            </button>
          )}
        </div>
        <p className="sub">
          החיבור נדרש רק לכתיבת מסמכי התיעוד ולהעלאת סרטונים, ומתחדש בלחיצה כשצריך. כל שאר הנתונים שמורים במסד ואינם תלויים בו.
        </p>
        {gmsg && (
          <p className="banner warn" role="alert">
            {gmsg}
          </p>
        )}
      </section>

      <section className="card stack">
        <h2>החשבון</h2>
        <p dir="ltr" style={{ textAlign: "end" }}>
          {email}
        </p>
        <div className="row nowrap">
          <input
            className="field grow"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            placeholder="סיסמה חדשה (6+ תווים)"
            aria-label="סיסמה חדשה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn" disabled={password.length < 6} onClick={savePassword}>
            שמור סיסמה
          </button>
        </div>
        <p className="sub">סיסמה מאפשרת להיכנס גם מתוך האפליקציה שהותקנה במסך הבית, בלי קישור במייל.</p>
        {pmsg && (
          <p className="banner" role="status">
            {pmsg}
          </p>
        )}
        <div className="row">
          <button className="btn grow" onClick={() => void refresh()}>
            רענן נתונים{pending ? ` (${pending} ממתינים)` : ""}
          </button>
          <button className="btn" onClick={onSignOut}>
            יציאה
          </button>
        </div>
      </section>

      {type && <TypeSheet initial={type} inUse={tables.projects.some((p) => p.type_id === type.id)} onClose={() => setType(null)} />}
      {inst && <InstSheet initial={inst} isNew={!tables.instruments.some((i) => i.name === inst.name)} onClose={() => setInst(null)} />}
    </div>
  );
}

function TypeSheet({ initial, inUse, onClose }: { initial: ProjectType; inUse: boolean; onClose: () => void }) {
  const [x, setX] = useState(initial);
  const [fields, setFields] = useState(initial.fields.join(", "));
  const { tables } = useStore();
  const exists = tables.project_types.some((t) => t.id === initial.id);
  return (
    <Sheet title={exists ? "סוג פרויקט" : "סוג חדש"} onClose={onClose}>
      <div className="stack">
        <Field label="שם הסוג">
          <input className="field" value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} autoFocus={!exists} placeholder="למשל: קורס מבוגרים" />
        </Field>
        <Check checked={x.has_grade} onChange={(v) => setX({ ...x, has_grade: v })}>
          יש לו שכבה (ט / י / יא / יב)
        </Check>
        <h3>יכולות כברירת מחדל</h3>
        {FEATURE_KEYS.map((k) => (
          <Check key={k} checked={!!x.features[k]} onChange={(v) => setX({ ...x, features: { ...x.features, [k]: v } })}>
            {FEATURE_LABEL[k]}
          </Check>
        ))}
        <Field label="מאפיינים נוספים לסוג הזה (מופרדים בפסיק)">
          <input className="field" value={fields} onChange={(e) => setFields(e.target.value)} placeholder="מקום, גיל, משך…" />
        </Field>
        <button
          className="btn primary big"
          disabled={!x.name.trim()}
          onClick={() => {
            upsert("project_types", { ...x, name: x.name.trim(), fields: fields.split(/[,،]/).map((s) => s.trim()).filter(Boolean) });
            onClose();
          }}
        >
          שמור
        </button>
        {exists &&
          (inUse ? (
            <button className="btn" onClick={() => (upsert("project_types", { ...x, archived: !x.archived }), onClose())}>
              {x.archived ? "החזר לשימוש" : "הסתר מהרשימה (יש פרויקטים מהסוג הזה)"}
            </button>
          ) : (
            <button className="btn danger" onClick={() => (remove("project_types", { id: x.id }), onClose())}>
              מחק סוג
            </button>
          ))}
      </div>
    </Sheet>
  );
}

function InstSheet({ initial, isNew, onClose }: { initial: Instrument; isNew: boolean; onClose: () => void }) {
  const [x, setX] = useState(initial);
  return (
    <Sheet title={isNew ? "כלי חדש" : initial.name} onClose={onClose}>
      <div className="stack">
        {isNew && (
          <Field label="שם הכלי">
            <input className="field" value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} autoFocus />
          </Field>
        )}
        <Field label="תפקיד בהרכב">
          <select className="field" value={x.role} onChange={(e) => setX({ ...x, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_NAME[r]}
              </option>
            ))}
          </select>
        </Field>
        <Check checked={x.is_unique} onChange={(v) => setX({ ...x, is_unique: v })}>
          רק אחד כזה בהרכב
        </Check>
        <Field label="מיקום בסדר התצוגה">
          <input className="field" type="number" inputMode="numeric" value={x.sort} onChange={(e) => setX({ ...x, sort: Number(e.target.value) || 0 })} />
        </Field>
        <button className="btn primary big" disabled={!x.name.trim()} onClick={() => (upsert("instruments", { ...x, name: x.name.trim() }), onClose())}>
          שמור
        </button>
        {!isNew && (
          <button className="btn danger" onClick={() => (remove("instruments", { name: x.name }), onClose())}>
            הסר מהקטלוג (ייחשב מלודי)
          </button>
        )}
      </div>
    </Sheet>
  );
}
