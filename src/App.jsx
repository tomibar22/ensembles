import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as Sheets from "./sheets.js";
import RosterEditor from "./RosterEditor.jsx";
import { C, TINT, btn, ghost, panel } from "./theme.js";
import {
  CLASSES,
  KEYS,
  TABS,
  TEACHER,
  SEED,
  buildRoster,
  ROSTER_TAB,
  rowsToRoster,
  rosterToRows,
  ROLE_LABEL,
  EMPTY,
  applyLesson,
  ATT_TAB,
  lessonAttendance,
  mergeAttendance,
  attToRows,
  rowsToAtt,
  attendanceSummary,
  addToDraw,
  removeFromDraw,
  repairDraw,
  swapPlayers,
  BENCH,
  ROLE_MISSING,
  bestDraw,
  capacity,
  emptyRoles,
  MAX_GROUP,
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
const ATT_KEY = (cls) => `ens-att-${TABS[cls]}`;
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

/* רשימת הכיתה. מקור האמת הוא הגיליון; המטמון המקומי הוא מה שמאפשר
   לפתוח את האפליקציה בכיתה בלי רשת. בהתקנה ראשונה נופלים ל-SEED. */
const ROSTER_KEY = (cls) => `ens-roster-${TABS[cls]}`;

function loadRosterList(cls) {
  try {
    const r = store.get(ROSTER_KEY(cls));
    const o = r ? JSON.parse(r.value) : null;
    if (Array.isArray(o) && o.length) return o;
  } catch {}
  return SEED[cls];
}
const saveRosterList = (cls, list) => store.set(ROSTER_KEY(cls), JSON.stringify(list));

/* יומן הנוכחות נשמר גם מקומית, כדי ששיעור לא ילך לאיבוד כשאין רשת */
function loadAtt(cls) {
  try {
    const r = store.get(ATT_KEY(cls));
    const o = r ? JSON.parse(r.value) : null;
    return Array.isArray(o) ? o : [];
  } catch {
    return [];
  }
}
const saveAtt = (cls, log) => store.set(ATT_KEY(cls), JSON.stringify(log));

/* ============================ תצוגה ============================ */

function Chip({ m, load, onClick, state }) {
  const tint = m.teacher ? C.teal : TINT[m.playing] || C.dim;
  const picked = state === "selected";
  const blocked = state === "blocked";
  return (
    <button
      onClick={onClick}
      aria-pressed={picked}
      title={picked ? "לחץ שוב לביטול" : "לחץ כדי להחליף"}
      style={{
        font: "inherit",
        color: "inherit",
        cursor: "pointer",
        opacity: blocked ? 0.3 : 1,
        transition: "opacity .12s",
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 40,
        borderRadius: 999,
        background: picked
          ? C.brass + "2E"
          : m.slot !== "melody"
            ? "rgba(255,255,255,0.06)"
            : "transparent",
        border: picked
          ? `2px solid ${C.brass}`
          : `1px ${m.teacher ? "dashed" : "solid"} ${m.slot !== "melody" ? tint + "66" : C.line}`,
        padding: picked ? "0 12px" : "0 13px",
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 500 }}>{m.name}</span>
      {m.teacher && <span style={{ color: C.teal, fontSize: 12 }}>מורה</span>}
      <span style={{ color: tint, fontSize: 14 }}>{m.playing}</span>
      {load > 1 && (
        <span
          title={`מנגן ב-${load} הרכבים היום`}
          style={{
            background: C.brass + "26",
            color: C.brass,
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 5,
            padding: "2px 5px",
            alignSelf: "center",
          }}
        >
          ×{load}
        </span>
      )}
    </button>
  );
}

export default function App() {
  const [cls, setCls] = useState(CLASSES[0]);
  /* הרשימה היא state ולא קבוע: היא נערכת בממשק ומסונכרנת עם הגיליון.
     buildRoster נגזר ממנה, ולכן שמות התצוגה מתעדכנים מיד עם העריכה. */
  const [rosterList, setRosterList] = useState(() => loadRosterList(CLASSES[0]));
  const roster = useMemo(() => buildRoster(rosterList), [rosterList]);
  const [showRoster, setShowRoster] = useState(false);
  const [teacherOn, setTeacherOn] = useState(true);
  const [absent, setAbsent] = useState(() => new Set(loadAbsent(CLASSES[0])));
  const present = useMemo(() => roster.filter((s) => !absent.has(s.id)), [roster, absent]);
  const pool = useMemo(() => (teacherOn ? [...present, TEACHER] : present), [present, teacherOn]);
  const caps = useMemo(() => capacity(pool), [pool]);
  // תפקיד חיוני שאין לו אף נגן נוכח — הדבר היחיד שחוסם חלוקה לגמרי
  const gaps = useMemo(() => emptyRoles(pool), [pool]);
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
  const [liveMsg, setLiveMsg] = useState("");
  const [sel, setSel] = useState(null); // הנגן שנבחר להחלפה ידנית: { g, id }
  const [showHelp, setShowHelp] = useState(false);
  // הפנקס כפי שהיה לפני שהשיעור הזה נשמר — הבסיס לשמירה חוזרת ולביטול
  const [lessonBase, setLessonBase] = useState(null);
  // מי סומן חסר ברגע החלוקה. ההשוואה מולו בסוף השיעור היא שמזהה איחורים.
  const [absentAtDraw, setAbsentAtDraw] = useState(null);
  const [attLog, setAttLog] = useState([]);
  const [transfer, setTransfer] = useState(null); // טקסט הפנקס לייצוא/ייבוא
  const [note, setNote] = useState("");
  const [gOn, setGOn] = useState(Sheets.connected());
  const [gMsg, setGMsg] = useState("");
  const [gBusy, setGBusy] = useState(false);
  const ledgerRef = useRef(ledger);
  // pull רץ מתוך effect ולכן רואה ערכים ישנים; ref מחזיק את הנוכחי
  const rosterRef = useRef(rosterList);

  /* כשנבחר נגן, מסמנים מראש עם מי מותר להחליף אותו. עדיף להראות את זה
     על המסך מאשר לתת למורה ללחוץ ולקבל סירוב. */
  const swapOk = useMemo(() => {
    if (!res || !sel) return null;
    const ok = new Set();
    const consider = (g, id) => {
      if (g === sel.g && id === sel.id) return;
      if (!swapPlayers(res, sel, { g, id }).error) ok.add(`${g}|${id}`);
    };
    res.groups.forEach((grp, g) => grp.forEach((m) => consider(g, m.id)));
    res.bench.forEach((st) => consider(BENCH, st.id));
    return ok;
  }, [res, sel]);
  const chipState = (g, id) => {
    if (!sel) return "idle";
    if (sel.g === g && sel.id === id) return "selected";
    return swapOk && swapOk.has(`${g}|${id}`) ? "idle" : "blocked";
  };
  const pickChip = (g, m) => {
    if (!sel) {
      setSel({ g, id: m.id });
      setLiveMsg("");
      return;
    }
    if (sel.g === g && sel.id === m.id) {
      setSel(null);
      return;
    }
    const out = swapPlayers(res, sel, { g, id: m.id });
    if (out.error) return setLiveMsg(out.error);
    setRes({ groups: out.groups, load: out.load, bench: out.bench });
    setSel(null);
    setSaved(false);
    setLiveMsg(`${out.moved[0]} ו${out.moved[1]} הוחלפו.`);
  };
  useEffect(() => {
    ledgerRef.current = ledger;
  }, [ledger]);

  useEffect(() => {
    rosterRef.current = rosterList;
  }, [rosterList]);

  useEffect(() => {
    setKPick(null);
    setLessonBase(null);
    setAbsentAtDraw(null);
    setAttLog(loadAtt(cls));
    setRosterList(loadRosterList(cls));
    setShowRoster(false);
    setAbsent(new Set(loadAbsent(cls)));
    setRes(null);
    setSaved(false);
    setDrawErr("");
    setLiveMsg("");
    setSel(null);
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

  /* מישהו הגיע באיחור או יצא באמצע. אין סיבה לפרק הרכבים שכבר מנגנים —
     מכניסים או מוציאים אותו מהחלוקה הקיימת, ומדווחים מה קרה. */
  const toggleAbsent = (id) => {
    const leaving = !absent.has(id);
    const next = new Set(absent);
    leaving ? next.add(id) : next.delete(id);
    setAbsent(next);
    saveAbsent(cls, [...next]);
    setSaved(false);
    setDrawErr("");
    setSel(null);

    if (!res) return setLiveMsg("");
    const student = roster.find((s) => s.id === id);
    const gapText = (broken) =>
      broken
        .map((b) => `הרכב ${b.group + 1} נשאר בלי ${b.missing.map((r) => ROLE_MISSING[r]).join(" ובלי ")}`)
        .join(", ");

    if (leaving) {
      // הכלל "תופים, בס, כלי הרמוני וכלי מלודי בכל הרכב" חייב להישמר גם עכשיו.
      // מחשבים את הנוכחים מהסט החדש ולא מ-present, שעדיין מחזיק את מי שיצא.
      const stillHere = roster.filter((sd) => !next.has(sd.id));
      const nextPool = teacherOn ? [...stillHere, TEACHER] : stillHere;
      const out = repairDraw(removeFromDraw(res, id), nextPool, ledger);
      setRes(out);
      const fixes = out.filled
        .map((f) => `${f.name} נכנס ב${f.instrument} להרכב ${f.group + 1}`)
        .join(", ");
      setLiveMsg(
        [
          `${student.name} יצא מהחלוקה.`,
          fixes && `${fixes} — כדי שלכל הרכב תישאר ריתמיקה מלאה.`,
          // כשאי אפשר להשלים, אומרים גם מה כן אפשרי — אחרת ההודעה מתארת
          // בעיה בלי לתת דרך פעולה
          out.unfixable.length &&
            `${gapText(out.unfixable)}, ואין מי שימלא — עם ${stillHere.length} הנוכחים אפשר עד ${capacity(nextPool).max} הרכבים.`,
        ]
          .filter(Boolean)
          .join(" ")
      );
    } else {
      const added = addToDraw(res, student, ledger);
      if (!added) {
        setLiveMsg(`אין כיסא פנוי ל${student.name} (${student.instruments[0]}) באף הרכב — צריך לחלק מחדש.`);
        return;
      }
      setRes(added);
      const left = removeFromDraw(added, "").broken;
      setLiveMsg(
        `${student.name} הצטרף להרכב ${added.joined + 1}.` + (left.length ? ` ${gapText(left)}.` : "")
      );
    }
  };

  const clearAbsent = () => {
    setAbsent(new Set());
    saveAbsent(cls, []);
    setRes(null);
    setSaved(false);
    setDrawErr("");
    setLiveMsg("");
  };

  // משיכה מהגיליון: מקור האמת. localStorage נשאר כמטמון לשיעור בלי רשת.
  const pull = useCallback(
    async (silent) => {
      if (!Sheets.connected()) return;
      setGBusy(true);
      try {
        /* הרשימה נקראת ראשונה: הפנקס והנוכחות מפוענחים מולה, ואם נקרא
           אותם מול רשימה ישנה תלמיד חדש ייראה כאילו אינו קיים. */
        let list = rosterRef.current;
        try {
          const rrows = await Sheets.readRows(ROSTER_TAB(cls), 5);
          const fromSheet = rowsToRoster(rrows);
          if (fromSheet.length) {
            list = fromSheet;
            setRosterList(fromSheet);
            saveRosterList(cls, fromSheet);
          } else {
            // לשונית ריקה — מעלים את מה שיש במקום להישאר בלי רשימה
            await Sheets.writeRows(ROSTER_TAB(cls), rosterToRows(list), 5);
          }
        } catch {
          // אין לשונית תלמידים (גיליון מגרסה קודמת) — ממשיכים עם המקומית
        }
        const localRoster = buildRoster(list);
        const rows = await Sheets.readRows(TABS[cls]);
        const local = ledgerRef.current;
        // לשונית ריקה בגיליון ופנקס מקומי קיים — מעלים את המקומי במקום למחוק אותו
        if (!rows.length && local.lessons > 0) {
          await Sheets.writeRows(TABS[cls], ledgerToRows(localRoster, local));
          setGMsg(`הפנקס המקומי הועלה לגיליון · ${local.lessons} שיעורים`);
          return;
        }
        const next = rowsToLedger(localRoster, rows);
        setLedger(next);
        setLessonBase(null);
        try {
          const log = rowsToAtt(await Sheets.readRows(ATT_TAB(cls), 5));
          setAttLog(log);
          saveAtt(cls, log);
        } catch {
          // יומן הנוכחות הוא תוספת — כשל בקריאתו לא צריך להפיל את הסנכרון
        }
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
    setLiveMsg("");
    setSel(null);
    // תמונת הנוכחות נלקחת בחלוקה הראשונה של השיעור ונשמרת גם אם מחלקים
    // מחדש — אחרת חלוקה חוזרת הייתה מוחקת את רישום האיחורים
    if (r && !absentAtDraw) setAbsentAtDraw(new Set(absent));
    if (r) setShowRoll(false);
    setDrawErr(
      r
        ? ""
        : `אי אפשר להרכיב ${k} הרכבים מ-${pool.length} הנוכחים — בכל הרכב חייבים תופים, בס, כלי הרמוני וכלי מלודי. נסה פחות הרכבים, או בדוק את הנוכחות.`
    );
  }, [pool, k, ledger, absent, absentAtDraw]);

  const save = async () => {
    if (!res) return;
    // תמיד בונים מעל המצב שלפני השיעור הזה. אחרת תיקון נוכחות אחרי שמירה,
    // חלוקה מחדש ושמירה נוספת היו סופרים שיעור אחד כשניים.
    const base = lessonBase || ledger;
    const next = applyLesson(roster, res, base);
    setLessonBase(base);
    setLedger(next);
    setSaved(true);
    store.set(KEYS[cls], JSON.stringify(next));

    /* יומן הנוכחות: חיסורים, איחורים ומי שיצא באמצע. נבנה מהשוואה בין
       הנוכחות בזמן החלוקה לנוכחות עכשיו, ומוחלף כולו בשמירה חוזרת של
       אותו שיעור כדי שלא ייווצרו כפילויות. */
    const entries = lessonAttendance(roster, absentAtDraw || absent, absent, next.lessons, todayStamp());
    const log = mergeAttendance(attLog, next.lessons, entries);
    setAttLog(log);
    saveAtt(cls, log);
    const counts = entries.reduce((a, e) => ((a[e.status] = (a[e.status] || 0) + 1), a), {});
    const n = (c, one, many) => c && `${c} ${c === 1 ? one : many}`;
    const summary = [
      n(counts.absent, "חיסור", "חיסורים"),
      n(counts.late, "איחור", "איחורים"),
      counts.left && `${counts.left} ${counts.left === 1 ? "יצא" : "יצאו"} באמצע`,
    ]
      .filter(Boolean)
      .join(" · ");

    if (Sheets.connected()) {
      setGBusy(true);
      try {
        await Sheets.writeRows(TABS[cls], ledgerToRows(roster, next));
        await Sheets.writeRows(ATT_TAB(cls), attToRows(log), 5);
        setGMsg(`נשמר בגיליון · ${next.lessons} שיעורים${summary ? " · " + summary : ""}`);
      } catch (e) {
        setGOn(Sheets.connected());
        setGMsg("נשמר במכשיר אבל לא בגיליון — " + e.message);
      } finally {
        setGBusy(false);
      }
    } else if (summary) {
      setGMsg(`נרשם במכשיר · ${summary}`);
    }
  };

  const undoSave = async () => {
    if (!lessonBase) return;
    const back = lessonBase;
    const log = attLog.filter((e) => e.lesson !== ledger.lessons);
    setLedger(back);
    setLessonBase(null);
    setSaved(false);
    setAttLog(log);
    saveAtt(cls, log);
    store.set(KEYS[cls], JSON.stringify(back));
    if (Sheets.connected()) {
      try {
        await Sheets.writeRows(TABS[cls], ledgerToRows(roster, back));
        await Sheets.writeRows(ATT_TAB(cls), attToRows(log), 5);
        setGMsg(`השמירה בוטלה · ${back.lessons} שיעורים`);
      } catch (e) {
        setGMsg("בוטל במכשיר אבל לא בגיליון — " + e.message);
      }
    } else {
      setGMsg(`השמירה בוטלה · ${back.lessons} שיעורים`);
    }
  };

  /* שמירת רשימה ערוכה. הרשימה נשמרת מיד — במכשיר ובגיליון — כי היא
     לא חלק מהשיעור אלא נתון הכיתה, ואיבוד שלה עולה הרבה יותר מאיבוד
     חלוקה אחת. החלוקה הנוכחית מתבטלת, כי היא נשענה על הרשימה הישנה. */
  const saveRoster = async (list) => {
    setRosterList(list);
    saveRosterList(cls, list);
    setShowRoster(false);
    setRes(null);
    setSaved(false);
    setDrawErr("");
    setLiveMsg("");
    setSel(null);
    if (!Sheets.connected()) return setGMsg(`הרשימה נשמרה במכשיר · ${list.length} תלמידים`);
    setGBusy(true);
    try {
      await Sheets.writeRows(ROSTER_TAB(cls), rosterToRows(list), 5);
      setGMsg(`הרשימה נשמרה בגיליון · ${list.length} תלמידים`);
    } catch (e) {
      setGOn(Sheets.connected());
      setGMsg("הרשימה נשמרה במכשיר אבל לא בגיליון — " + e.message);
    } finally {
      setGBusy(false);
    }
  };

  const reset = async () => {
    setLedger(EMPTY);
    setLessonBase(null);
    setAbsentAtDraw(null);
    setAttLog([]);
    saveAtt(cls, []);
    setSaved(false);
    store.set(KEYS[cls], JSON.stringify(EMPTY));
    if (Sheets.connected()) {
      try {
        await Sheets.writeRows(TABS[cls], ledgerToRows(roster, EMPTY));
        await Sheets.writeRows(ATT_TAB(cls), attToRows([]), 5);
        setGMsg("הפנקס ויומן הנוכחות אופסו גם בגיליון");
      } catch (e) {
        setGMsg(e.message);
      }
    }
  };

  /* מסך המעקב: הפנקס ויומן הנוכחות באותה טבלה. קודם הפנקס הוצג לבד
     והנוכחות לא הוצגה כלל — היא נרשמה לגיליון ונשארה שם. */
  const [trackSort, setTrackSort] = useState("plays");
  const track = useMemo(() => {
    const rows = attendanceSummary(roster, attLog, ledger);
    const by = {
      plays: (a, b) => a.plays - b.plays,
      absent: (a, b) => b.absent - a.absent || b.late - a.late,
      name: () => 0,
    }[trackSort];
    return rows.sort((a, b) => by(a, b) || a.name.localeCompare(b.name, "he"));
  }, [roster, attLog, ledger, trackSort]);
  const avg = ledger.lessons
    ? (roster.reduce((a, s) => a + (ledger.plays[s.id] || 0), 0) / roster.length).toFixed(1)
    : 0;

  return (
    <div dir="rtl" style={{ background: C.bg, minHeight: "100vh", padding: "22px 16px 48px", fontFamily: "'Heebo', system-ui, sans-serif", color: C.ink }}>
      {/* הכותרת וההגדרות נדחסו לשורות בודדות: במסך טלפון הן תפסו 500px
          לפני שהתוכן התחיל, וכפתור החלוקה נפל מתחת לקיפול. */}
      <header style={{ maxWidth: 760, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 26, margin: 0 }}>חלוקת הרכבים</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {CLASSES.map((c) => (
            <button
              key={c}
              onClick={() => setCls(c)}
              aria-pressed={cls === c}
              style={{ ...btn(cls === c ? C.brass : C.soft, cls === c ? "#241B08" : C.ink), padding: "9px 16px", fontSize: 15 }}
            >
              {c}
            </button>
          ))}
        </div>
      </header>

      <div style={{ maxWidth: 760, margin: "0 auto 12px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, color: C.dim, fontSize: 14 }}>
            הרכבים
            <select
              value={k}
              onChange={(e) => setKPick(Number(e.target.value))}
              style={{ background: C.soft, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 9px", fontSize: 16, fontFamily: "inherit" }}
            >
              {/* לכל מספר כתוב מה הוא אומר בפועל: גודל ההרכב, וכמה יישבו
                  בחוץ. קודם היה כאן רק "מומלץ", בלי שום דרך לדעת למה. */}
              {caps.options.map((o) => (
                <option key={o.k} value={o.k}>
                  {o.k} · {o.smallest === o.biggest ? `${o.biggest} נגנים` : `${o.smallest}–${o.biggest} נגנים`}
                  {o.bench ? ` · ${o.bench} בחוץ` : ""}
                  {o.k === caps.rec ? " · מומלץ" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setTeacherOn(!teacherOn)}
            aria-pressed={teacherOn}
            style={{
              ...btn(teacherOn ? C.soft : "transparent", teacherOn ? C.ink : C.dim),
              border: `1px solid ${teacherOn ? C.teal + "88" : C.line}`,
              padding: "8px 12px",
              fontSize: 14,
            }}
            title="תומר תופס כיסא פסנתר בהרכב אחד, ומחליף תלמיד שהיה צריך לנגן פעמיים"
          >
            {teacherOn ? "✓ " : ""}תומר
          </button>
          <button
            onClick={gOn ? () => pull(false) : connect}
            disabled={gBusy}
            style={{
              ...btn("transparent", gOn ? C.teal : C.dim),
              border: `1px solid ${gOn ? C.teal + "88" : C.line}`,
              padding: "8px 12px",
              fontSize: 14,
            }}
            title={gOn ? "מסונכרן עם הגיליון. לחיצה מרעננת" : "בלי חיבור, הפנקס נשמר רק במכשיר הזה"}
          >
            {gBusy ? "מסנכרן…" : gOn ? "● גיליון" : "○ גיליון"}
          </button>
          <button
            onClick={() => setShowLedger((v) => !v)}
            aria-expanded={showLedger}
            style={{ ...ghost(), padding: "8px 12px", fontSize: 14 }}
            title="הרכבים, נוכחות, חיסורים ואיחורים לכל תלמיד"
          >
            {showLedger ? "סגור מעקב" : "מעקב"}
          </button>
          <button
            onClick={() => setShowRoster((v) => !v)}
            aria-expanded={showRoster}
            style={{ ...ghost(), padding: "8px 12px", fontSize: 14 }}
            title="הוספה, עריכה והסרה של תלמידים — לתחילת שנה"
          >
            {showRoster ? "סגור רשימה" : "רשימת הכיתה"}
          </button>
          <button
            onClick={() => setShowHelp(!showHelp)}
            aria-expanded={showHelp}
            style={{ ...ghost(), padding: "8px 12px", fontSize: 14, marginRight: "auto" }}
          >
            איך זה עובד?
          </button>
        </div>

        {(gMsg || ledger.lessons > 0) && (
          <p style={{ color: C.dim, fontSize: 13, margin: "10px 0 0", lineHeight: 1.5 }}>
            {gMsg && <span>{gMsg}</span>}
            {gMsg && ledger.lessons > 0 && " · "}
            {ledger.lessons > 0 && `${ledger.lessons} שיעורים בפנקס · ממוצע ${avg} הרכבים לתלמיד`}
          </p>
        )}

        {showHelp && (
          <div style={{ color: C.dim, fontSize: 14, margin: "12px 0 0", lineHeight: 1.7, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
            תופים, בס, כלי הרמוני וכלי מלודי בכל הרכב, ולכל היותר {MAX_GROUP} נגנים. מספר ההרכבים הוא הקטן ביותר שבו אף אחד
            לא יושב בחוץ — פחות הרכבים, יותר זמן נגינה לכל אחד. מי שנדרש ביותר מהרכב אחד מסומן במספר ההרכבים שלו, והפנקס
            דואג שזה יתחלף בין השיעורים. תומר נכנס להרכב אחד ואינו נספר בפנקס.
            {!ledger.lessons && " אחרי כל שיעור לחץ ״שמור״, וההגרלות הבאות יתקנו את מי שקופח."}
          </div>
        )}
      </div>

      {showRoster && (
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <RosterEditor
            cls={cls}
            list={rosterList}
            busy={gBusy}
            onSave={saveRoster}
            onCancel={() => setShowRoster(false)}
          />
        </div>
      )}

      {/* הנוכחות היא השלב שלפני החלוקה, ולכן היא פתוחה כל עוד אין תוצאה
          וכפתור החלוקה יושב בסופה. ברגע שיש חלוקה היא מתקפלת לשורה אחת. */}
      <section style={{ maxWidth: 760, margin: "0 auto 16px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
        {rollOpen ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
              <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 20, margin: 0 }}>מי כאן היום?</h2>
              <span style={{ color: absent.size ? C.rose : C.dim, fontSize: 14 }}>
                {absent.size ? `${present.length} מתוך ${roster.length}` : "כולם"}
              </span>
            </div>
            <div style={{ color: C.dim, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
              לחץ על מי שלא הגיע. נעדר לא נכנס לחלוקה ולא צובר הרכבים, ולכן תהיה לו עדיפות בשיעור הבא.
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
                      // center ולא baseline: עם minHeight, baseline מצמיד
                      // את הטקסט לראש הקפסולה במקום למרכז אותה
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      minHeight: 44, // מטרת מגע נוחה באצבע
                      padding: "0 14px",
                      borderRadius: 999,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 16,
                      background: out ? "transparent" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${out ? C.line : C.teal + "66"}`,
                      color: out ? C.dim : C.ink,
                      textDecoration: out ? "line-through" : "none",
                      opacity: out ? 0.65 : 1,
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
                {gaps.length
                  ? ` — אין ${gaps.map((r) => ROLE_LABEL[r]).join(" ואין ")} נוכחים`
                  : ""}
                .
              </p>
            )}
            {/* דביק: ברשימה של 22 שמות הכפתור נפל מתחת לקיפול במסך טלפון */}
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 14,
                position: "sticky",
                bottom: "max(10px, env(safe-area-inset-bottom))",
                zIndex: 2,
              }}
            >
              <button onClick={draw} style={{ ...btn(C.teal, "#0C2320"), minHeight: 48, boxShadow: "0 6px 20px rgba(0,0,0,0.45)" }}>
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
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, color: absent.size ? C.rose : C.dim }}>
              {absent.size ? `${present.length}/${roster.length} נוכחים` : "כולם נוכחים"}
            </span>
            <button
              onClick={() => setShowRoll(true)}
              style={{ ...btn("transparent", C.ink), border: `1px solid ${C.line}`, padding: "9px 13px", fontSize: 14 }}
            >
              שנה נוכחות
            </button>
            <button onClick={draw} style={{ ...btn(C.teal, "#0C2320"), padding: "9px 15px", fontSize: 15, marginRight: "auto" }}>
              חלק מחדש
            </button>
          </div>
        )}
      </section>

      <main style={{ maxWidth: 760, margin: "0 auto" }}>
        {liveMsg && (
          <div
            style={{
              border: `1px solid ${C.teal}55`,
              background: "rgba(99,183,166,0.08)",
              borderRadius: 12,
              padding: "11px 14px",
              marginBottom: 12,
              color: C.ink,
              fontSize: 15,
              lineHeight: 1.6,
            }}
          >
            {liveMsg}
          </div>
        )}

        {!res && drawErr && (
          <div style={{ border: `1px solid ${C.rose}66`, borderRadius: 14, padding: "24px 20px", textAlign: "center", color: C.rose, lineHeight: 1.6 }}>
            {drawErr}
          </div>
        )}

        {res && (
          <p style={{ color: sel ? C.brass : C.dim, fontSize: 13, margin: "0 0 10px", lineHeight: 1.5 }}>
            {sel
              ? "בחר עם מי להחליף — מי שמסומן חיוור אינו אפשרי, כי זה היה שובר הרכב. לחיצה חוזרת מבטלת."
              : "אפשר לערוך ידנית: לחץ על תלמיד ואז על מי שתרצה להחליף אותו איתו."}
          </p>
        )}

        {res &&
          res.groups.map((g, i) => (
            <section key={i} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h2 style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: "'Frank Ruhl Libre', serif", fontSize: 19, margin: 0 }}>
                  הרכב
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background: C.brass,
                      color: "#241B08",
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  >
                    {i + 1}
                  </span>
                </h2>
                <span style={{ color: C.dim, fontSize: 13 }}>{g.length} נגנים</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {g.map((m) => (
                  <Chip
                    key={m.id + m.playing}
                    m={m}
                    load={res.load[m.id] || 1}
                    state={chipState(i, m.id)}
                    onClick={() => pickChip(i, m)}
                  />
                ))}
              </div>
            </section>
          ))}

        {res && res.bench.length > 0 && (
          <section style={{ border: `1px dashed ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <div style={{ color: C.dim, fontSize: 14, marginBottom: 8 }}>יושבים היום (הכי הרבה הרכבים עד עכשיו) — יקבלו עדיפות בשיעור הבא</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {res.bench.map((st) => {
                const state = chipState(BENCH, st.id);
                return (
                  <button
                    key={st.id}
                    onClick={() => pickChip(BENCH, st)}
                    aria-pressed={state === "selected"}
                    title="לחץ כדי להחליף עם נגן בהרכב"
                    style={{
                      font: "inherit",
                      color: "inherit",
                      cursor: "pointer",
                      minHeight: 40,
                      padding: "0 13px",
                      borderRadius: 999,
                      fontSize: 15,
                      background: state === "selected" ? C.brass + "2E" : "transparent",
                      border: state === "selected" ? `2px solid ${C.brass}` : `1px solid ${C.line}`,
                      opacity: state === "blocked" ? 0.3 : 1,
                    }}
                  >
                    {st.name} <span style={{ color: C.dim, fontSize: 13 }}>{st.instruments[0]}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {res && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
            <button onClick={save} disabled={saved} style={btn(saved ? C.soft : C.brass, saved ? C.dim : "#241B08")}>
              {saved
                ? "נשמר בפנקס"
                : lessonBase
                  ? "עדכן את השיעור בפנקס"
                  : "שמור את השיעור בפנקס"}
            </button>
            {lessonBase && (
              <button
                onClick={undoSave}
                style={{ ...btn("transparent", C.dim), border: `1px solid ${C.line}` }}
                title="מחזיר את הפנקס בדיוק למצב שלפני השיעור הזה"
              >
                בטל שמירה
              </button>
            )}
            {/* ניהול הנתונים (מעקב, גיבוי, איפוס) עבר למסך המעקב:
                כאן נשארות רק הפעולות של השיעור עצמו. */}
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
                    const { ledger: next, dropped, added } = decodeLedger(cls, roster, transfer.trim());
                    setLedger(next);
                    setLessonBase(null);
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
          <section style={{ ...panel, marginTop: 12 }}>
            <div style={{ color: C.dim, fontSize: 14, marginBottom: 8 }}>
              {ledger.lessons} שיעורים בפנקס · מיון לפי
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              {[
                ["plays", "הרכבים"],
                ["absent", "חיסורים"],
                ["name", "שם"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTrackSort(key)}
                  aria-pressed={trackSort === key}
                  style={{
                    ...ghost(trackSort === key ? C.ink : C.dim),
                    padding: "6px 11px",
                    fontSize: 14,
                    borderColor: trackSort === key ? C.teal + "88" : C.line,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* טבלה, ולא רשימה: לציונים צריך לראות את העמודות זו לצד זו.
                גולשת אופקית בתוך עצמה בלבד, כדי שגוף הדף לא יזוז בטלפון. */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 15, minWidth: 340 }}>
                <thead>
                  <tr style={{ color: C.dim, fontSize: 13, textAlign: "start" }}>
                    <th style={{ textAlign: "start", padding: "0 0 6px" }}>תלמיד</th>
                    <th style={{ padding: "0 6px 6px" }} title="בכמה הרכבים ניגן בסך הכול">הרכבים</th>
                    <th style={{ padding: "0 6px 6px" }}>נוכחות</th>
                    <th style={{ padding: "0 6px 6px" }}>חיסורים</th>
                    <th style={{ padding: "0 6px 6px" }} title="הגיע אחרי שההרכבים כבר חולקו">איחורים</th>
                  </tr>
                </thead>
                <tbody>
                  {track.map((e) => (
                    <tr key={e.id} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td style={{ padding: "6px 0" }}>
                        {e.name}
                        <span style={{ color: C.dim, fontSize: 12, marginInlineStart: 6 }}>{e.instrument}</span>
                      </td>
                      <td style={{ textAlign: "center", padding: "6px", color: e.plays === track[0].plays && trackSort === "plays" ? C.teal : C.dim }}>
                        {e.plays}
                      </td>
                      <td style={{ textAlign: "center", padding: "6px", color: e.rate === null ? C.dim : e.rate < 80 ? C.rose : C.ink }}>
                        {e.rate === null ? "—" : `${e.rate}%`}
                      </td>
                      <td style={{ textAlign: "center", padding: "6px", color: e.absent ? C.rose : C.dim }}>{e.absent || "—"}</td>
                      <td style={{ textAlign: "center", padding: "6px", color: e.late ? C.brass : C.dim }}>{e.late || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p style={{ color: C.dim, fontSize: 13, margin: "12px 0 0", lineHeight: 1.6 }}>
              הנוכחות מחושבת מתוך {ledger.lessons} השיעורים ששמורים בפנקס. ביומן נרשמות רק חריגות, ולכן תלמיד שהצטרף
              באמצע השנה ייראה נוכח גם בשיעורים שקדמו לו.
              {track.some((e) => e.left > 0) &&
                ` ${track.filter((e) => e.left).length} תלמידים יצאו באמצע שיעור לפחות פעם אחת.`}
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
              <button
                onClick={() => {
                  setNote("");
                  setTransfer(transfer === null ? encodeLedger(cls, roster, ledger) : null);
                }}
                style={ghost()}
              >
                גיבוי / שחזור
              </button>
              {ledger.lessons > 0 && (
                <button onClick={reset} style={ghost()} title="מאפס את הפנקס ואת יומן הנוכחות — לתחילת שנה">
                  אפס הכול
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
