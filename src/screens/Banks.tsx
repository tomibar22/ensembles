import { Icon } from "../components/Icon";
import { useMemo, useState } from "react";
import { Confirm, Field, Seg, Sheet, TopBar } from "../components/ui";
import { mergeBankItems, renameBankItem } from "../data/actions";
import { go, useDefaults } from "../data/hooks";
import { remove, upsert, useTables } from "../data/store";
import { BANK_LABEL, type BankItem, type BankKind } from "../data/types";
import { normTitle, shortDate } from "../engine/derive";

type Sort = "recent" | "count" | "alpha" | "new";
interface Use {
  date: string;
  projectId: string;
}

/**
 * הבנקים: כל הרפרטואר, התרגילים ושיעורי הבית שנכתבו אי־פעם, בכל הפרויקטים.
 * מסננים לפי סוג פרויקט, שכבה או פרויקט; ממיינים לפי שימוש; ואפשר לראות מה
 * עוד לא נעשה בקבוצה מסוימת — שימושי כשמתכננים שיעור.
 */
export default function Banks() {
  const t = useTables();
  const defaults = useDefaults();
  const [kind, setKind] = useState<BankKind>("repertoire");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [typeId, setTypeId] = useState("");
  const [grade, setGrade] = useState("");
  const [projectId, setProjectId] = useState("");
  const [unused, setUnused] = useState(false);
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const projects = useMemo(() => new Map(t.projects.map((p) => [p.id, p])), [t.projects]);
  const uses = useMemo(() => {
    const dateOf = new Map(t.lessons.map((l) => [l.id, l.date]));
    const map = new Map<string, Use[]>();
    t.lesson_items.forEach((li) => {
      const date = dateOf.get(li.lesson_id);
      if (date) map.set(li.item_id, [...(map.get(li.item_id) || []), { date, projectId: li.project_id }]);
    });
    map.forEach((list) => list.sort((a, b) => b.date.localeCompare(a.date)));
    return map;
  }, [t.lesson_items, t.lessons]);

  const scoped = (u: Use) => {
    const p = projects.get(u.projectId);
    return !!p && (!typeId || p.type_id === typeId) && (!grade || p.grade === grade) && (!projectId || p.id === projectId);
  };
  const filtering = !!(typeId || grade || projectId);

  const rows = useMemo(() => {
    const n = normTitle(q);
    const list = t.bank_items
      .filter((b) => b.kind === kind && b.archived === archived && (!n || normTitle(b.title + " " + b.notes + " " + b.tags.join(" ")).includes(n)))
      .map((b) => {
        const all = uses.get(b.id) || [];
        const inScope = all.filter(scoped);
        return { item: b, all, inScope };
      })
      // "עוד לא נעשה": הפריט קיים בבנק, אבל לא בקבוצה/בשכבה שנבחרה
      .filter((r) => (unused && filtering ? r.inScope.length === 0 : !filtering || r.inScope.length > 0));
    const shown = (r: (typeof list)[number]) => (unused ? r.all : r.inScope);
    const by: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      recent: (a, b) => (shown(b)[0]?.date || "").localeCompare(shown(a)[0]?.date || ""),
      count: (a, b) => shown(b).length - shown(a).length,
      alpha: () => 0,
      new: (a, b) => b.item.created_at.localeCompare(a.item.created_at),
    };
    return list.sort((a, b) => by[sort](a, b) || a.item.title.localeCompare(b.item.title, "he"));
    // scoped תלוי בשלושת המסננים, שכולם ברשימת התלויות
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.bank_items, uses, kind, q, sort, typeId, grade, projectId, unused, archived, projects]);

  const openItem = t.bank_items.find((b) => b.id === open);
  const grades = [...new Set([...defaults.grades, ...t.projects.map((p) => p.grade || "")])].filter(Boolean);

  return (
    <div className="app stack">
      <TopBar title="הבנקים" back={() => go()} />
      <Seg<BankKind> full label="איזה בנק" value={kind} onChange={setKind} options={(Object.keys(BANK_LABEL) as BankKind[]).map((k) => [k, BANK_LABEL[k]])} />
      <input className="field" type="search" placeholder="חיפוש…" aria-label="חיפוש בבנק" value={q} onChange={(e) => setQ(e.target.value)} />

      <section className="card flat stack tight">
        <div className="row nowrap">
          <select className="field grow" aria-label="סוג פרויקט" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">כל הסוגים</option>
            {t.project_types.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <select className="field grow" aria-label="שכבה" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">כל השכבות</option>
            {grades.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        <div className="row nowrap">
          <select className="field grow" aria-label="פרויקט" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">כל הפרויקטים</option>
            {t.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select className="field grow" aria-label="מיון" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="recent">שימוש אחרון</option>
            <option value="count">הכי בשימוש</option>
            <option value="alpha">א–ב</option>
            <option value="new">נוספו לאחרונה</option>
          </select>
        </div>
        <div className="chips">
          <button className={"chip sm" + (unused ? " on" : "")} aria-pressed={unused} disabled={!filtering} onClick={() => setUnused(!unused)} style={{ opacity: filtering ? 1 : 0.5 }}>
            מה שעוד לא נעשה שם
          </button>
          <button className={"chip sm" + (archived ? " on" : "")} aria-pressed={archived} onClick={() => setArchived(!archived)}>
            ארכיון
          </button>
          {(filtering || unused) && (
            <button className="chip sm dashed" onClick={() => (setTypeId(""), setGrade(""), setProjectId(""), setUnused(false))}>
              נקה סינון
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <h2>{BANK_LABEL[kind]}</h2>
          <span className="count">{rows.length}</span>
        </div>
        {!rows.length && <p className="muted">{q || filtering ? "אין תוצאות לסינון הזה." : "הבנק ריק — הוא מתמלא מעצמו כשמתעדים שיעורים."}</p>}
        <div className="list">
          {rows.map(({ item, all, inScope }) => {
            const list = unused ? all : inScope;
            const last = list[0];
            return (
              <button key={item.id} className="list-row" onClick={() => setOpen(item.id)}>
                <span className="grow">
                  <b dir="auto">{item.title}</b>
                  {item.tags.map((tag) => (
                    <span key={tag} className="tag sky" style={{ marginInlineStart: 6 }}>
                      {tag}
                    </span>
                  ))}
                  <br />
                  <span className="sub">
                    {last ? `${shortDate(last.date)} · ${projects.get(last.projectId)?.name || ""}` : "עוד לא בשימוש"}
                    {item.notes && ` · ${item.notes}`}
                  </span>
                </span>
                {list.length > 0 && <span className="tag">×{list.length}</span>}
              </button>
            );
          })}
        </div>
      </section>

      {openItem && <ItemSheet item={openItem} uses={uses.get(openItem.id) || []} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ItemSheet({ item, uses, onClose }: { item: BankItem; uses: Use[]; onClose: () => void }) {
  const t = useTables();
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes);
  const [tags, setTags] = useState(item.tags.join(", "));
  const [mergeInto, setMergeInto] = useState("");
  const [confirm, setConfirm] = useState<"merge" | "delete" | null>(null);
  const projects = new Map(t.projects.map((p) => [p.id, p]));
  const media = t.media.filter((m) => m.item_id === item.id);
  const others = t.bank_items.filter((b) => b.kind === item.kind && b.id !== item.id).sort((a, b) => a.title.localeCompare(b.title, "he"));
  const target = others.find((b) => b.id === mergeInto);
  const save = () => {
    const next = { ...item, notes: notes.trim(), tags: tags.split(/[,،]/).map((s) => s.trim()).filter(Boolean) };
    const clean = title.replace(/\s+/g, " ").trim();
    if (clean && clean !== item.title) renameBankItem(next, clean);
    else upsert("bank_items", next);
    onClose();
  };
  return (
    <Sheet title={BANK_LABEL[item.kind]} onClose={onClose}>
      <div className="stack">
        <Field label="כותרת">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="הערות">
          <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="סולם, מקור, קישור…" />
        </Field>
        <Field label="תגיות (מופרדות בפסיק)">
          <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="בלוז, סטנדרט, קצב…" />
        </Field>
        <button className="btn primary big" onClick={save}>
          שמור
        </button>

        <div>
          <h3 style={{ marginBottom: 4 }}>איפה ומתי ({uses.length})</h3>
          {!uses.length && <p className="muted">עוד לא בשימוש.</p>}
          <div className="list">
            {uses.map((u, i) => (
              <button key={i} className="list-row" style={{ minHeight: 44 }} onClick={() => go("p", u.projectId, "lesson", u.date)}>
                <b style={{ minWidth: 70 }}>{shortDate(u.date)}</b>
                <span className="grow">{projects.get(u.projectId)?.name}</span>
                <span className="muted"><Icon name="forward" size={18} /></span>
              </button>
            ))}
          </div>
        </div>

        {media.length > 0 && (
          <div>
            <h3 style={{ marginBottom: 4 }}>סרטונים ({media.length})</h3>
            <div className="list">
              {media.map((m) => (
                <a key={m.id} className="list-row" style={{ minHeight: 44 }} href={m.url} target="_blank" rel="noreferrer">
                  <Icon name="video" /> <span className="grow">{m.title}</span>
                  <span className="sub">{projects.get(m.project_id)?.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {others.length > 0 && (
          <div className="stack tight">
            <h3>מיזוג כפילות</h3>
            <div className="row nowrap">
              <select className="field grow" aria-label="מזג לתוך" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
                <option value="">מזג לתוך…</option>
                {others.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
              <button className="btn" disabled={!target} onClick={() => setConfirm("merge")}>
                מזג
              </button>
            </div>
          </div>
        )}

        <div className="row">
          <button className="btn grow" onClick={() => (upsert("bank_items", { ...item, archived: !item.archived }), onClose())}>
            {item.archived ? "החזר מהארכיון" : "העבר לארכיון"}
          </button>
          <button className="btn danger" onClick={() => setConfirm("delete")}>
            מחק
          </button>
        </div>
      </div>
      {confirm === "merge" && target && (
        <Confirm
          title="למזג?"
          body={`“${item.title}” יימחק, ו-${uses.length} השימושים שלו יעברו ל“${target.title}”. אין לזה ביטול.`}
          action="מזג"
          onConfirm={() => (mergeBankItems(item.id, target.id), onClose())}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "delete" && (
        <Confirm
          title="למחוק מהבנק?"
          body={`“${item.title}” יימחק מהבנק ומ-${uses.length} השיעורים שבהם הוא מופיע. אין לזה ביטול. כדי רק להסתיר אותו מההצעות — העבר לארכיון.`}
          action="מחק"
          onConfirm={() => (remove("bank_items", { id: item.id }), onClose())}
          onClose={() => setConfirm(null)}
        />
      )}
    </Sheet>
  );
}
