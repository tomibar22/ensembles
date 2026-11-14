import { Icon } from "../components/Icon";
import { useMemo, useState } from "react";
import { Check } from "../components/ui";
import { clearDraw, saveDraw } from "../data/actions";
import { go, useLessonEngine, type ProjectCtx } from "../data/hooks";
import { patch } from "../data/store";
import type { DrawData, RuleSettings } from "../data/types";
import { BENCH, ROLES, ROLE_NAME, ROLE_PLURAL, drawText, type EditResult, type Role, type Seat } from "../engine/engine";
import { TEACHER_ID, shortDate } from "../engine/derive";

type Sel = { g: number; id: string };

/**
 * החלוקה להרכבים של השיעור. נשמרת מעצמה — היא חלק מהשיעור, והשיעורים
 * הבאים מתאזנים לפיה. עריכה ידנית שומרת על החוקים: מה שהיה שובר הרכב
 * מעומעם, ולחיצה עליו אומרת למה.
 */
export default function EnsemblesTab({ ctx, date }: { ctx: ProjectCtx; date: string }) {
  const eng = useLessonEngine(ctx, date);
  const { engine, pool, draw } = eng;
  const rules = ctx.rules;
  const [kPick, setKPick] = useState<number | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [undo, setUndo] = useState<DrawData | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [shareNote, setShareNote] = useState("");

  const caps = useMemo(() => engine.capacity(pool), [engine, pool]);
  const gaps = useMemo(() => engine.emptyRoles(pool), [engine, pool]);
  const k = kPick !== null && caps.playable.some((o) => o.k === kPick) ? kPick : caps.rec;
  const students = pool.filter((p) => !p.teacher).length;
  const name = engine.name;

  const store = (next: DrawData) => saveDraw(ctx.project.id, date, next);
  const withLeaders = (d: DrawData, reroll = false): DrawData => ({
    ...d,
    leaders: rules.leader ? engine.pickLeaders(d, reroll) : undefined,
  });

  const doDraw = () => {
    const r = engine.bestDraw(pool, k);
    setSel(null);
    setAdding(null);
    setUndo(null);
    setMsg("");
    if (!r) {
      setErr(
        `אי אפשר להרכיב ${k} הרכבים מ-${students} הנוכחים` +
          (rules.required.length ? ` — בכל הרכב חייבים ${rules.required.map((x) => ROLE_NAME[x]).join(", ")}.` : ".") +
          " נסה פחות הרכבים, בדוק את הנוכחות, או שנה את החוקים."
      );
      return;
    }
    setErr("");
    store(withLeaders({ ...r, k, rules }, true));
  };

  const run = (out: EditResult) => {
    if ("error" in out) return setMsg(out.error);
    if (!draw) return;
    setUndo(draw);
    store(withLeaders({ ...draw, ...out.draw, msg: out.msg }));
    setMsg(out.msg);
    setSel(null);
    setAdding(null);
  };

  const setRules = (change: Partial<RuleSettings>) => {
    const next = { ...ctx.project.settings.rules, ...change };
    patch("projects", { id: ctx.project.id }, { settings: { ...ctx.project.settings, rules: next } });
    if (draw && "leader" in change)
      store({ ...draw, rules: { ...draw.rules, leader: !!change.leader }, leaders: change.leader ? engine.pickLeaders(draw, true) : undefined });
  };
  const toggleRole = (r: Role) =>
    setRules({ required: rules.required.includes(r) ? rules.required.filter((x) => x !== r) : ROLES.filter((x) => x === r || rules.required.includes(x)) });

  /* כשנבחר נגן — מסמנים מראש עם מי אפשר להחליף אותו */
  const swapOk = useMemo(() => {
    if (!draw || !sel) return null;
    const ok = new Set<string>();
    const consider = (g: number, id: string) => {
      if (g === sel.g && id === sel.id) return;
      if (!("error" in engine.swapPlayers(draw, sel, { g, id }))) ok.add(`${g}|${id}`);
    };
    draw.groups.forEach((grp, g) => grp.forEach((m) => consider(g, m.id)));
    draw.bench.forEach((id) => consider(BENCH, id));
    return ok;
  }, [draw, sel, engine]);
  const chipState = (g: number, id: string) =>
    !sel ? "" : sel.g === g && sel.id === id ? " picked" : swapOk?.has(`${g}|${id}`) ? "" : " blocked";
  const pick = (g: number, id: string) => {
    if (!draw) return;
    setAdding(null);
    if (!sel) return setSel({ g, id }), setMsg("");
    if (sel.g === g && sel.id === id) return setSel(null);
    run(engine.swapPlayers(draw, sel, { g, id }));
  };

  const share = async () => {
    if (!draw) return;
    const text = drawText(draw, `הרכבים · ${ctx.project.name} · ${shortDate(date)}`, name);
    if (navigator.share) {
      try {
        return await navigator.share({ text });
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareNote("החלוקה הועתקה — אפשר להדביק אותה בכל מקום");
    } catch {
      setShareNote("הדפדפן לא מרשה לשתף או להעתיק מכאן");
    }
  };

  const custom = JSON.stringify([...rules.required].sort()) !== JSON.stringify([...ROLES].sort());

  const rulesPanel = (
    <section className="card">
      <button className="list-row" style={{ minHeight: 32, padding: 0 }} onClick={() => setRulesOpen(!rulesOpen)} aria-expanded={rulesOpen}>
        <h2>החוקים</h2>
        <span className="sub grow">
          {rules.required.length ? rules.required.map((r) => ROLE_NAME[r]).join(" · ") : "חלוקה חופשית"}
          {rules.leader ? " · מוביל" : ""}
        </span>
        <span className="muted"><Icon name={rulesOpen ? "up" : "down"} size={18} /></span>
      </button>
      {rulesOpen && (
        <div className="stack" style={{ marginTop: 12 }}>
          <div>
            <p className="sub" style={{ marginBottom: 6 }}>
              חובה בכל הרכב (כבה כדי ליצור הרכב מיוחד):
            </p>
            <div className="chips">
              {ROLES.map((r) => (
                <button key={r} className={"chip sm" + (rules.required.includes(r) ? " on" : "")} aria-pressed={rules.required.includes(r)} onClick={() => toggleRole(r)}>
                  {ROLE_NAME[r]}
                </button>
              ))}
            </div>
          </div>
          <Check checked={rules.leader} onChange={(v) => setRules({ leader: v })}>
            <b>תלמיד מוביל</b> בכל הרכב — מי שהוביל לא יוביל שוב עד שכולם הובילו
          </Check>
          <Check checked={rules.teacher} onChange={(v) => setRules({ teacher: v })}>
            {ctx.teacher.name} ({ctx.teacher.instrument}) משתתף — בהרכב אחד, ואינו נספר
          </Check>
          <Check checked={rules.enrich} onChange={(v) => setRules({ enrich: v })}>
            כלי הרמוני שני בהרכב כשאף אחד לא יושב בחוץ
          </Check>
          <div className="row">
            <Stepper label="עד נגנים בהרכב" value={rules.maxGroup} min={2} max={12} onChange={(v) => setRules({ maxGroup: v })} />
            <Stepper label="עד הרכבים לתלמיד" value={rules.maxLoad} min={1} max={4} onChange={(v) => setRules({ maxLoad: v })} />
          </div>
          {ctx.project.settings.rules && Object.keys(ctx.project.settings.rules).length > 0 && (
            <button
              className="btn sm ghost"
              style={{ alignSelf: "start" }}
              onClick={() => patch("projects", { id: ctx.project.id }, { settings: { ...ctx.project.settings, rules: undefined } })}
            >
              חזרה לחוקי ברירת המחדל
            </button>
          )}
          {draw && <p className="sub">שינוי חוקים חל על החלוקה הבאה — “חלק מחדש” כדי להחיל עכשיו.</p>}
        </div>
      )}
    </section>
  );

  if (!ctx.active.length)
    return (
      <section className="card stack">
        <p className="muted">עוד אין משתתפים בפרויקט.</p>
        <button className="btn accent" onClick={() => go("p", ctx.project.id, "people")}>
          הוסף משתתפים
        </button>
      </section>
    );

  return (
    <>
      <section className="card">
        <div className="row spread">
          <span>
            <b>{students}</b> נוכחים{eng.absent.size ? ` · ${eng.absent.size} חסרים` : ""}
            {custom && <span className="tag sky" style={{ marginInlineStart: 6 }}>חוקים מיוחדים</span>}
          </span>
          <button className="btn sm ghost" onClick={() => go("p", ctx.project.id, "lesson", date)}>
            שנה נוכחות
          </button>
        </div>
        {gaps.length > 0 && (
          <p className="banner warn" style={{ marginTop: 10 }} role="alert">
            אין {gaps.map((r) => ROLE_PLURAL[r]).join(" ואין ")} נוכחים — אי אפשר לחלק לפי החוקים. אפשר לכבות את החובה ב“החוקים”.
          </p>
        )}
        <div className="row nowrap" style={{ marginTop: 10 }}>
          <select className="field grow" aria-label="מספר הרכבים" value={k} onChange={(e) => setKPick(Number(e.target.value))}>
            {caps.playable.map((o) => (
              <option key={o.k} value={o.k}>
                {o.k} הרכבים · {o.smallest === o.biggest ? o.biggest : `${o.smallest}–${o.biggest}`} נגנים
                {o.bench ? ` · ${o.bench} בחוץ` : ""}
                {o.k === caps.rec ? " · מומלץ" : ""}
              </option>
            ))}
            {!caps.playable.length && <option value={1}>הרכב אחד</option>}
          </select>
          <button className="btn primary" onClick={doDraw}>
            {draw ? "חלק מחדש" : "חלק"}
          </button>
        </div>
      </section>

      {(msg || err) && (
        <p className={"banner sticky" + (err ? " warn" : "")} role="status">
          {err || msg}
        </p>
      )}
      {!msg && !err && draw?.msg && <p className="banner">{draw.msg}</p>}

      {draw && (
        <>
          <div className="row spread">
            <p className="sub grow">
              {sel ? "בחר עם מי להחליף — החיוורים אינם אפשריים. לחיצה חוזרת מבטלת." : "לחץ על נגן כדי להחליף, להעביר, להוציא או לשנות כלי."}
            </p>
            {undo && (
              <button
                className="btn sm"
                onClick={() => {
                  store(undo);
                  setUndo(null);
                  setSel(null);
                  setMsg("העריכה האחרונה בוטלה.");
                }}
              >
                <Icon name="undo" size={18} /> בטל
              </button>
            )}
          </div>

          {draw.groups.map((g, i) => (
            <section key={i} className="card">
              <div className="row spread" style={{ marginBottom: 10 }}>
                <h2 className="row" style={{ gap: 8 }}>
                  הרכב <span className="group-num">{i + 1}</span>
                </h2>
                <span className="sub">{g.length} נגנים</span>
              </div>
              <div className="chips">
                {g.map((m) => (
                  <SeatChip
                    key={m.id + m.inst}
                    seat={m}
                    name={name(m.id)}
                    load={draw.load[m.id] || 1}
                    leader={draw.leaders?.[i] === m.id}
                    rhythm={ctx.catalog.role(m.inst) !== "melody"}
                    cls={chipState(i, m.id)}
                    onClick={() => pick(i, m.id)}
                  />
                ))}
              </div>
              {sel && sel.g === i && <Tools ctx={ctx} eng={eng} draw={draw} sel={sel} run={run} close={() => setSel(null)} store={store} />}
              {adding === i ? (
                <AddPicker eng={eng} draw={draw} g={i} maxGroup={rules.maxGroup} run={run} close={() => setAdding(null)} />
              ) : (
                <button className="chip sm dashed" style={{ marginTop: 10 }} onClick={() => (setAdding(i), setSel(null), setMsg(""))}>
                  <Icon name="plus" size={16} /> הוסף נגן
                </button>
              )}
            </section>
          ))}

          {draw.bench.length > 0 && (
            <section className="card dashed">
              <p className="sub" style={{ marginBottom: 8 }}>
                יושבים בחוץ — יקבלו עדיפות בשיעור הבא
              </p>
              <div className="chips">
                {draw.bench.map((id) => (
                  <button key={id} className={"chip" + chipState(BENCH, id)} onClick={() => pick(BENCH, id)}>
                    {name(id)} <span className="inst">{engine.player(id).instruments[0]}</span>
                  </button>
                ))}
              </div>
              {sel && sel.g === BENCH && <Tools ctx={ctx} eng={eng} draw={draw} sel={sel} run={run} close={() => setSel(null)} store={store} />}
            </section>
          )}

          <div className="row">
            <button className="btn grow" onClick={share}>
              שתף חלוקה
            </button>
            {rules.leader && (
              <button className="btn grow" onClick={() => store(withLeaders(draw, true))}>
                <Icon name="star" size={18} /> הגרל מובילים
              </button>
            )}
            <button
              className="btn quiet"
              onClick={() => {
                clearDraw(eng.lessonId);
                setUndo(null);
                setSel(null);
                setMsg("");
              }}
            >
              נקה
            </button>
          </div>
          {shareNote && (
            <p className="sub" role="status">
              {shareNote}
            </p>
          )}
          <p className="sub center">
            החלוקה נשמרת מעצמה ונספרת לאיזון: עד היום {eng.history.lessons} שיעורים עם חלוקה.
          </p>
        </>
      )}

      {rulesPanel}
    </>
  );
}

function SeatChip({ seat, name, load, leader, rhythm, cls, onClick }: { seat: Seat; name: string; load: number; leader: boolean; rhythm: boolean; cls: string; onClick: () => void }) {
  return (
    <button className={"chip" + (rhythm ? " rhythm" : "") + cls} onClick={onClick} aria-pressed={cls === " picked"}>
      {leader && (
        <span title="מוביל" style={{ color: "var(--late)" }}>
          <Icon name="star" size={17} fill label="מוביל" />
        </span>
      )}
      <span>{name}</span>
      {seat.id === TEACHER_ID && <span className="tag sky">מורה</span>}
      <span className="inst">{seat.inst}</span>
      {load > 1 && (
        <span className="tag" title={`מנגן ב-${load} הרכבים היום`}>
          ×{load}
        </span>
      )}
    </button>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="row nowrap grow" style={{ gap: 4 }}>
      <span className="small grow">{label}</span>
      <button className="btn sm icon" aria-label={`${label}: פחות`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <b style={{ minWidth: 22, textAlign: "center" }}>{value}</b>
      <button className="btn sm icon" aria-label={`${label}: יותר`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

type Eng = ReturnType<typeof useLessonEngine>;

function Pill({ ok = true, on = false, danger = false, onClick, children }: { ok?: boolean; on?: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={"chip sm" + (on ? " on" : "") + (ok || on ? "" : " blocked")} style={danger ? { color: "var(--warn)", borderColor: "var(--warn)" } : undefined} aria-pressed={on || undefined} onClick={onClick}>
      {children}
    </button>
  );
}

function ToolRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <p className="sub" style={{ marginBottom: 6 }}>
        {label}
      </p>
      <div className="chips">{children}</div>
    </div>
  );
}

/** מה אפשר לעשות עם הנגן שנבחר. כל כפתור מחושב מול המנוע — מה שמעומעם יסורב, עם סיבה. */
function Tools({ ctx, eng, draw, sel, run, close, store }: { ctx: ProjectCtx; eng: Eng; draw: DrawData; sel: Sel; run: (r: EditResult) => void; close: () => void; store: (d: DrawData) => void }) {
  const e = eng.engine;
  const onBench = sel.g === BENCH;
  const seat = onBench ? null : draw.groups[sel.g]?.find((m) => m.id === sel.id);
  if (!onBench && !seat) return null;
  const p = e.player(sel.id);
  const load = draw.load[sel.id] || 0;
  const others = draw.groups.map((_, i) => i).filter((i) => i !== sel.g && !draw.groups[i].some((x) => x.id === sel.id));
  const insts = [...new Set([...p.instruments, ...p.backup])];
  const isLeader = !onBench && draw.leaders?.[sel.g] === sel.id;
  return (
    <div className="tools">
      <div className="row spread">
        <span>
          <b>{p.name}</b>
          <span className="muted">{onBench ? " · על הספסל" : ` · ${seat!.inst} · הרכב ${sel.g + 1}`}</span>
        </span>
        <button className="btn sm quiet" onClick={close}>
          סגור
        </button>
      </div>
      <p className="sub">להחלפה עם נגן אחר — לחץ עליו. או:</p>
      {onBench && others.length > 0 && (
        <ToolRow label="הוסף להרכב">
          {others.map((i) => (
            <Pill key={i} ok={!("error" in e.addPlayer(draw, sel.id, i))} onClick={() => run(e.addPlayer(draw, sel.id, i))}>
              הרכב {i + 1}
            </Pill>
          ))}
        </ToolRow>
      )}
      {!onBench && others.length > 0 && (
        <ToolRow label="העבר להרכב">
          {others.map((i) => (
            <Pill key={i} ok={!("error" in e.movePlayer(draw, sel, i))} onClick={() => run(e.movePlayer(draw, sel, i))}>
              הרכב {i + 1}
            </Pill>
          ))}
        </ToolRow>
      )}
      {!onBench && !p.teacher && others.length > 0 && (
        <ToolRow label="הוסף גם להרכב (ינגן בשניים)">
          {others.map((i) => (
            <Pill key={i} ok={!("error" in e.addPlayer(draw, sel.id, i))} onClick={() => run(e.addPlayer(draw, sel.id, i))}>
              הרכב {i + 1}
            </Pill>
          ))}
        </ToolRow>
      )}
      {!onBench && insts.length > 1 && (
        <ToolRow label="כלי בהרכב הזה">
          {insts.map((inst) => (
            <Pill key={inst} on={inst === seat!.inst} ok={!("error" in e.changeInstrument(draw, sel, inst))} onClick={() => run(e.changeInstrument(draw, sel, inst))}>
              {inst}
              {!p.instruments.includes(inst) && " (משני)"}
            </Pill>
          ))}
        </ToolRow>
      )}
      {!onBench && ctx.rules.leader && !p.teacher && (
        <ToolRow label="מוביל">
          <Pill
            on={isLeader}
            onClick={() => {
              const leaders = draw.groups.map((_, i) => (i === sel.g ? sel.id : draw.leaders?.[i] === sel.id ? null : (draw.leaders?.[i] ?? null)));
              store({ ...draw, leaders });
              close();
            }}
          >
            <Icon name="star" size={16} fill={isLeader} /> {isLeader ? "מוביל את ההרכב" : "קבע כמוביל"}
          </Pill>
        </ToolRow>
      )}
      {!onBench && (
        <ToolRow label="הוצאה">
          <Pill danger ok={!("error" in e.removePlayer(draw, sel))} onClick={() => run(e.removePlayer(draw, sel))}>
            {load > 1 ? `הוצא מהרכב ${sel.g + 1}` : "הוצא לספסל"}
          </Pill>
        </ToolRow>
      )}
    </div>
  );
}

/** מי אפשר להוסיף להרכב: קודם היושבים בחוץ, ואחריהם מי שכבר מנגן בהרכב אחר. */
function AddPicker({ eng, draw, g, maxGroup, run, close }: { eng: Eng; draw: DrawData; g: number; maxGroup: number; run: (r: EditResult) => void; close: () => void }) {
  const e = eng.engine;
  const here = new Set(draw.groups[g].map((m) => m.id));
  const playing = [...new Set(draw.groups.flat().map((m) => m.id))]
    .filter((id) => !here.has(id) && !e.player(id).teacher)
    .sort((a, b) => (draw.load[a] || 0) - (draw.load[b] || 0) || e.name(a).localeCompare(e.name(b), "he"));
  const pill = (id: string, tag?: string) => (
    <Pill key={id} ok={!("error" in e.addPlayer(draw, id, g))} onClick={() => run(e.addPlayer(draw, id, g))}>
      {e.name(id)} <span className="inst">{e.player(id).instruments[0]}</span>
      {tag && <span className="tag">{tag}</span>}
    </Pill>
  );
  return (
    <div className="tools">
      <div className="row spread">
        <b>הוסף להרכב {g + 1}</b>
        <button className="btn sm quiet" onClick={close}>
          סגור
        </button>
      </div>
      {draw.groups[g].length >= maxGroup && <p className="banner warn small">ההרכב מלא ({maxGroup} נגנים). אפשר להחליף נגן, או להוציא מישהו.</p>}
      {draw.bench.length > 0 && <ToolRow label="יושבים בחוץ">{draw.bench.map((id) => pill(id))}</ToolRow>}
      {playing.length > 0 && <ToolRow label="כבר מנגנים בהרכב אחר — יקבלו כיסא נוסף">{playing.map((id) => pill(id, `×${draw.load[id] || 1}`))}</ToolRow>}
      <p className="sub" style={{ marginTop: 8 }}>
        מי שלא מופיע כאן סומן חסר — שנה את הנוכחות והוא יצטרף.
      </p>
    </div>
  );
}
