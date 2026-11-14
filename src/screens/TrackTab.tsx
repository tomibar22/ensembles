import { useMemo, useState } from "react";
import { Seg, Sheet } from "../components/ui";
import { writeMark } from "../data/actions";
import type { ProjectCtx } from "../data/hooks";
import { useTables } from "../data/store";
import { buildHistory, shortDate, trackRows, type TrackRow } from "../engine/derive";

type Sort = "name" | "grade" | "absent";

/**
 * מעקב מצטבר: חיסורים, איחורים, שיעורי בית וציון — בטבלה אחת שנוח להעתיק
 * ממנה למערכת של בית הספר. לחיצה על שורה פותחת את הפירוט של התלמיד, ושם
 * מסמנים בדיעבד חיסור או איחור כמוצדק.
 */
export default function TrackTab({ ctx }: { ctx: ProjectCtx }) {
  const t = useTables();
  const [sort, setSort] = useState<Sort>("name");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const discipline = ctx.features.discipline;
  const g = ctx.grading;

  const marks = useMemo(() => t.marks.filter((m) => m.project_id === ctx.project.id), [t.marks, ctx.project.id]);
  const history = useMemo(() => buildHistory(ctx.project, t.draws), [ctx.project, t.draws]);
  const rows = useMemo(() => {
    const list = trackRows(ctx.active, ctx.lessons, marks, g, history.plays, { from: from || undefined, to: to || undefined });
    const by: Record<Sort, (a: TrackRow, b: TrackRow) => number> = {
      name: () => 0,
      grade: (a, b) => a.grade - b.grade,
      absent: (a, b) => b.absent + b.absentJustified - (a.absent + a.absentJustified) || b.late - a.late,
    };
    return list.sort((a, b) => by[sort](a, b) || a.name.localeCompare(b.name, "he"));
  }, [ctx.active, ctx.lessons, marks, g, history.plays, from, to, sort]);
  const lessonCount = ctx.lessons.filter((l) => (!from || l.date >= from) && (!to || l.date <= to)).length;

  const copy = async () => {
    const head = discipline ? ["תלמיד", "חיסורים", "מוצדקים", "איחורים", "איחורים מוצדקים", "בלי ש.ב.", "ציון"] : ["משתתף", "חיסורים", "נוכחות %"];
    const body = rows.map((r) =>
      discipline
        ? [r.name, r.absent, r.absentJustified, r.late, r.lateJustified, r.homework, r.grade]
        : [r.name, r.absent + r.absentJustified, r.rate ?? ""]
    );
    try {
      await navigator.clipboard.writeText([head, ...body].map((x) => x.join("\t")).join("\n"));
      setNote("הטבלה הועתקה — אפשר להדביק אותה בגיליון או במערכת בית הספר");
    } catch {
      setNote("הדפדפן לא מרשה להעתיק מכאן");
    }
  };

  const num = (n: number, cls: string, extra = 0) =>
    n || extra ? (
      <>
        <span className={n ? cls : "muted"}>{n}</span>
        {extra > 0 && <span className="muted small"> +{extra}</span>}
      </>
    ) : (
      <span className="muted">—</span>
    );

  return (
    <>
      <section className="card">
        <div className="section-title">
          <h2>מעקב</h2>
          <span className="count">{lessonCount} שיעורים</span>
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <Seg<Sort>
            label="מיון"
            value={sort}
            onChange={setSort}
            options={discipline ? [["name", "שם"], ["grade", "ציון"], ["absent", "חיסורים"]] : [["name", "שם"], ["absent", "חיסורים"]]}
          />
        </div>
        <div className="table-wrap">
          <table className="track">
            <thead>
              <tr>
                <th>{discipline ? "תלמיד" : "משתתף"}</th>
                <th>חיסורים</th>
                {discipline && <th>איחורים</th>}
                {discipline && <th>ש.ב.</th>}
                {discipline ? <th>ציון</th> : <th>נוכחות</th>}
                {ctx.features.ensembles && <th>הרכבים</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="tap" onClick={() => setOpen(r.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(r.id)}>
                  <td>{r.name}</td>
                  <td>{num(r.absent, "num-warn", r.absentJustified)}</td>
                  {discipline && <td>{num(r.late, "num-late", r.lateJustified)}</td>}
                  {discipline && <td>{num(r.homework, "num-warn")}</td>}
                  {discipline ? (
                    <td className="grade" style={{ color: r.grade < 70 ? "var(--warn)" : undefined }}>
                      {r.grade}
                    </td>
                  ) : (
                    <td>{r.rate === null ? "—" : `${r.rate}%`}</td>
                  )}
                  {ctx.features.ensembles && <td className="muted">{r.plays}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ marginTop: 10 }}>
          {discipline
            ? `ציון: ${g.start} פחות ${g.absent} לחיסור, ${g.late} לאיחור, ${g.homework} לאי־הכנת ש.ב. “+” = מוצדקים, שאינם מורידים. הערכים נקבעים בהגדרות הפרויקט.`
            : "“+” = חיסורים מוצדקים."}{" "}
          לחיצה על שורה פותחת פירוט.
        </p>
      </section>

      <section className="card stack">
        <h3>תקופה</h3>
        <div className="row nowrap">
          <label className="row nowrap grow">
            <span className="small">מ־</span>
            <input type="date" className="field date grow" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="מתאריך" />
          </label>
          <label className="row nowrap grow">
            <span className="small">עד</span>
            <input type="date" className="field date grow" value={to} onChange={(e) => setTo(e.target.value)} aria-label="עד תאריך" />
          </label>
        </div>
        <div className="row">
          <button className="btn grow" onClick={copy}>
            העתק טבלה
          </button>
          {(from || to) && (
            <button className="btn quiet" onClick={() => (setFrom(""), setTo(""))}>
              כל השנה
            </button>
          )}
        </div>
        {note && (
          <p className="sub" role="status">
            {note}
          </p>
        )}
      </section>

      {open && <Detail ctx={ctx} participantId={open} row={rows.find((r) => r.id === open)} onClose={() => setOpen(null)} />}
    </>
  );
}

function Detail({ ctx, participantId, row, onClose }: { ctx: ProjectCtx; participantId: string; row?: TrackRow; onClose: () => void }) {
  const t = useTables();
  const dateOf = new Map(ctx.lessons.map((l) => [l.id, l.date]));
  const mine = t.marks
    .filter((m) => m.participant_id === participantId && dateOf.has(m.lesson_id))
    .sort((a, b) => dateOf.get(b.lesson_id)!.localeCompare(dateOf.get(a.lesson_id)!));
  return (
    <Sheet title={row?.name || ""} onClose={onClose}>
      <div className="stack">
        {row && ctx.features.discipline && (
          <p>
            ציון <b className="grade">{row.grade}</b> · {row.lessons} שיעורים{row.rate !== null ? ` · ${row.rate}% נוכחות` : ""}
          </p>
        )}
        {!mine.length && <p className="muted">אין רישומים — נוכח בכל השיעורים.</p>}
        <div className="list">
          {mine.map((m) => {
            const date = dateOf.get(m.lesson_id)!;
            return (
              <div key={m.lesson_id} className="list-row" style={{ flexWrap: "wrap" }}>
                <b style={{ minWidth: 70 }}>{shortDate(date)}</b>
                <span className="grow row" style={{ gap: 6 }}>
                  {m.status && <span className={"tag" + (m.status === "absent" ? " warn" : "")}>{m.status === "absent" ? "חיסור" : "איחור"}</span>}
                  {m.no_homework && <span className="tag warn">בלי ש.ב.</span>}
                </span>
                {m.status && ctx.features.discipline && (
                  <button
                    className={"chip sm" + (m.justified ? " on" : "")}
                    aria-pressed={m.justified}
                    onClick={() => writeMark(ctx.project.id, date, participantId, { justified: !m.justified })}
                  >
                    {m.justified ? "✓ מוצדק" : "סמן כמוצדק"}
                  </button>
                )}
                <button
                  className="btn quiet sm"
                  aria-label="מחק את הרישום"
                  onClick={() => writeMark(ctx.project.id, date, participantId, { status: null, no_homework: false })}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
