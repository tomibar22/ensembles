import { useState, useReducer, useEffect, useMemo, useCallback } from "react";
import * as Sheets from "./sheets.js";
import RosterEditor from "./RosterEditor.jsx";
import AttendanceBoard from "./AttendanceBoard.jsx";
import TrackPanel from "./TrackPanel.jsx";
import Groups from "./Groups.jsx";
import { C, btn, ghost } from "./theme.js";
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

/* הפנקס מהמטמון המקומי. נטען לפי הכיתה ולא מ-state, כדי שהסנכרון
   יוכל לקרוא אותו בלי לחכות לרנדר. */
function loadLedger(cls) {
  try {
    const r = store.get(KEYS[cls]);
    if (r) return { ...EMPTY, ...JSON.parse(r.value) };
  } catch {}
  return EMPTY;
}

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

/* ============================ מצב השיעור ============================

   שבעה ערכים שתמיד השתנו יחד: החלוקה, האם נשמרה, הפנקס שלפניה, תמונת
   הנוכחות ברגע החלוקה, השגיאה, ההודעה והנגן שנבחר להחלפה. כל מסלול היה
   צריך לזכור את כל חמשת ה-setters, ומסלול ששכח אחד מהם השאיר על המסך
   הודעה או בחירה ממצב קודם.

   reducer הופך כל שינוי למעבר אחד בעל שם, ולכן אי אפשר לשכוח חצי ממנו.
   ================================================================== */

const NO_LESSON = { res: null, saved: false, base: null, atDraw: null, err: "", msg: "", sel: null };

function lessonReducer(st, a) {
  switch (a.type) {
    // כיתה אחרת, רשימה שנערכה, או פנקס שנטען — הכול מתחיל מחדש
    case "reset":
      return NO_LESSON;
    // החלוקה יורדת מהמסך, אבל השיעור עצמו נמשך (הפנקס שלפניו נשמר)
    case "cleared":
      return { ...st, res: null, saved: false, err: "", msg: "", sel: null };
    case "drew":
      return {
        ...st,
        res: a.res,
        err: a.err,
        saved: false,
        msg: "",
        sel: null,
        // תמונת הנוכחות נלקחת בחלוקה הראשונה ונשמרת גם בחלוקה חוזרת,
        // אחרת חלוקה מחדש הייתה מוחקת את רישום האיחורים
        atDraw: st.atDraw || a.atDraw,
      };
    // עריכה ידנית, או מי שהגיע/יצא באמצע — החלוקה משתנה בלי להיבנות מחדש
    case "edit":
      return { ...st, res: a.res ?? st.res, saved: false, err: "", msg: a.msg || "", sel: null };
    case "msg":
      return { ...st, msg: a.msg };
    case "select":
      return { ...st, sel: a.sel, msg: a.sel ? "" : st.msg };
    case "saved":
      return { ...st, saved: true, base: a.base };
    case "undone":
      return { ...st, saved: false, base: null };
    // הפנקס נמשך מהגיליון: השיעור שבזיכרון כבר לא יושב על אותו בסיס
    case "rebased":
      return { ...st, base: null, saved: false };
    default:
      return st;
  }
}

export default function App() {
  const [cls, setCls] = useState(CLASSES[0]);
  /* הרשימה היא state ולא קבוע: היא נערכת בממשק ומסונכרנת עם הגיליון.
     buildRoster נגזר ממנה, ולכן שמות התצוגה מתעדכנים מיד עם העריכה. */
  const [rosterList, setRosterList] = useState(() => loadRosterList(CLASSES[0]));
  const roster = useMemo(() => buildRoster(rosterList), [rosterList]);

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
  const [lesson, dispatch] = useReducer(lessonReducer, NO_LESSON);
  const { res, saved, base: lessonBase, atDraw: absentAtDraw, err: drawErr, msg: liveMsg, sel } = lesson;

  /* ארבעת המסכים הנוספים אינם יכולים להיות פתוחים יחד, ולכן הם ערך אחד
     ולא ארבעה בוליאנים שצריך לזכור לכבות זה את זה. */
  const [panelOpen, setPanelOpen] = useState(null); // roster | track | help | transfer
  const toggle = (name) => setPanelOpen((cur) => (cur === name ? null : name));

  const [showRoll, setShowRoll] = useState(false); // רק כדי לפתוח כשכבר יש חלוקה
  // הנוכחות פתוחה כל עוד אין חלוקה על המסך; אחריה היא מתקפלת לשורת סיכום
  const rollOpen = !res || showRoll;

  const [attLog, setAttLog] = useState([]);
  const [transfer, setTransfer] = useState(null); // טקסט הפנקס לייצוא/ייבוא
  const [note, setNote] = useState("");
  // מצב הסנכרון: מחובר, הודעה אחרונה, ועסוק — שלושתם משתנים יחד
  const [sync, setSync] = useState({ on: Sheets.connected(), msg: "", busy: false });
  const { on: gOn, msg: gMsg, busy: gBusy } = sync;
  const setGMsg = (msg) => setSync((v) => ({ ...v, msg }));
  const setGBusy = (busy) => setSync((v) => ({ ...v, busy }));
  const setGOn = (on) => setSync((v) => ({ ...v, on }));


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
    if (!sel) return dispatch({ type: "select", sel: { g, id: m.id } });
    if (sel.g === g && sel.id === m.id) return dispatch({ type: "select", sel: null });
    const out = swapPlayers(res, sel, { g, id: m.id });
    if (out.error) return dispatch({ type: "msg", msg: out.error });
    dispatch({
      type: "edit",
      res: { groups: out.groups, load: out.load, bench: out.bench },
      msg: `${out.moved[0]} ו${out.moved[1]} הוחלפו.`,
    });
  };
  useEffect(() => {
    setKPick(null);
    setAttLog(loadAtt(cls));
    setRosterList(loadRosterList(cls));
    setPanelOpen(null);
    setAbsent(new Set(loadAbsent(cls)));
    dispatch({ type: "reset" });
    setLedger(loadLedger(cls));
  }, [cls]);

  useEffect(() => {
    dispatch({ type: "cleared" });
  }, [teacherOn]);

  /* מישהו הגיע באיחור או יצא באמצע. אין סיבה לפרק הרכבים שכבר מנגנים —
     מכניסים או מוציאים אותו מהחלוקה הקיימת, ומדווחים מה קרה. */
  const toggleAbsent = (id) => {
    const leaving = !absent.has(id);
    const next = new Set(absent);
    leaving ? next.add(id) : next.delete(id);
    setAbsent(next);
    saveAbsent(cls, [...next]);

    if (!res) return dispatch({ type: "cleared" });
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
      const fixes = out.filled
        .map((f) => `${f.name} נכנס ב${f.instrument} להרכב ${f.group + 1}`)
        .join(", ");
      dispatch({
        type: "edit",
        res: out,
        msg: [
          `${student.name} יצא מהחלוקה.`,
          fixes && `${fixes} — כדי שלכל הרכב תישאר ריתמיקה מלאה.`,
          // כשאי אפשר להשלים, אומרים גם מה כן אפשרי — אחרת ההודעה מתארת
          // בעיה בלי לתת דרך פעולה
          out.unfixable.length &&
            `${gapText(out.unfixable)}, ואין מי שימלא — עם ${stillHere.length} הנוכחים אפשר עד ${capacity(nextPool).max} הרכבים.`,
        ]
          .filter(Boolean)
          .join(" "),
      });
    } else {
      const added = addToDraw(res, student, ledger);
      if (!added) {
        /* באמת אין מקום. במקום להשאיר אותו מחוץ לחלוקה בלי שום אחיזה
           בממשק, מושיבים אותו על הספסל — שם הוא נראה, ואפשר להחליף
           אותו ידנית עם כל מי שההחלפה איתו חוקית. */
        return dispatch({
          type: "edit",
          res: { ...res, bench: [...res.bench, student] },
          msg: `אין כיסא פנוי ל${student.name} (${student.instruments[0]}) באף הרכב. הוא על הספסל — אפשר להחליף אותו ידנית, או לחלק מחדש.`,
        });
      }
      const left = removeFromDraw(added, "").broken;
      const rep = added.replaced;
      dispatch({
        type: "edit",
        res: added,
        msg:
          `${student.name} הצטרף להרכב ${added.joined + 1}` +
          (rep
            ? ` במקום ${rep.name}, שניגן ב-${rep.was} הרכבים ועכשיו ב${rep.now === 1 ? "אחד" : `-${rep.now}`}.`
            : ".") +
          (added.oversize ? ` ההרכב גדול בנגן אחד מהרגיל, כדי שלא יישב בחוץ.` : "") +
          (left.length ? ` ${gapText(left)}.` : ""),
      });
    }
  };

  const clearAbsent = () => {
    setAbsent(new Set());
    saveAbsent(cls, []);
    dispatch({ type: "cleared" });
  };

  // משיכה מהגיליון: מקור האמת. localStorage נשאר כמטמון לשיעור בלי רשת.
  /**
   * משיכה מהגיליון עבור כיתה אחת.
   *
   * `alive` אומר אם התוצאה עדיין רלוונטית: הסנכרון אסינכרוני, והמורה
   * יכול להחליף כיתה באמצע. בלי הבדיקה הזאת תשובה שמגיעה באיחור הייתה
   * נכתבת על הכיתה החדשה.
   */
  const pull = useCallback(
    async (silent, alive = () => true) => {
      if (!Sheets.connected()) return;
      setGBusy(true);
      try {
        /* הרשימה והפנקס נטענים מהמטמון **לפי הכיתה שמסנכרנים**, ולא מ-ref.
           ref מתעדכן ב-effect שרץ רק ברנדר הבא, ולכן ברגע החלפת כיתה הוא
           עדיין החזיק את הכיתה הקודמת — וכך רשימת י״א נכתבה ללשונית
           "תלמידים ט׳". loadRosterList תלויה ב-cls בלבד ואינה יכולה לפגר.

           הרשימה נקראת ראשונה: הפנקס והנוכחות מפוענחים מולה, ואם נקרא
           אותם מול רשימה ישנה תלמיד חדש ייראה כאילו אינו קיים. */
        let list = loadRosterList(cls);
        try {
          const rrows = await Sheets.readRows(ROSTER_TAB(cls), 5);
          if (!alive()) return;
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
          /* readRows יוצרת את הלשונית אם אינה קיימת, ולכן מגיעים לכאן רק
             על כשל רשת או הרשאה. ממשיכים עם הרשימה המקומית: עדיף שיעור
             עם רשימה מהמטמון מאשר אפליקציה שלא עולה. */
        }
        const localRoster = buildRoster(list);
        const rows = await Sheets.readRows(TABS[cls]);
        if (!alive()) return;
        const local = loadLedger(cls);
        // לשונית ריקה בגיליון ופנקס מקומי קיים — מעלים את המקומי במקום למחוק אותו
        if (!rows.length && local.lessons > 0) {
          await Sheets.writeRows(TABS[cls], ledgerToRows(localRoster, local));
          setGMsg(`הפנקס המקומי הועלה לגיליון · ${local.lessons} שיעורים`);
          return;
        }
        const next = rowsToLedger(localRoster, rows);
        setLedger(next);
        dispatch({ type: "rebased" });
        try {
          const log = rowsToAtt(await Sheets.readRows(ATT_TAB(cls), 5));
          if (!alive()) return;
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
    if (!gOn) return;
    // כשמחליפים כיתה, הניקוי מסמן למשיכה שרצה שתוצאתה כבר לא רלוונטית
    let on = true;
    pull(true, () => on);
    return () => {
      on = false;
    };
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
    if (r) setShowRoll(false);
    dispatch({
      type: "drew",
      res: r,
      // תמונת הנוכחות נלקחת בחלוקה הראשונה בלבד; ה-reducer שומר עליה
      // בחלוקה חוזרת, אחרת רישום האיחורים היה נמחק
      atDraw: r ? new Set(absent) : null,
      err: r
        ? ""
        : `אי אפשר להרכיב ${k} הרכבים מ-${pool.length} הנוכחים — בכל הרכב חייבים תופים, בס, כלי הרמוני וכלי מלודי. נסה פחות הרכבים, או בדוק את הנוכחות.`,
    });
  }, [pool, k, ledger, absent]);

  const save = async () => {
    if (!res) return;
    // תמיד בונים מעל המצב שלפני השיעור הזה. אחרת תיקון נוכחות אחרי שמירה,
    // חלוקה מחדש ושמירה נוספת היו סופרים שיעור אחד כשניים.
    const base = lessonBase || ledger;
    const next = applyLesson(roster, res, base);
    setLedger(next);
    dispatch({ type: "saved", base });
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
    dispatch({ type: "undone" });
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
    setPanelOpen(null);
    dispatch({ type: "cleared" });
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
    setAttLog([]);
    saveAtt(cls, []);
    dispatch({ type: "reset" });
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
            onClick={() => toggle("track")}
            aria-expanded={panelOpen === "track"}
            style={{ ...ghost(), padding: "8px 12px", fontSize: 14 }}
            title="הרכבים, נוכחות, חיסורים ואיחורים לכל תלמיד"
          >
            {panelOpen === "track" ? "סגור מעקב" : "מעקב"}
          </button>
          <button
            onClick={() => toggle("roster")}
            aria-expanded={panelOpen === "roster"}
            style={{ ...ghost(), padding: "8px 12px", fontSize: 14 }}
            title="הוספה, עריכה והסרה של תלמידים — לתחילת שנה"
          >
            {panelOpen === "roster" ? "סגור רשימה" : "רשימת הכיתה"}
          </button>
          <button
            onClick={() => toggle("help")}
            aria-expanded={panelOpen === "help"}
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

        {panelOpen === "help" && (
          <div style={{ color: C.dim, fontSize: 14, margin: "12px 0 0", lineHeight: 1.7, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
            תופים, בס, כלי הרמוני וכלי מלודי בכל הרכב, ולכל היותר {MAX_GROUP} נגנים. מספר ההרכבים הוא הקטן ביותר שבו אף אחד
            לא יושב בחוץ — פחות הרכבים, יותר זמן נגינה לכל אחד. מי שנדרש ביותר מהרכב אחד מסומן במספר ההרכבים שלו, והפנקס
            דואג שזה יתחלף בין השיעורים. תומר נכנס להרכב אחד ואינו נספר בפנקס.
            {!ledger.lessons && " אחרי כל שיעור לחץ ״שמור״, וההגרלות הבאות יתקנו את מי שקופח."}
          </div>
        )}
      </div>

      {panelOpen === "roster" && (
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <RosterEditor
            cls={cls}
            list={rosterList}
            busy={gBusy}
            onSave={saveRoster}
            onCancel={() => setPanelOpen(null)}
          />
        </div>
      )}

      {/* הנוכחות היא השלב שלפני החלוקה, ולכן היא פתוחה כל עוד אין תוצאה
          וכפתור החלוקה יושב בסופה. ברגע שיש חלוקה היא מתקפלת לשורה אחת. */}
      <AttendanceBoard
        roster={roster}
        absent={absent}
        present={present}
        open={rollOpen}
        caps={caps}
        gaps={gaps}
        k={k}
        hasDraw={!!res}
        onToggle={toggleAbsent}
        onClearAbsent={clearAbsent}
        onOpen={() => setShowRoll(true)}
        onDraw={draw}
      />

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

        {res && <Groups res={res} sel={sel} chipState={chipState} onPick={pickChip} />}

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
                    dispatch({ type: "reset" });
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

        {panelOpen === "track" && (
          <TrackPanel
            rows={track}
            lessons={ledger.lessons}
            sort={trackSort}
            onSort={setTrackSort}
            onTransfer={() => {
              setNote("");
              setTransfer(transfer === null ? encodeLedger(cls, roster, ledger) : null);
            }}
            onReset={reset}
          />
        )}
      </main>
    </div>
  );
}
