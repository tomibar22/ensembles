import { useMemo, useState } from "react";
import { addLessonItem, removeLessonItem } from "../data/actions";
import type { ProjectCtx } from "../data/hooks";
import { useTables } from "../data/store";
import { BANK_ONE, type BankItem, type BankKind } from "../data/types";
import { itemsOf, lessonIdOf, normTitle } from "../engine/derive";

/**
 * שדה חכם: רפרטואר / תרגיל / ש.ב. מקלידים, מקבלים הצעות מתוך כל מה שנכתב
 * אי־פעם (בכל הפרויקטים), ובחירה מוסיפה קפסולה. מה שלא קיים נוסף לבנק.
 * בלי הקלדה מוצע מה שהיה בשיעורים האחרונים של הפרויקט הזה — הרוב חוזר.
 */
export default function SmartField({ ctx, date, kind }: { ctx: ProjectCtx; date: string; kind: BankKind }) {
  const t = useTables();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const lessonId = lessonIdOf(ctx.project.id, date);
  const bank = useMemo(() => new Map(t.bank_items.map((b) => [b.id, b])), [t.bank_items]);
  const mine = itemsOf(lessonId, kind, t.lesson_items, bank);

  const suggestions = useMemo(() => {
    const has = new Set(mine.map((x) => x.item.id));
    const dateOf = new Map(t.lessons.map((l) => [l.id, l.date]));
    const uses = new Map<string, { n: number; here: string }>();
    t.lesson_items.forEach((li) => {
      if (li.kind !== kind) return;
      const u = uses.get(li.item_id) || { n: 0, here: "" };
      u.n++;
      const d = dateOf.get(li.lesson_id) || "";
      if (li.project_id === ctx.project.id && d > u.here && d <= date) u.here = d;
      uses.set(li.item_id, u);
    });
    const pool = t.bank_items.filter((b) => b.kind === kind && !b.archived && !has.has(b.id));
    const n = normTitle(q);
    const rank = (b: BankItem) => uses.get(b.id) || { n: 0, here: "" };
    if (!n)
      return pool
        .filter((b) => rank(b).here)
        .sort((a, b) => rank(b).here.localeCompare(rank(a).here) || rank(b).n - rank(a).n)
        .slice(0, 6);
    return pool
      .filter((b) => normTitle(b.title).includes(n))
      .sort(
        (a, b) =>
          Number(normTitle(b.title).startsWith(n)) - Number(normTitle(a.title).startsWith(n)) ||
          rank(b).here.localeCompare(rank(a).here) ||
          rank(b).n - rank(a).n
      )
      .slice(0, 8);
  }, [t.bank_items, t.lesson_items, t.lessons, q, kind, mine, ctx.project.id, date]);

  const exact = !!q.trim() && [...mine.map((x) => x.item), ...suggestions].some((b) => normTitle(b.title) === normTitle(q));
  const add = (ref: { id: string } | { title: string }) => {
    addLessonItem(ctx.project.id, date, kind, ref);
    setQ("");
  };

  return (
    <div className="smart">
      <span className="lbl" style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 4 }}>
        {BANK_ONE[kind]}
      </span>
      {mine.length > 0 && (
        <div className="chips" style={{ marginBottom: 6 }}>
          {mine.map(({ link, item }) => (
            <button
              key={link.id}
              className="chip sm on"
              onClick={() => removeLessonItem(link.id, ctx.project.id)}
              aria-label={`הסר את ${item.title}`}
            >
              <span dir="auto">{item.title}</span> <span aria-hidden>✕</span>
            </button>
          ))}
        </div>
      )}
      <input
        className="field"
        value={q}
        placeholder={`הוסף ${BANK_ONE[kind]}…`}
        aria-label={`הוסף ${BANK_ONE[kind]}`}
        enterKeyHint="done"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 200)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q.trim()) {
            e.preventDefault();
            add({ title: q });
          }
        }}
      />
      {(focus || q) && (suggestions.length > 0 || (q.trim() && !exact)) && (
        <div className="suggest">
          {suggestions.map((b) => (
            <button key={b.id} className="chip sm dashed" onMouseDown={(e) => e.preventDefault()} onClick={() => add({ id: b.id })}>
              <span dir="auto">{b.title}</span>
            </button>
          ))}
          {q.trim() && !exact && (
            <button className="chip sm" onMouseDown={(e) => e.preventDefault()} onClick={() => add({ title: q })}>
              ＋ חדש: “{q.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
