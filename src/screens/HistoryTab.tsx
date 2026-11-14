import { Icon } from "../components/Icon";
import { useMemo } from "react";
import { go, type ProjectCtx } from "../data/hooks";
import { useTables } from "../data/store";
import { BANK_KINDS, BANK_ONE } from "../data/types";
import { dayName, itemsOf, shortDate } from "../engine/derive";

/** יומן השיעורים של הפרויקט, מהאחרון לראשון. לחיצה פותחת את השיעור לעריכה. */
export default function HistoryTab({ ctx, today }: { ctx: ProjectCtx; today: string }) {
  const t = useTables();
  const bank = useMemo(() => new Map(t.bank_items.map((b) => [b.id, b])), [t.bank_items]);
  return (
    <>
      <div className="row">
        <button className="btn accent grow" onClick={() => go("p", ctx.project.id, "lesson")}>
          השיעור של היום
        </button>
        <label className="btn" style={{ position: "relative" }}>
          תאריך אחר
          <input
            type="date"
            aria-label="פתח שיעור בתאריך אחר"
            max={today}
            style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%" }}
            onChange={(e) => e.target.value && go("p", ctx.project.id, "lesson", e.target.value)}
          />
        </label>
      </div>
      {!ctx.lessons.length && <p className="card muted center">עוד לא נרשם שיעור.</p>}
      {ctx.lessons.map((l) => {
        const marks = t.marks.filter((m) => m.lesson_id === l.id);
        const absent = marks.filter((m) => m.status === "absent").length;
        const late = marks.filter((m) => m.status === "late").length;
        const hasDraw = t.draws.some((d) => d.lesson_id === l.id);
        const media = t.media.filter((m) => m.lesson_id === l.id).length;
        const fields = BANK_KINDS.map((k) => ({ k, titles: itemsOf(l.id, k, t.lesson_items, bank).map((x) => x.item.title) })).filter((f) => f.titles.length);
        const lines = l.description.split("\n").filter((s) => s.trim());
        return (
          <button key={l.id} className="card tap margin" onClick={() => go("p", ctx.project.id, "lesson", l.date)}>
            <div className="row spread nowrap">
              <h2>{shortDate(l.date)}</h2>
              <span className="sub">{dayName(l.date)}</span>
            </div>
            {fields.map((f) => (
              <p key={f.k}>
                <b className="small muted">{BANK_ONE[f.k]}:</b> {f.titles.join(" · ")}
              </p>
            ))}
            {lines.length > 0 && (
              <p className="sub" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {lines.join(" · ")}
              </p>
            )}
            <div className="row" style={{ marginTop: 6, gap: 6 }}>
              {absent > 0 && <span className="tag warn">{absent} חיסורים</span>}
              {late > 0 && <span className="tag">{late} איחורים</span>}
              {hasDraw && <span className="tag sky"><Icon name="notes" size={13} />הרכבים</span>}
              {media > 0 && <span className="tag sky"><Icon name="video" size={13} />{media}</span>}
            </div>
          </button>
        );
      })}
    </>
  );
}
