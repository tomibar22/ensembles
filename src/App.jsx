import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as Sheets from "./sheets.js";
import {
  CLASSES,
  KEYS,
  TABS,
  TEACHER,
  ROSTERS,
  ROLE_LABEL,
  EMPTY,
  pairKey,
  bestDraw,
  capacity,
  bottleneck,
  encodeLedger,
  decodeLedger,
  ledgerToRows,
  rowsToLedger,
} from "./ensembles.js";

/* מטמון מקומי. מקור האמת הוא הגיליון, וזה מה שמאפשר לעבוד גם בלי רשת */
const store = {
  get(k) {
    try {
      const v = localStorage.getItem(k);
      return v ? { value: v } : null;
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

/* ============================ נוכחות ============================ */

/* מי לא הגיע היום. נשמר ליום אחד בלבד: היעדרות שנגררת בשקט לשיעור הבא
   מסוכנת יותר מהטרחה לסמן מחדש. */
const ABSENT_KEY = (cls) => `ens-absent-${TABS[cls]}`;
const todayStamp = () => new Date().toISOString().slice(0, 10);

function loadAbsent(cls) {
  try {
    const r = store.get(ABSENT_KEY(cls));
    if (!r) return [];
    const o = JSON.parse(r.value);
    return o.d === todayStamp() && Array.isArray(o.ids) ? o.ids : [];
  } catch {
    return [];
  }
}
const saveAbsent = (cls, ids) => store.set(ABSENT_KEY(cls), JSON.stringify({ d: todayStamp(), ids }));

/* ============================ עיצוב ============================ */

const C = {
  bg: "#161320",
  panel: "#211D2E",
  soft: "#2A2539",
  line: "#3A3350",
  ink: "#F3EFE7",
  dim: "#A79FBD",
  brass: "#E3A84C",
  teal: "#63B7A6",
  rose: "#D4737E",
};
const TINT = { "תופים": C.rose, "בס": C.teal, "פסנתר": C.brass, "גיטרה": C.brass };

function Chip({ m, twice }) {
  const tint = m.teacher ? C.teal : TINT[m.playing] || C.dim;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        padding: "7px 12px",
        borderRadius: 999,
        background: m.slot !== "melody" ? "rgba(255,255,255,0.06)" : "transparent",
        border: `1px ${m.teacher ? "dashed" : "solid"} ${m.slot !== "melody" ? tint + "66" : C.line}`,
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 500 }}>{m.name}</span>
      {m.teacher && <span style={{ color: C.teal, fontSize: 12 }}>מורה</span>}
      <span style={{ color: tint, fontSize: 13 }}>{m.playing}</span>
      {twice && (
        <span style={{ color: C.brass, fontSize: 12, fontWeight: 700 }} title="מנגן בשני הרכבים היום">
          ×2
        </span>
      )}
    </div>
  );
}

export default function App() {
  const [cls, setCls] = useState(CLASSES[0]);
  const roster = ROSTERS[cls];
  const [teacherOn, setTeacherOn] = useState(true);
  const [absent, setAbsent] = useState(() => new Set(loadAbsent(CLASSES[0])));
  const present = useMemo(() => roster.filter((s) => !absent.has(s.id)), [roster, absent]);
  const pool = useMemo(() => (teacherOn ? [...present, TEACHER] : present), [present, teacherOn]);
  const caps = useMemo(() => capacity(pool), [pool]);
  const neck = useMemo(() => bottleneck(pool), [pool]);
  // k נגזר ולא נשמר: כך הוא לא נשאר גדול מהאפשרי אחרי שסימנו נעדרים
  const [kPick, setKPick] = useState(null); // null = ללכת אחרי ההמלצה
  const k = kPick === null ? caps.rec : Math.min(kPick, caps.max);
  const [ledger, setLedger] = useState(EMPTY);
  const [res, setRes] = useState(null);
  const [saved, setSaved] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [showRoll, setShowRoll] = useState(false); // רק כדי לפתוח כשכבר יש חלוקה
  // הנוכחות פתוחה כל עוד אין חלוקה על המסך; אחריה היא מתקפלת לשורת סיכום
  const rollOpen = !res || showRoll;
  const [drawErr, setDrawErr] = useState("");
  const [transfer, setTransfer] = useState(null); // טקסט הפנקס לייצוא/ייבוא
  const [note, setNote] = useState("");
  const [gOn, setGOn] = useState(Sheets.connected());
  const [gMsg, setGMsg] = useState("");
  const [gBusy, setGBusy] = useState(false);
  const ledgerRef = useRef(ledger);
  useEffect(() => {
    ledgerRef.current = ledger;
  }, [ledger]);

  useEffect(() => {
    setKPick(null);
    setAbsent(new Set(loadAbsent(cls)));
    setRes(null);
    setSaved(false);
    setDrawErr("");
    let alive = true;
    (async () => {
      let l = EMPTY;
      try {
        const r = store.get(KEYS[cls]);
        if (r) l = { ...EMPTY, ...JSON.parse(r.value) };
      } catch {}
      if (alive) setLedger(l);
    })();
    return () => (alive = false);
  }, [cls]);

  useEffect(() => {
    setRes(null);
    setSaved(false);
    setDrawErr("");
  }, [teacherOn]);

  const toggleAbsent = (id) => {
    const next = new Set(absent);
    next.has(id) ? next.delete(id) : next.add(id);
    setAbsent(next);
    saveAbsent(cls, [...next]);
    setRes(null);
    setSaved(false);
    setDrawErr("");
  };

  const clearAbsent = () => {
    setAbsent(new Set());
    saveAbsent(cls, []);
    setRes(null);
    setSaved(false);
    setDrawErr("");
  };

  // משיכה מהגיליון: מקור האמת. localStorage נשאר כמטמון לשיעור בלי רשת.
  const pull = useCallback(
    async (silent) => {
      if (!Sheets.connected()) return;
      setGBusy(true);
      try {
        const rows = await Sheets.readRows(TABS[cls]);
        const local = ledgerRef.current;
        // לשונית ריקה בגיליון ופנקס מקומי קיים — מעלים את המקומי במקום למחוק אותו
        if (!rows.length && local.lessons > 0) {
          await Sheets.writeRows(TABS[cls], ledgerToRows(cls, local));
          setGMsg(`הפנקס המקומי הועלה לגיליון · ${local.lessons} שיעורים`);
          return;
        }
        const next = rowsToLedger(cls, rows);
        setLedger(next);
        store.set(KEYS[cls], JSON.stringify(next));
        setGMsg(`מסונכרן · ${next.lessons} שיעורים בגיליון`);
      } catch (e) {
        setGOn(Sheets.connected());
        if (!silent) setGMsg(e.message);
      } finally {
        setGBusy(false);
      }
    },
    [cls]
  );

  useEffect(() => {
    if (gOn) pull(true);
  }, [cls, gOn, pull]);

  const connect = async () => {
    setGMsg("");
    setGBusy(true);
    try {
      await Sheets.connect();
      setGOn(true);
    } catch (e) {
      setGMsg(e.message);
    } finally {
      setGBusy(false);
    }
  };

  const draw = useCallback(() => {
    const r = bestDraw(pool, k, ledger);
    setRes(r);
    setSaved(false);
    if (r) setShowRoll(false);
    setDrawErr(
      r
        ? ""
        : `אי אפשר להרכיב ${k} הרכבים מ-${pool.length} הנוכחים — בכל הרכב חייבים תופים, בס וכלי הרמוני. נסה פחות הרכבים, או בדוק את הנוכחות.`
    );
  }, [pool, k, ledger]);

  const save = async () => {
    if (!res) return;
    const plays = { ...ledger.plays };
    const pairs = { ...ledger.pairs };
    roster.forEach((s) => (plays[s.id] = (plays[s.id] || 0) + (res.load[s.id] || 0)));
    // המורה לא נספר בפנקס — הוא ממלא כיסא, לא מתחרה על זמן ניגון
    res.groups.forEach((g) =>
      g.forEach((a, i) =>
        g.slice(i + 1).forEach((b) => {
          if (a.teacher || b.teacher) return;
          const key = pairKey(a.id, b.id);
          pairs[key] = (pairs[key] || 0) + 1;
        })
      )
    );
    const next = { plays, pairs, lessons: ledger.lessons + 1 };
    setLedger(next);
    setSaved(true);
    store.set(KEYS[cls], JSON.stringify(next));
    if (Sheets.connected()) {
      setGBusy(true);
      try {
        await Sheets.writeRows(TABS[cls], ledgerToRows(cls, next));
        setGMsg(`נשמר בגיליון · ${next.lessons} שיעורים`);
      } catch (e) {
        setGOn(Sheets.connected());
        setGMsg("נשמר במכשיר אבל לא בגיליון — " + e.message);
      } finally {
        setGBusy(false);
      }
    }
  };

  const reset = async () => {
    setLedger(EMPTY);
    setSaved(false);
    store.set(KEYS[cls], JSON.stringify(EMPTY));
    if (Sheets.connected()) {
      try {
        await Sheets.writeRows(TABS[cls], ledgerToRows(cls, EMPTY));
        setGMsg("הפנקס אופס גם בגיליון");
      } catch (e) {
        setGMsg(e.message);
      }
    }
  };

  const btn = (bg, fg) => ({
    background: bg,
    color: fg,
    border: "none",
    borderRadius: 10,
    padding: "11px 18px",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  });

  const ledgerRows = useMemo(
    () =>
      [...roster]
        .map((s) => ({ ...s, n: ledger.plays[s.id] || 0 }))
        .sort((a, b) => a.n - b.n || a.name.localeCompare(b.name, "he")),
    [roster, ledger]
  );
  const avg = ledger.lessons
    ? (roster.reduce((a, s) => a + (ledger.plays[s.id] || 0), 0) / roster.length).toFixed(1)
    : 0;

  return (
    <div dir="rtl" style={{ background: C.bg, minHeight: "100vh", padding: "22px 16px 48px", fontFamily: "'Heebo', system-ui, sans-serif", color: C.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700&family=Frank+Ruhl+Libre:wght@500;700&display=swap');`}</style>

      <header style={{ maxWidth: 760, margin: "0 auto 18px" }}>
        <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 34, margin: 0 }}>חלוקת הרכבים</h1>
        <p style={{ color: C.dim, margin: "6px 0 0", fontSize: 15, lineHeight: 1.6 }}>
          תופים, בס וכלי הרמוני בכל הרכב. מי שנדרש פעמיים מסומן ×2, והפנקס דואג שזה יתחלף בין השיעורים. תומר נכנס להרכב אחד ואינו נספר בפנקס.
        </p>
      </header>

      <div style={{ maxWidth: 760, margin: "0 auto 16px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {CLASSES.map((c) => (
              <button key={c} onClick={() => setCls(c)} style={btn(cls === c ? C.brass : C.soft, cls === c ? "#241B08" : C.ink)}>
                כיתה {c}
              </button>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: C.dim, fontSize: 15 }}>
            הרכבים
            <select
              value={k}
              onChange={(e) => setKPick(Number(e.target.value))}
              style={{ background: C.soft, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 10px", fontSize: 16, fontFamily: "inherit" }}
            >
              {Array.from({ length: caps.max }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === caps.rec ? " · מומלץ" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setTeacherOn(!teacherOn)}
            style={{
              ...btn(teacherOn ? C.soft : "transparent", teacherOn ? C.ink : C.dim),
              border: `1px solid ${teacherOn ? C.teal + "88" : C.line}`,
            }}
            title="תומר תופס כיסא פסנתר בהרכב אחד, ומחליף תלמיד שהיה צריך לנגן פעמיים"
          >
            {teacherOn ? "✓ " : ""}תומר בהרכבים
          </button>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <button
            onClick={gOn ? () => pull(false) : connect}
            disabled={gBusy}
            style={{
              ...btn("transparent", gOn ? C.teal : C.ink),
              border: `1px solid ${gOn ? C.teal + "88" : C.line}`,
              padding: "8px 14px",
              fontSize: 14,
            }}
          >
            {gBusy ? "מסנכרן…" : gOn ? "רענן מהגיליון" : "התחבר לגיליון"}
          </button>
          <span style={{ color: C.dim, fontSize: 13 }}>{gMsg || (gOn ? "" : "בלי חיבור, הפנקס נשמר רק במכשיר הזה")}</span>
        </div>
        <p style={{ color: C.dim, fontSize: 14, margin: "12px 0 0", lineHeight: 1.6 }}>
          {ledger.lessons
            ? `${ledger.lessons} שיעורים בפנקס · ממוצע ${avg} הרכבים לתלמיד. החלוקה מעדיפה את מי שצבר פחות.`
            : "עדיין אין שיעורים בפנקס. אחרי כל שיעור לחץ ״שמור״, וההגרלות הבאות יתקנו את מי שקופח."}
        </p>
      </div>

      {/* הנוכחות היא השלב שלפני החלוקה, ולכן היא פתוחה כל עוד אין תוצאה
          וכפתור החלוקה יושב בסופה. ברגע שיש חלוקה היא מתקפלת לשורה אחת. */}
      <section style={{ maxWidth: 760, margin: "0 auto 16px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
        {rollOpen ? (
          <>
            <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 20, margin: "0 0 6px" }}>מי כאן היום?</h2>
            <div style={{ color: C.dim, fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
              לחץ על מי שלא הגיע. נעדר לא נכנס לחלוקה וגם לא צובר הרכבים בפנקס — ולכן תהיה לו עדיפות
              בשיעור הבא. הסימון נמחק מעצמו בסוף היום.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {roster.map((s) => {
                const out = absent.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleAbsent(s.id)}
                    aria-pressed={out}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 6,
                      padding: "7px 12px",
                      borderRadius: 999,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 15,
                      background: out ? "transparent" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${out ? C.line : C.teal + "66"}`,
                      color: out ? C.dim : C.ink,
                      textDecoration: out ? "line-through" : "none",
                    }}
                  >
                    {s.name}
                    <span style={{ color: out ? C.dim : TINT[s.instruments[0]] || C.dim, fontSize: 13 }}>
                      {s.instruments[0]}
                    </span>
                  </button>
                );
              })}
            </div>
            {absent.size > 0 && (
              <p style={{ color: C.dim, fontSize: 13, margin: "12px 0 0", lineHeight: 1.6 }}>
                {present.length} נוכחים · אפשר עד {caps.max} הרכבים
                {neck.limit <= caps.max ? ` — ${ROLE_LABEL[neck.role]} נוכחים: ${neck.count}` : ""}.
              </p>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
              <button onClick={draw} style={btn(C.teal, "#0C2320")}>
                {res ? "חלק מחדש" : `חלק את ${present.length} הנוכחים ל-${k} הרכבים`}
              </button>
              {absent.size > 0 && (
                <button onClick={clearAbsent} style={{ ...btn("transparent", C.dim), border: `1px solid ${C.line}`, padding: "8px 14px", fontSize: 14 }}>
                  כולם נוכחים
                </button>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, color: absent.size ? C.rose : C.dim }}>
              {absent.size ? `${present.length} מתוך ${roster.length} נוכחים` : "כל הכיתה נוכחת"}
            </span>
            <button
              onClick={() => setShowRoll(true)}
              style={{ ...btn("transparent", C.ink), border: `1px solid ${C.line}`, padding: "8px 14px", fontSize: 14 }}
            >
              שנה נוכחות
            </button>
            <button onClick={draw} style={{ ...btn(C.teal, "#0C2320"), marginRight: "auto" }}>
              חלק מחדש
            </button>
          </div>
        )}
      </section>

      <main style={{ maxWidth: 760, margin: "0 auto" }}>
        {!res && drawErr && (
          <div style={{ border: `1px solid ${C.rose}66`, borderRadius: 14, padding: "24px 20px", textAlign: "center", color: C.rose, lineHeight: 1.6 }}>
            {drawErr}
          </div>
        )}

        {res &&
          res.groups.map((g, i) => (
            <section key={i} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 22, margin: 0, color: C.brass }}>הרכב {i + 1}</h2>
                <span style={{ color: C.dim, fontSize: 13 }}>{g.length} נגנים</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {g.map((m) => (
                  <Chip key={m.id + m.playing} m={m} twice={res.load[m.id] > 1} />
                ))}
              </div>
            </section>
          ))}

        {res && res.bench.length > 0 && (
          <section style={{ border: `1px dashed ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <div style={{ color: C.dim, fontSize: 14, marginBottom: 8 }}>יושבים היום (הכי הרבה הרכבים עד עכשיו) — יקבלו עדיפות בשיעור הבא</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {res.bench.map((s) => (
                <span key={s.id} style={{ border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 12px", fontSize: 15 }}>
                  {s.name} <span style={{ color: C.dim, fontSize: 13 }}>{s.instruments[0]}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {res && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
            <button onClick={save} disabled={saved} style={btn(saved ? C.soft : C.brass, saved ? C.dim : "#241B08")}>
              {saved ? "נשמר בפנקס" : "שמור את השיעור בפנקס"}
            </button>
            <button onClick={() => setShowLedger(!showLedger)} style={{ ...btn("transparent", C.dim), border: `1px solid ${C.line}` }}>
              {showLedger ? "הסתר פנקס" : "הצג פנקס"}
            </button>
            <button
              onClick={() => {
                setNote("");
                setTransfer(transfer === null ? encodeLedger(cls, ledger) : null);
              }}
              style={{ ...btn("transparent", C.dim), border: `1px solid ${C.line}` }}
            >
              גיבוי / שחזור
            </button>
            {ledger.lessons > 0 && (
              <button onClick={reset} style={{ ...btn("transparent", C.dim), border: `1px solid ${C.line}` }}>
                אפס
              </button>
            )}
          </div>
        )}

        {transfer !== null && (
          <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginTop: 12 }}>
            <div style={{ color: C.dim, fontSize: 14, marginBottom: 8, lineHeight: 1.6 }}>
              זה הפנקס של כיתה {cls} כטקסט. העתק ושמור אותו איפה שנוח — ואם האפליקציה תתחיל מאפס, הדבק אותו כאן ולחץ ״טען״.
            </div>
            <textarea
              value={transfer}
              onChange={(e) => setTransfer(e.target.value)}
              spellCheck={false}
              dir="ltr"
              style={{
                width: "100%",
                minHeight: 110,
                background: C.bg,
                color: C.ink,
                border: `1px solid ${C.line}`,
                borderRadius: 10,
                padding: 10,
                fontSize: 13,
                fontFamily: "ui-monospace, monospace",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(transfer);
                    setNote("הועתק");
                  } catch {
                    setNote("סמן והעתק ידנית");
                  }
                }}
                style={btn(C.soft, C.ink)}
              >
                העתק
              </button>
              <button
                onClick={async () => {
                  try {
                    const { ledger: next, dropped, added } = decodeLedger(cls, transfer.trim());
                    setLedger(next);
                    setRes(null);
                    setSaved(false);
                    setDrawErr("");
                    const extra = [
                      dropped ? `${dropped} מהגיבוי כבר לא ברשימה` : "",
                      added ? `${added} תלמידים חדשים מתחילים מאפס` : "",
                    ].filter(Boolean);
                    setNote(`נטען: ${next.lessons} שיעורים` + (extra.length ? " · " + extra.join(" · ") : ""));
                    try {
                      store.set(KEYS[cls], JSON.stringify(next));
                    } catch {}
                  } catch (e) {
                    setNote("הטקסט לא תקין — " + (e.message || ""));
                  }
                }}
                style={btn(C.brass, "#241B08")}
              >
                טען
              </button>
              {note && <span style={{ color: C.dim, fontSize: 14 }}>{note}</span>}
            </div>
          </section>
        )}

        {showLedger && (
          <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginTop: 12 }}>
            <div style={{ color: C.dim, fontSize: 14, marginBottom: 10 }}>סה״כ הרכבים לתלמיד ב-{ledger.lessons} שיעורים · מלמעלה למטה, מהמקופח לעמוס</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 18px" }}>
              {ledgerRows.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${C.line}`, padding: "4px 0", fontSize: 15 }}>
                  <span>{s.name}</span>
                  <span style={{ color: s.n <= (ledgerRows[0]?.n ?? 0) ? C.teal : C.dim }}>{s.n}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
