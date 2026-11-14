import { useEffect, useMemo, useRef, useState } from "react";
import SmartField from "../components/SmartField";
import { Confirm, Seg } from "../components/ui";
import { deleteLesson, getMark, saveDraw, setDescription, writeMark } from "../data/actions";
import { connect, connected, syncDoc } from "../data/google";
import { go, useLessonEngine, type ProjectCtx } from "../data/hooks";
import { useTables } from "../data/store";
import { BANK_KINDS, BANK_LABEL, type Mark, type Participant } from "../data/types";
import { displayNames, itemsOf, shortDate } from "../engine/derive";
import MediaSection from "./MediaSection";

type Mode = "att" | "hw" | "just";

/**
 * השיעור: מי כאן, מה נעשה, ומה צולם. הכול נשמר מעצמו.
 *
 * הנוכחות נרשמת בלחיצות: לחיצה אחת = חסר, עוד אחת = הגיע באיחור, שלישית =
 * נוכח. כך "סומן חסר והגיע" הוא לחיצה אחת נוספת, בלי תפריט.
 */
export default function LessonTab({ ctx, date, docErr }: { ctx: ProjectCtx; date: string; docErr: string }) {
  const t = useTables();
  const eng = useLessonEngine(ctx, date);
  const [mode, setMode] = useState<Mode>("att");
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const lesson = t.lessons.find((l) => l.id === eng.lessonId);
  const discipline = ctx.features.discipline;
  const names = useMemo(() => displayNames(ctx.participants), [ctx.participants]);
  const markOf = (id: string) => eng.marks.find((m) => m.participant_id === id);

  /* מקובצים לפי כלי, בסדר התווים — העין סורקת קבוצה במקום לחפש שם */
  const groups = useMemo(() => {
    const map = new Map<string, Participant[]>();
    ctx.active.forEach((p) => map.set(p.instrument, [...(map.get(p.instrument) || []), p]));
    return [...map.entries()].sort((a, b) => ctx.catalog.order(a[0]) - ctx.catalog.order(b[0]) || a[0].localeCompare(b[0], "he"));
  }, [ctx.active, ctx.catalog]);

  const tap = (p: Participant) => {
    const cur = getMark(eng.lessonId, p.id);
    setNote("");
    if (mode === "hw") return void writeMark(ctx.project.id, date, p.id, { no_homework: !cur?.no_homework });
    if (mode === "just") {
      if (!cur?.status) return setNote(`${names.get(p.id)} נוכח — מצדיקים רק חיסור או איחור.`);
      return void writeMark(ctx.project.id, date, p.id, { justified: !cur.justified });
    }
    const was = cur?.status ?? null;
    const next: Mark["status"] = was === null ? "absent" : was === "absent" && discipline ? "late" : null;
    writeMark(ctx.project.id, date, p.id, { status: next });

    /* כבר יש חלוקה? לא מפרקים הרכבים שמנגנים — מכניסים או מוציאים אותו
       מהחלוקה הקיימת, ואומרים מה קרה. */
    if (!eng.draw || !ctx.features.ensembles) return;
    const leaving = next === "absent";
    const arriving = was === "absent";
    if (!leaving && !arriving) return;
    const here = new Set(eng.present.map((x) => x.id));
    leaving ? here.delete(p.id) : here.add(p.id);
    const out = eng.engine.presenceChanged(eng.draw, p.id, leaving, eng.poolOf(here));
    const leaders = eng.draw.rules.leader ? eng.engine.pickLeaders(out.draw) : out.draw.leaders;
    saveDraw(ctx.project.id, date, { ...eng.draw, ...out.draw, leaders, msg: out.msg });
    if (out.msg) setNote(out.msg);
  };

  const counts = {
    absent: eng.marks.filter((m) => m.status === "absent").length,
    late: eng.marks.filter((m) => m.status === "late").length,
    hw: eng.marks.filter((m) => m.no_homework).length,
  };
  const clearAll = () => {
    eng.marks.forEach((m) => m.status && writeMark(ctx.project.id, date, m.participant_id, { status: null }));
    setNote("");
  };

  const prev = ctx.lessons.find((l) => l.date < date);

  return (
    <>
      {prev && <PrevLesson ctx={ctx} lessonId={prev.id} date={prev.date} description={prev.description} />}

      <section className="card">
        <div className="section-title">
          <h2>מי כאן?</h2>
          <span className="count">
            {ctx.active.length - counts.absent}/{ctx.active.length} נוכחים
            {counts.late ? ` · ${counts.late} באיחור` : ""}
            {counts.hw ? ` · ${counts.hw} בלי ש.ב.` : ""}
          </span>
        </div>

        {!ctx.active.length ? (
          <div className="stack">
            <p className="muted">עוד אין משתתפים בפרויקט.</p>
            <button className="btn accent" onClick={() => go("p", ctx.project.id, "people")}>
              הוסף משתתפים
            </button>
          </div>
        ) : (
          <>
            {discipline && (
              <div style={{ marginBottom: 10 }}>
                <Seg<Mode>
                  full
                  label="מה מסמנים"
                  value={mode}
                  onChange={(m) => (setMode(m), setNote(""))}
                  options={[
                    ["att", "נוכחות"],
                    ["hw", "ש.ב."],
                    ["just", "מוצדק"],
                  ]}
                />
              </div>
            )}
            <p className="sub" style={{ marginBottom: 10 }}>
              {mode === "att"
                ? discipline
                  ? "לחיצה = חסר · עוד לחיצה = הגיע באיחור · שלישית = נוכח"
                  : "לחץ על מי שלא הגיע."
                : mode === "hw"
                  ? "לחץ על מי שלא הכין שיעורי בית."
                  : "לחץ על חיסור או איחור כדי לסמן אותו כמוצדק — הוא לא יוריד ציון."}
            </p>
            <div className="by-inst">
              {groups.map(([inst, people]) => (
                <div key={inst} style={{ display: "contents" }}>
                  <div className="label">{inst || "—"}</div>
                  <div className="chips">
                    {people.map((p) => {
                      const m = markOf(p.id);
                      const state = m?.status === "absent" ? "חסר" : m?.status === "late" ? "איחור" : "נוכח";
                      return (
                        <button
                          key={p.id}
                          className={"chip" + (m?.status ? " " + m.status : "")}
                          onClick={() => tap(p)}
                          aria-label={`${names.get(p.id)} — ${state}${m?.justified ? ", מוצדק" : ""}${m?.no_homework ? ", בלי שיעורי בית" : ""}`}
                        >
                          <span className="nm">{names.get(p.id)}</span>
                          {m?.status === "late" && <span className="tag">איחור</span>}
                          {m?.justified && <span className="tag ok">מוצדק</span>}
                          {m?.no_homework && <span className="tag warn">ש.ב.</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {note && (
              <p className="banner" role="status" style={{ marginTop: 12 }}>
                {note}
              </p>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              {ctx.features.ensembles && (
                <button className="btn primary grow" onClick={() => go("p", ctx.project.id, "ensembles", date)}>
                  {eng.draw ? "להרכבים ♫" : "לחלוקה להרכבים ♫"}
                </button>
              )}
              {counts.absent + counts.late > 0 && (
                <button className="btn" onClick={clearAll}>
                  כולם נוכחים
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {ctx.features.journal && (
        <section className="card stack">
          <div className="section-title" style={{ marginBottom: 0 }}>
            <h2>מה עשינו</h2>
          </div>
          <SmartField ctx={ctx} date={date} kind="repertoire" />
          <SmartField ctx={ctx} date={date} kind="exercise" />
          <SmartField ctx={ctx} date={date} kind="homework" />
          <Description key={eng.lessonId} projectId={ctx.project.id} date={date} initial={lesson?.description || ""} />
          <DocStatus ctx={ctx} err={docErr} />
        </section>
      )}

      {ctx.features.videos && <MediaSection ctx={ctx} date={date} />}

      {lesson && (
        <button className="btn quiet danger" style={{ border: 0 }} onClick={() => setConfirmDelete(true)}>
          מחק את השיעור הזה
        </button>
      )}
      {confirmDelete && lesson && (
        <Confirm
          title="למחוק את השיעור?"
          body={`השיעור של ${shortDate(date)} יימחק: הנוכחות והמשמעת, התיעוד, והחלוקה להרכבים שלו. סרטונים שהועלו נשארים ב-Drive. אין לזה ביטול.`}
          action="מחק שיעור"
          onConfirm={() => deleteLesson(lesson)}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

/** התיאור החופשי. נשמר חצי שנייה אחרי ההקלדה האחרונה, וגם ביציאה מהשדה. */
function Description({ projectId, date, initial }: { projectId: string; date: string; initial: string }) {
  const [text, setText] = useState(initial);
  const saved = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (v === saved.current) return;
    saved.current = v;
    setDescription(projectId, date, v);
  };
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => () => commit(latest.current), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <span className="lbl" style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 4 }}>
        תיאור חופשי
      </span>
      <textarea
        className="field ruled"
        rows={Math.max(5, text.split("\n").length + 1)}
        value={text}
        aria-label="תיאור חופשי של השיעור"
        placeholder="מה היה בשיעור — שורה לכל דבר"
        onChange={(e) => {
          setText(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          const v = e.target.value;
          timer.current = setTimeout(() => commit(v), 600);
        }}
        onBlur={() => commit(text)}
      />
    </div>
  );
}

/** מצב מסמך התיעוד ב-Google Docs */
function DocStatus({ ctx, err }: { ctx: ProjectCtx; err: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const d = ctx.project.drive;
  const run = async () => {
    setBusy(true);
    setMsg("");
    try {
      await connect();
      await syncDoc(ctx.project.id);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const state = busy ? "כותב למסמך…" : !d.docId ? "עוד אין מסמך ב-Google Docs" : d.dirty ? "יש שינויים שעוד לא במסמך" : "המסמך מעודכן";
  return (
    <div className="stack tight">
      <div className="row">
        <span className={"dot" + (d.docId && !d.dirty ? "" : " wait")} />
        <span className="small grow">{state}</span>
        {d.docUrl && (
          <a className="btn sm ghost" href={d.docUrl} target="_blank" rel="noreferrer">
            פתח מסמך
          </a>
        )}
        {(!d.docId || d.dirty || !connected()) && (
          <button className="btn sm" onClick={run} disabled={busy}>
            {d.docId ? "עדכן עכשיו" : "צור מסמך"}
          </button>
        )}
      </div>
      {(msg || err) && (
        <p className="banner warn small" role="alert">
          {msg || err}
        </p>
      )}
    </div>
  );
}

function PrevLesson({ ctx, lessonId, date, description }: { ctx: ProjectCtx; lessonId: string; date: string; description: string }) {
  const t = useTables();
  const [open, setOpen] = useState(false);
  const bank = useMemo(() => new Map(t.bank_items.map((b) => [b.id, b])), [t.bank_items]);
  const fields = BANK_KINDS.map((k) => ({ k, titles: itemsOf(lessonId, k, t.lesson_items, bank).map((x) => x.item.title) })).filter(
    (f) => f.titles.length
  );
  const hw = fields.find((f) => f.k === "homework");
  if (!fields.length && !description.trim()) return null;
  return (
    <section className="card flat margin">
      <button className="list-row" style={{ minHeight: 30, padding: 0 }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <b>בשיעור הקודם</b>
        <span className="sub">{shortDate(date)}</span>
        {!open && hw && <span className="sub grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· ש.ב.: {hw.titles.join(", ")}</span>}
        <span className="end muted">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="stack tight" style={{ marginTop: 8 }}>
          {fields.map((f) => (
            <p key={f.k}>
              <b>{BANK_LABEL[f.k]}:</b> {f.titles.join(" · ")}
            </p>
          ))}
          {description.trim() && (
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              {description
                .split("\n")
                .filter((l) => l.trim())
                .map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
            </ul>
          )}
          {ctx.features.journal && (
            <button className="btn sm ghost" style={{ alignSelf: "start" }} onClick={() => go("p", ctx.project.id, "lesson", date)}>
              פתח את השיעור הזה
            </button>
          )}
        </div>
      )}
    </section>
  );
}
