import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as Sheets from "./sheets.js";

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

/* ============================ נתוני התלמידים ============================ */

const RAW = {
  "ט׳": [
    ["אילה", "אוריין", ["אלט"]],
    ["אביגיל", "וייס גולדשטיין", ["שירה"]],
    ["אלונה", "זעירא", ["חליל"]],
    ["נועם", "טל", ["טנור"]],
    ["יהלי", "יריב", ["גיטרה", "בס"]],
    ["עדאל", "ירמקוב", ["שירה"]],
    ["סמואל", "כהן אוריה", ["חצוצרה"]],
    ["ניב", "כנען", ["בס"]],
    ["לאו", "סוסנה", ["תופים"]],
    ["דניאל", "סלומון", ["חצוצרה"]],
    ["אלון", "ספורטא", ["פסנתר"]],
    ["מאיה", "פינטו", ["חליל"]],
    ["אדם", "פלוינסקי", ["פסנתר"]],
    ["יהונתן", "פריינטא", ["תופים"]],
  ],
  "י״א": [
    ["מעיין", "אלפר", ["תופים"]],
    ["נועם", "בנימיני", ["תופים"]],
    ["יאיר", "גדות", ["טרומבון"]],
    ["גבריאל", "גדליוביץ", ["פסנתר"]],
    ["סער", "חג׳בי", ["טנור"]],
    ["עידן", "חסילביץ", ["בס"]],
    ["דן", "טל הוד", ["פסנתר"]],
    ["נגה", "יעקבי", ["אלט"]],
    ["איתן", "יעקובסון", ["תופים"]],
    ["אילון", "כהן מנור", ["טנור"]],
    ["אנדריי", "ליסובסקי", ["טנור"]],
    ["נדב", "מילדוורט", ["בס"]],
    ["שי", "ספין", ["פסנתר", "שירה"]],
    ["הלל", "עפרוני", ["חצוצרה"]],
    ["יהונתן", "צדוק", ["בס", "פסנתר"]],
    ["דן", "קוצ׳ין", ["שירה"]],
    ["ליר", "רגב", ["שירה"]],
    ["נתן", "רנדל", ["אלט"]],
    ["עידן", "שטרית", ["גיטרה"]],
    ["ארתור", "שטרן", ["גיטרה"]],
    ["קורה", "שפע", ["אלט"]],
    ["ניאה", "תורן", ["שירה"]],
  ],
};

const ROLE_OF = { "תופים": "drums", "בס": "bass", "פסנתר": "harmony", "גיטרה": "harmony" };
const UNIQUE = new Set(["תופים", "בס", "פסנתר", "גיטרה"]);
const ORDER = ["תופים", "בס", "פסנתר", "גיטרה", "חצוצרה", "טרומבון", "אלט", "טנור", "חליל", "שירה"];
const orderOf = (i) => (ORDER.indexOf(i) === -1 ? 99 : ORDER.indexOf(i));
const KEYS = { "ט׳": "ens-ledger-g9", "י״א": "ens-ledger-g11" };
const TABS = { "ט׳": "g9", "י״א": "g11" }; // לשוניות בגיליון
const MAX_LOAD = 2; // תלמיד לא ינגן ביותר משני הרכבים באותו שיעור
const TEACHER = {
  id: "__teacher",
  name: "תומר",
  instruments: ["פסנתר"],
  roles: ["harmony"],
  teacher: true,
};

function buildRoster(list) {
  const c = {};
  list.forEach(([f]) => (c[f] = (c[f] || 0) + 1));
  return list.map(([first, last, inst]) => ({
    id: `${first}-${last}`,
    name: c[first] > 1 ? `${first} ${last}` : first,
    instruments: inst,
    roles: [...new Set(inst.map((x) => ROLE_OF[x] || "melody"))],
  }));
}
const ROSTERS = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, buildRoster(v)]));

/* ============================ אלגוריתם ============================ */

const shuffle = (a0) => {
  const a = [...a0];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const instFor = (s, role) =>
  role === "drums" ? "תופים" : role === "bass" ? "בס" : s.instruments.find((i) => ROLE_OF[i] === "harmony");

/**
 * החלוקה נשענת על "פנקס" אחד: כמה הרכבים כל תלמיד ניגן בסך כל השיעורים
 * שנשמרו (ledger.plays) מול כמה שיעורים היו (ledger.lessons). מי שצבר פחות
 * מקבל עדיפות על כיסא שיש עליו תחרות — ומי שצבר יותר יושב או מנגן פעם אחת.
 */
function makeGroups(roster, k, ledger) {
  const debt = (s) => (ledger.plays[s.id] || 0); // ככל שנמוך יותר — מגיע לו יותר
  const groups = Array.from({ length: k }, () => []);
  const load = {};
  const place = (s, inst, slot, g) => {
    groups[g].push({ ...s, playing: inst, slot });
    load[s.id] = (load[s.id] || 0) + 1;
  };
  const inGroup = (s, g) => groups[g].some((m) => m.id === s.id);
  const free = (g, inst) => !UNIQUE.has(inst) || !groups[g].some((m) => m.playing === inst);

  // 1. ריתמיקה מלאה: תופים, בס וכלי הרמוני בכל הרכב.
  //    מתחילים מהתפקיד שיש בו הכי מעט נגנים.
  const roles = ["drums", "bass", "harmony"].sort(
    (a, b) => roster.filter((s) => s.roles.includes(a)).length - roster.filter((s) => s.roles.includes(b)).length
  );
  for (const role of roles) {
    const cands = roster.filter((s) => s.roles.includes(role));
    for (const g of shuffle([...Array(k).keys()])) {
      const ok = cands.filter(
        (s) => (load[s.id] || 0) < MAX_LOAD && !inGroup(s, g) && free(g, instFor(s, role))
      );
      if (!ok.length) return null;
      // סדר: תלמיד שעוד לא ניגן היום → המורה → תלמיד שיכפיל הרכב
      const rank = (s) => (s.teacher ? 0.5 : load[s.id] || 0);
      ok.sort(
        (a, b) =>
          rank(a) - rank(b) || debt(a) - debt(b) || a.roles.length - b.roles.length || Math.random() - 0.5
      );
      const head = ok[0];
      const top = ok.filter(
        (s) => rank(s) === rank(head) && debt(s) === debt(head) && s.roles.length === head.roles.length
      );
      const pick = shuffle(top)[0];
      place(pick, instFor(pick, role), role, g);
    }
  }

  // 2. כל השאר — מי שעוד לא ניגן היום. סדר התור: הכי "מקופחים" קודם,
  //    ובתוך זה מקובצים לפי כלי כדי לפזר כלים זהים בין ההרכבים.
  const rest = roster.filter((s) => !load[s.id] && !s.teacher);
  const buckets = {};
  rest.forEach((s) => (buckets[s.instruments[0]] = [...(buckets[s.instruments[0]] || []), s]));
  Object.values(buckets).forEach((b) => shuffle(b).sort((x, y) => debt(x) - debt(y)));
  const queue = [];
  const lists = shuffle(Object.values(buckets));
  let more = true;
  while (more) {
    more = false;
    for (const b of lists) if (b.length) (queue.push(b.shift()), (more = true));
  }

  const bench = [];
  const melodic = (g) => groups[g].filter((m) => m.slot === "melody").length;
  for (const s of queue) {
    let best = null,
      bestInst = null,
      bestScore = Infinity;
    for (let g = 0; g < k; g++) {
      const fam = groups[g].reduce((a, m) => a + (ledger.pairs[pairKey(s.id, m.id)] || 0), 0);
      s.instruments.forEach((inst, ord) => {
        if (!free(g, inst) || inGroup(s, g)) return;
        const same = groups[g].filter((m) => m.playing === inst).length;
        const score =
          melodic(g) * 100 + groups[g].length * 25 + same * 40 + fam * 6 + ord * 8 + Math.random() * 4;
        if (score < bestScore) (bestScore = score), (best = g), (bestInst = inst);
      });
    }
    if (best === null) bench.push(s);
    else place(s, bestInst, "melody", best);
  }

  // אם המורה לא נדרש לאף כיסא — הוא מצטרף להרכב שאין בו פסנתר
  const teacher = roster.find((s) => s.teacher);
  if (teacher && !load[teacher.id]) {
    const open = shuffle([...Array(k).keys()]).filter((g) => free(g, "פסנתר"));
    if (open.length) place(teacher, "פסנתר", "harmony", open[0]);
  }

  return {
    groups: groups.map((g) => [...g].sort((a, b) => orderOf(a.playing) - orderOf(b.playing))),
    load,
    bench,
  };
}

function attempt(roster, k, ledger, tries) {
  const out = [];
  for (let t = 0; t < tries; t++) {
    const r = makeGroups(roster, k, ledger);
    if (r) out.push(r);
  }
  return out;
}

// ציון: קודם כל צדק (מי שחייבים לו מקבל), אחר כך גיוון בצירופים
function cost(res, ledger) {
  let fairness = 0;
  Object.entries(res.load).forEach(([id, n]) => {
    if (n > 1) fairness += (ledger.plays[id] || 0) * 3; // כפל הרכבים למי שכבר צבר הרבה
  });
  res.bench.forEach((s) => {
    fairness -= (ledger.plays[s.id] || 0) * 3; // מי שצבר הרבה — סביר שיֵשב
    fairness += 12;
  });
  let variety = 0;
  res.groups.forEach((g) =>
    g.forEach((a, i) => g.slice(i + 1).forEach((b) => (variety += ledger.pairs[pairKey(a.id, b.id)] || 0)))
  );
  return fairness * 4 + variety + Math.random() * 0.5;
}

function bestDraw(roster, k, ledger, tries = 160) {
  const all = attempt(roster, k, ledger, tries);
  if (!all.length) return null;
  return all.reduce((best, r) => (cost(r, ledger) < cost(best, ledger) ? r : best));
}

const EMPTY = { plays: {}, pairs: {}, lessons: 0 };

/* ייצוא/ייבוא הפנקס כטקסט קצר, כדי לשמור אותו איפה שנוח */
function encodeLedger(cls, ledger) {
  const ids = ROSTERS[cls].map((s) => s.id);
  const p = ids.map((id) => ledger.plays[id] || 0);
  const x = Object.entries(ledger.pairs)
    .map(([key, n]) => {
      const [a, b] = key.split("|").map((id) => ids.indexOf(id));
      return a < 0 || b < 0 ? null : `${a}-${b}:${n}`;
    })
    .filter(Boolean)
    .join(",");
  return JSON.stringify({ v: 1, c: cls, l: ledger.lessons, p, x });
}

function decodeLedger(cls, text) {
  const o = JSON.parse(text);
  if (o.c !== cls) throw new Error("הפנקס שייך לכיתה " + o.c);
  const ids = ROSTERS[cls].map((s) => s.id);
  const plays = {};
  (o.p || []).forEach((n, i) => (plays[ids[i]] = n));
  const pairs = {};
  (o.x || "")
    .split(",")
    .filter(Boolean)
    .forEach((part) => {
      const [ij, n] = part.split(":");
      const [a, b] = ij.split("-").map(Number);
      if (ids[a] && ids[b]) pairs[pairKey(ids[a], ids[b])] = Number(n);
    });
  return { plays, pairs, lessons: o.l || 0 };
}

/* המרה בין הפנקס לשורות הגיליון:
   A1: "שיעורים" | מספר | "צירופים" | מחרוזת דחוסה
   A2: כותרות, ומשורה 3: שם תלמיד | כמה הרכבים */
function ledgerToRows(cls, ledger) {
  const list = ROSTERS[cls];
  const ids = list.map((s) => s.id);
  const pairs = Object.entries(ledger.pairs)
    .map(([key, n]) => {
      const [a, b] = key.split("|").map((id) => ids.indexOf(id));
      return a < 0 || b < 0 ? null : `${a}-${b}:${n}`;
    })
    .filter(Boolean)
    .join(",");
  return [
    ["שיעורים", ledger.lessons, "צירופים", pairs],
    ["תלמיד", "הרכבים", "", ""],
    ...list.map((s) => [s.name, ledger.plays[s.id] || 0, "", ""]),
  ];
}

function rowsToLedger(cls, rows) {
  if (!rows.length) return { plays: {}, pairs: {}, lessons: 0 };
  const list = ROSTERS[cls];
  const ids = list.map((s) => s.id);
  const byName = Object.fromEntries(list.map((s) => [s.name, s.id]));
  const lessons = Number(rows[0] && rows[0][1]) || 0;
  const plays = {};
  rows.slice(2).forEach((r) => {
    const id = byName[(r[0] || "").trim()];
    if (id) plays[id] = Number(r[1]) || 0;
  });
  const pairs = {};
  ((rows[0] && rows[0][3]) || "")
    .split(",")
    .filter(Boolean)
    .forEach((part) => {
      const [ij, n] = part.split(":");
      const [a, b] = ij.split("-").map(Number);
      if (ids[a] && ids[b]) pairs[pairKey(ids[a], ids[b])] = Number(n);
    });
  return { plays, pairs, lessons };
}

function capacity(roster) {
  const hardMax = Math.max(1, Math.floor(roster.length / 4));
  let max = hardMax;
  while (max > 1 && !attempt(roster, max, EMPTY, 25).length) max--;
  let rec = 1;
  for (let k = max; k >= 1; k--) {
    const r = bestDraw(roster, k, EMPTY, 20);
    if (r && Math.max(...r.groups.map((g) => g.length)) <= 6 && !r.bench.length) {
      rec = k;
      break;
    }
    rec = Math.min(max, Math.max(rec, 1));
  }
  return { max, rec: rec || max };
}

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
  const [cls, setCls] = useState("ט׳");
  const roster = ROSTERS[cls];
  const [teacherOn, setTeacherOn] = useState(true);
  const pool = useMemo(() => (teacherOn ? [...roster, TEACHER] : roster), [roster, teacherOn]);
  const caps = useMemo(() => capacity(pool), [cls, teacherOn]);
  const [k, setK] = useState(caps.rec);
  const [ledger, setLedger] = useState(EMPTY);
  const [res, setRes] = useState(null);
  const [saved, setSaved] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [transfer, setTransfer] = useState(null); // טקסט הפנקס לייצוא/ייבוא
  const [note, setNote] = useState("");
  const [gOn, setGOn] = useState(Sheets.connected());
  const [gMsg, setGMsg] = useState("");
  const [gBusy, setGBusy] = useState(false);
  const ledgerRef = useRef(ledger);
  ledgerRef.current = ledger;

  useEffect(() => {
    setK(caps.rec);
    setRes(null);
    setSaved(false);
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
  }, [cls, caps.rec]);

  useEffect(() => {
    setRes(null);
    setSaved(false);
  }, [teacherOn]);

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
    setRes(bestDraw(pool, k, ledger));
    setSaved(false);
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
  const avg = ledger.lessons ? (Object.values(ledger.plays).reduce((a, b) => a + b, 0) / roster.length).toFixed(1) : 0;

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
            {Object.keys(RAW).map((c) => (
              <button key={c} onClick={() => setCls(c)} style={btn(cls === c ? C.brass : C.soft, cls === c ? "#241B08" : C.ink)}>
                כיתה {c}
              </button>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: C.dim, fontSize: 15 }}>
            הרכבים
            <select
              value={k}
              onChange={(e) => setK(Number(e.target.value))}
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
          <button onClick={draw} style={{ ...btn(C.teal, "#0C2320"), marginRight: "auto" }}>
            חלק מחדש
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

      <main style={{ maxWidth: 760, margin: "0 auto" }}>
        {!res && (
          <div style={{ border: `1px dashed ${C.line}`, borderRadius: 14, padding: "44px 20px", textAlign: "center", color: C.dim }}>
            {roster.length} תלמידים בכיתה {cls}. לחץ ״חלק מחדש״.
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
                    const next = decodeLedger(cls, transfer.trim());
                    setLedger(next);
                    setRes(null);
                    setSaved(false);
                    setNote(`נטען: ${next.lessons} שיעורים`);
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
