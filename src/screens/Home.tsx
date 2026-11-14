import { useMemo, useState } from "react";
import { Field, Sheet, TopBar } from "../components/ui";
import { createProject } from "../data/actions";
import { go, useDefaults } from "../data/hooks";
import { refresh, useStore } from "../data/store";
import { shortDate, todayStamp } from "../engine/derive";
import type { Project } from "../data/types";

export function SyncDot() {
  const s = useStore();
  const online = typeof navigator === "undefined" || navigator.onLine;
  const label = s.pending ? `${s.pending} שינויים ממתינים לשמירה` : !online ? "בלי רשת — עובד מהמכשיר" : "הכול שמור";
  return (
    <button className="btn quiet sm" onClick={() => void refresh()} aria-label={label + " — לחץ לרענון"} title={label}>
      <span className={"dot" + (s.pending ? " wait" : !online ? " off" : "")} />
      <span className="small">{s.pending ? "ממתין" : !online ? "לא מקוון" : "שמור"}</span>
    </button>
  );
}

export default function Home() {
  const { tables } = useStore();
  const [adding, setAdding] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const typeName = (p: Project) => tables.project_types.find((t) => t.id === p.type_id)?.name || "";
  const projects = useMemo(() => [...tables.projects].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "he")), [tables.projects]);
  const active = projects.filter((p) => p.active);
  const old = projects.filter((p) => !p.active);
  const today = todayStamp();

  const card = (p: Project) => {
    const lessons = tables.lessons.filter((l) => l.project_id === p.id);
    const last = lessons.reduce((a, l) => (l.date > a ? l.date : a), "");
    const count = tables.participants.filter((x) => x.project_id === p.id && x.active).length;
    return (
      <button key={p.id} className="card tap margin" onClick={() => go("p", p.id)}>
        <div className="row spread nowrap">
          <h2>{p.name}</h2>
          {last === today && <span className="tag ok">שיעור היום</span>}
        </div>
        <p className="sub">
          {[typeName(p), p.grade && `שכבה ${p.grade}`, `${count} משתתפים`].filter(Boolean).join(" · ")}
        </p>
        <p className="sub">
          {lessons.length ? `${lessons.length} שיעורים · אחרון ${shortDate(last)}` : "עוד לא נרשם שיעור"}
        </p>
      </button>
    );
  };

  return (
    <div className="app stack">
      <TopBar title="שיעור אלתור">
        <SyncDot />
      </TopBar>

      {!projects.length && (
        <div className="card center stack">
          <p>עוד אין פרויקטים. פרויקט הוא קבוצה שאתה מלמד — כיתה, סדנה, הרכב.</p>
        </div>
      )}
      {active.map(card)}

      <button className="btn accent big" onClick={() => setAdding(true)}>
        ＋ פרויקט חדש
      </button>

      <div className="row">
        <button className="btn grow" onClick={() => go("banks")}>
          📚 הבנקים
        </button>
        <button className="btn grow" onClick={() => go("settings")}>
          ⚙ הגדרות
        </button>
      </div>

      {old.length > 0 && (
        <>
          <button className="btn quiet" onClick={() => setShowOld(!showOld)} aria-expanded={showOld}>
            {showOld ? "הסתר" : "הצג"} {old.length} פרויקטים לא פעילים
          </button>
          {showOld && old.map(card)}
        </>
      )}

      {adding && <NewProject onClose={() => setAdding(false)} />}
    </div>
  );
}

function NewProject({ onClose }: { onClose: () => void }) {
  const { tables } = useStore();
  const defaults = useDefaults();
  const types = tables.project_types.filter((t) => !t.archived).sort((a, b) => a.sort - b.sort);
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState(types[0]?.id || "");
  const [grade, setGrade] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const type = types.find((t) => t.id === typeId);
  const save = () => {
    const p = createProject({ name, type_id: typeId, grade: type?.has_grade ? grade || null : null, copyFrom: copyFrom || undefined });
    onClose();
    go("p", p.id, "people");
  };
  return (
    <Sheet title="פרויקט חדש" onClose={onClose}>
      <div className="stack">
        <Field label="שם">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: יא 27-28" autoFocus />
        </Field>
        <Field label="סוג">
          <select className="field" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        {type?.has_grade && (
          <Field label="שכבה">
            <select className="field" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">—</option>
              {defaults.grades.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
        )}
        {tables.projects.length > 0 && (
          <Field label="העתק משתתפים והגדרות מפרויקט קיים (לא חובה)">
            <select className="field" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">בלי — להתחיל ריק</option>
              {tables.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button className="btn primary big" disabled={!name.trim() || !typeId} onClick={save}>
          צור פרויקט
        </button>
      </div>
    </Sheet>
  );
}
