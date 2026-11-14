import { useState } from "react";
import { Check, Confirm, Field } from "../components/ui";
import { connect, ensureProjectFiles, syncDoc } from "../data/google";
import { go, type ProjectCtx } from "../data/hooks";
import { patch, remove, useTables } from "../data/store";
import { FEATURE_KEYS, FEATURE_LABEL, type Grading, type Project } from "../data/types";

/** הגדרות הפרויקט: שם, סוג, שכבה, פעיל, יכולות, ציון, המורה, והקבצים ב-Drive. */
export default function SetupTab({ ctx }: { ctx: ProjectCtx }) {
  const t = useTables();
  const p = ctx.project;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const set = (change: Partial<Project>) => patch("projects", { id: p.id }, change);
  const types = t.project_types.filter((x) => !x.archived || x.id === p.type_id).sort((a, b) => a.sort - b.sort);
  const setGrading = (k: keyof Grading, v: string) =>
    set({ settings: { ...p.settings, grading: { ...p.settings.grading, [k]: v === "" ? undefined : Number(v) } } });

  const drive = async (what: "files" | "doc") => {
    setBusy(what);
    setMsg("");
    try {
      await connect();
      if (what === "doc") await syncDoc(p.id);
      else await ensureProjectFiles(p.id);
      setMsg(what === "doc" ? "המסמך נכתב מחדש מהנתונים." : "התיקייה והמסמך מוכנים ב-Drive.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <section className="card stack">
        <h2>הפרויקט</h2>
        <Field label="שם">
          <input className="field" defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && set({ name: e.target.value.trim() })} />
        </Field>
        <div className="row nowrap">
          <Field label="סוג">
            <select className="field" value={p.type_id} onChange={(e) => set({ type_id: e.target.value })}>
              {types.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          {ctx.type?.has_grade && (
            <Field label="שכבה">
              <select className="field" value={p.grade || ""} onChange={(e) => set({ grade: e.target.value || null })}>
                <option value="">—</option>
                {ctx.defaults.grades.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {(ctx.type?.fields || []).map((f) => (
          <Field key={f} label={f}>
            <input className="field" defaultValue={p.attrs[f] || ""} onBlur={(e) => set({ attrs: { ...p.attrs, [f]: e.target.value } })} />
          </Field>
        ))}
        <Field label="הערות">
          <input className="field" defaultValue={p.notes} onBlur={(e) => e.target.value !== p.notes && set({ notes: e.target.value })} />
        </Field>
        <Check checked={p.active} onChange={(v) => set({ active: v })}>
          <b>פעיל</b> — פרויקט לא פעיל יורד מהמסך הראשי, וההיסטוריה שלו נשמרת
        </Check>
      </section>

      <section className="card stack tight">
        <h2>יכולות</h2>
        <p className="sub">מה רלוונטי לקבוצה הזאת. ברירת המחדל באה מהסוג ({ctx.type?.name}).</p>
        {FEATURE_KEYS.map((k) => (
          <Check key={k} checked={ctx.features[k]} onChange={(v) => set({ features: { ...p.features, [k]: v } })}>
            {FEATURE_LABEL[k]}
            {p.features[k] !== undefined && p.features[k] !== (ctx.type?.features[k] ?? false) && <span className="tag sky" style={{ marginInlineStart: 6 }}>שונה מהסוג</span>}
          </Check>
        ))}
      </section>

      {ctx.features.discipline && (
        <section className="card stack">
          <h2>ציון</h2>
          <div className="row">
            {(
              [
                ["start", "ציון התחלתי"],
                ["absent", "חיסור −"],
                ["late", "איחור −"],
                ["homework", "אי־הכנת ש.ב. −"],
              ] as [keyof Grading, string][]
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <input
                  className="field"
                  type="number"
                  inputMode="numeric"
                  style={{ minWidth: 70 }}
                  defaultValue={p.settings.grading?.[k] ?? ""}
                  placeholder={String(ctx.defaults.grading[k])}
                  onBlur={(e) => setGrading(k, e.target.value)}
                />
              </Field>
            ))}
          </div>
          <p className="sub">שדה ריק = ברירת המחדל הכללית. חיסור או איחור מוצדק אינו מוריד.</p>
        </section>
      )}

      {ctx.features.ensembles && (
        <section className="card stack">
          <h2>המורה בהרכבים</h2>
          <div className="row nowrap">
            <Field label="שם">
              <input
                className="field"
                defaultValue={p.settings.teacher?.name || ""}
                placeholder={ctx.defaults.teacher.name}
                onBlur={(e) => set({ settings: { ...p.settings, teacher: { ...p.settings.teacher, name: e.target.value || undefined } } })}
              />
            </Field>
            <Field label="כלי">
              <input
                className="field"
                defaultValue={p.settings.teacher?.instrument || ""}
                placeholder={ctx.defaults.teacher.instrument}
                onBlur={(e) => set({ settings: { ...p.settings, teacher: { ...p.settings.teacher, instrument: e.target.value || undefined } } })}
              />
            </Field>
          </div>
          <p className="sub">חוקי החלוקה עצמם (תפקידי חובה, גודל הרכב, תלמיד מוביל) נמצאים בלשונית “הרכבים”.</p>
        </section>
      )}

      {(ctx.features.journal || ctx.features.videos) && (
        <section className="card stack">
          <h2>Google Drive</h2>
          <p className="sub">
            לכל פרויקט תיקייה משלו בתוך “שיעור אלתור” ב-Drive: מסמך התיעוד, ותיקיית “סרטונים”. האפליקציה רואה רק מה שהיא עצמה יצרה.
          </p>
          <div className="row">
            {p.drive.folderId && (
              <a className="btn" href={`https://drive.google.com/drive/folders/${p.drive.folderId}`} target="_blank" rel="noreferrer">
                פתח תיקייה
              </a>
            )}
            {p.drive.docUrl && (
              <a className="btn" href={p.drive.docUrl} target="_blank" rel="noreferrer">
                פתח מסמך
              </a>
            )}
            {!p.drive.folderId && (
              <button className="btn accent" disabled={!!busy} onClick={() => drive("files")}>
                {busy === "files" ? "יוצר…" : "צור תיקייה ומסמך"}
              </button>
            )}
            <button className="btn" disabled={!!busy} onClick={() => drive("doc")}>
              {busy === "doc" ? "כותב…" : "כתוב את המסמך מחדש"}
            </button>
          </div>
          {msg && (
            <p className="banner" role="status">
              {msg}
            </p>
          )}
        </section>
      )}

      <button className="btn quiet danger" style={{ border: 0 }} onClick={() => setConfirm(true)}>
        מחק את הפרויקט
      </button>
      {confirm && (
        <Confirm
          title={`למחוק את “${p.name}”?`}
          body={`יימחקו ${ctx.participants.length} משתתפים, ${ctx.lessons.length} שיעורים, וכל המשמעת, החלוקות והתיעוד של הפרויקט. הקבצים ב-Drive והפריטים בבנקים נשארים. אין לזה ביטול — אם הקבוצה רק הסתיימה, עדיף לסמן “לא פעיל”.`}
          action="מחק פרויקט"
          onConfirm={() => {
            remove("projects", { id: p.id });
            go();
          }}
          onClose={() => setConfirm(false)}
        />
      )}
    </>
  );
}
