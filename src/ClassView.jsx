import { useState, useReducer, useEffect, useMemo } from "react";
import RosterEditor from "./RosterEditor.jsx";
import AttendanceBoard from "./AttendanceBoard.jsx";
import TrackPanel from "./TrackPanel.jsx";
import Groups from "./Groups.jsx";
import LessonNote from "./LessonNote.jsx";
import Toolbar from "./Toolbar.jsx";
import SaveBar from "./SaveBar.jsx";
import { C } from "./theme.js";
import { useSync, useLastNote } from "./useSync.js";
import {
  loadAbsent,
  saveAbsent,
  loadRosterList,
  saveRosterList,
  loadLedger,
  saveLedger,
  loadAtt,
  saveAtt,
  loadLesson,
  saveLesson,
  todayStamp,
} from "./storage.js";
import {
  TEACHER,
  buildRoster,
  EMPTY,
  applyLesson,
  lessonAttendance,
  mergeAttendance,
  NO_LESSON,
  lessonReducer,
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
  renameInAtt,
} from "./ensembles.js";

const WIDE = { maxWidth: 760, margin: "0 auto" };

/**
 * כיתה אחת: המצב שלה, הסנכרון שלה, והרכבת המסך.
 *
 * הרכיב נבנה מחדש בכל החלפת כיתה (`key={cls}` ב-App), ולכן `cls` קבוע
 * לכל אורך חייו וכל המצב נטען פעם אחת, ב-initializer, מהמטמון של הכיתה.
 * קודם רכיב אחד החזיק את שתי הכיתות ו-effect איפס עשרה ערכים בהחלפה —
 * וברנדר שבאמצע המצב עוד היה של הכיתה הקודמת. משם הגיעו רשימת י״א
 * שנכתבה ללשונית של ט׳, והשיעור שנשמר תחת הכיתה הלא נכונה.
 *
 * **לא מקום ל-JSX חדש** — מסך חדש הוא קובץ חדש.
 */
export default function ClassView({ cls }) {
  /* השיעור של היום כפי שנשמר במכשיר — כולל מי שנשמר והפנקס שלפניו */
  const [boot] = useState(() => loadLesson(cls));
  const [rosterList, setRosterList] = useState(() => loadRosterList(cls));
  const [teacherOn, setTeacherOn] = useState(boot ? boot.teacher : true);
  const [absent, setAbsent] = useState(() => new Set(loadAbsent(cls)));
  const [ledger, setLedger] = useState(() => loadLedger(cls));
  const [attLog, setAttLog] = useState(() => loadAtt(cls));
  const [kPick, setKPick] = useState(null); // null = ללכת אחרי ההמלצה
  /* המסכים הנוספים אינם יכולים להיות פתוחים יחד, ולכן הם ערך אחד */
  const [panelOpen, setPanelOpen] = useState(null); // roster | track | help
  const [showRoll, setShowRoll] = useState(false); // רק כדי לפתוח כשכבר יש חלוקה
  const [trackSort, setTrackSort] = useState("plays");
  const [lesson, dispatch] = useReducer(lessonReducer, null, () =>
    lessonReducer(NO_LESSON, { type: "restore", cls, lesson: boot && boot.lesson })
  );
  const { res, saved, base: lessonBase, atDraw: absentAtDraw, err: drawErr, msg: liveMsg, sel, adding, undo } = lesson;

  const sync = useSync(cls, ({ list, ledger: next, log }) => {
    setRosterList(list);
    setLedger(next);
    setAttLog(log);
    dispatch({ type: "rebased", lessons: next.lessons });
  });
  const lastNote = useLastNote(cls, sync.on);

  /* ---- נגזרים. כל ה-state מוגדר מעליהם: משתנה נגזר שקורא ל-state
          שמוגדר אחריו נותן מסך לבן, וזה כבר קרה שלוש פעמים. ---- */
  const roster = useMemo(() => buildRoster(rosterList), [rosterList]);
  const present = useMemo(() => roster.filter((s) => !absent.has(s.id)), [roster, absent]);
  const pool = useMemo(() => (teacherOn ? [...present, TEACHER] : present), [present, teacherOn]);
  const caps = useMemo(() => capacity(pool), [pool]);
  // תפקיד חיוני שאין לו אף נגן נוכח — הדבר היחיד שחוסם חלוקה לגמרי
  const gaps = useMemo(() => emptyRoles(pool), [pool]);
  // k נגזר ולא נשמר: רק מספר שבו כולם מנגנים; בחירה שכבר אינה אפשרית חוזרת להמלצה
  const k = kPick !== null && caps.playable.some((o) => o.k === kPick) ? kPick : caps.rec;
  // הנוכחות פתוחה כל עוד אין חלוקה על המסך; אחריה היא מתקפלת לשורת סיכום
  const rollOpen = !res || showRoll;
  const toggle = (name) => setPanelOpen((cur) => (cur === name ? null : name));

  const track = useMemo(() => {
    const rows = attendanceSummary(roster, attLog, ledger);
    const by = {
      plays: (a, b) => a.plays - b.plays,
      absent: (a, b) => b.absent - a.absent || b.late - a.late,
      name: () => 0,
    }[trackSort];
    return rows.sort((a, b) => by(a, b) || a.name.localeCompare(b.name, "he"));
  }, [roster, attLog, ledger, trackSort]);
  const avg =
    ledger.lessons && roster.length
      ? (roster.reduce((a, s) => a + (ledger.plays[s.id] || 0), 0) / roster.length).toFixed(1)
      : 0;

  useEffect(() => {
    saveLesson(cls, lesson, teacherOn);
  }, [cls, lesson, teacherOn]);

  /* האפליקציה נשארת פתוחה בטלפון משיעור לשיעור. כשהיום מתחלף, השיעור
     והנוכחות שבזיכרון הם של יום אחר: מי שנעדר בשבוע שעבר היה נרשם כמאחר
     היום, ושמירה של חלוקה ישנה הייתה דורסת את השיעור הקודם. המטמון כבר
     מסומן בתאריך; כאן מיישרים אליו גם את הזיכרון. */
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      dispatch({ type: "tick", day: todayStamp() });
      setAbsent((cur) => (cur.size && !loadAbsent(cls).length ? new Set() : cur));
    };
    const t = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, [cls]);

  /* ---- עריכה ידנית ---- */

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
  /* פעולות העריכה מחזירות { error } או חלוקה חדשה + הודעה */
  const edit = {
    run: (out) =>
      out.error
        ? dispatch({ type: "msg", msg: out.error })
        : dispatch({
            type: "edit",
            res: { groups: out.groups, load: out.load, bench: out.bench },
            msg: out.msg,
            undoable: true,
          }),
    close: () => dispatch({ type: "select", sel: null }),
    openAdd: (g) => dispatch({ type: "adding", g: adding === g ? null : g }),
    undo: () => dispatch({ type: "undo" }),
  };
  const pickChip = (g, m) => {
    if (!sel) return dispatch({ type: "select", sel: { g, id: m.id } });
    if (sel.g === g && sel.id === m.id) return dispatch({ type: "select", sel: null });
    const out = swapPlayers(res, sel, { g, id: m.id });
    edit.run(out.error ? out : { ...out, msg: `${out.moved[0]} ו${out.moved[1]} הוחלפו.` });
  };

  /* ---- נוכחות ---- */

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
      return dispatch({
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
    }

    const added = addToDraw(res, student, ledger);
    if (!added) {
      /* באמת אין מקום. במקום להשאיר אותו מחוץ לחלוקה בלי שום אחיזה
         בממשק, מושיבים אותו על הספסל — שם הוא נראה, ואפשר להחליף
         אותו ידנית עם כל מי שההחלפה איתו חוקית. */
      return dispatch({
        type: "edit",
        res: { ...res, bench: [...res.bench.filter((s) => s.id !== id), student] },
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
  };

  const clearAbsent = () => {
    setAbsent(new Set());
    saveAbsent(cls, []);
    dispatch({ type: "cleared" });
  };

  /* ---- חלוקה ושמירה ---- */

  const draw = () => {
    const r = bestDraw(pool, k, ledger);
    if (r) setShowRoll(false);
    dispatch({
      type: "drew",
      res: r,
      // תמונת הנוכחות נלקחת בחלוקה הראשונה בלבד; ה-reducer שומר עליה
      // בחלוקה חוזרת של אותו יום, אבל לא גורר אותה לשיעור הבא
      atDraw: r ? new Set(absent) : null,
      day: todayStamp(),
      err: r
        ? ""
        : `אי אפשר להרכיב ${k} הרכבים מ-${pool.length} הנוכחים — בכל הרכב חייבים תופים, בס, כלי הרמוני וכלי מלודי. נסה פחות הרכבים, או בדוק את הנוכחות.`,
    });
  };

  /* מה ייכתב ביומן הנוכחות בשמירה: חיסורים, איחורים ומי שיצא באמצע */
  const lessonNo = (lessonBase || ledger).lessons + 1;
  const entries = useMemo(
    () => (res ? lessonAttendance(roster, absentAtDraw || absent, absent, lessonNo, todayStamp()) : []),
    [res, roster, absentAtDraw, absent, lessonNo]
  );

  const save = () => {
    if (!res) return;
    // תמיד בונים מעל המצב שלפני השיעור הזה. אחרת תיקון נוכחות אחרי שמירה,
    // חלוקה מחדש ושמירה נוספת היו סופרים שיעור אחד כשניים.
    const base = lessonBase || ledger;
    const next = applyLesson(roster, res, base);
    // שמירה חוזרת של אותו שיעור מחליפה את רשומותיו ביומן, ולא מוסיפה
    const log = mergeAttendance(attLog, next.lessons, entries);
    setLedger(next);
    saveLedger(cls, next);
    setAttLog(log);
    saveAtt(cls, log);
    dispatch({ type: "saved", base });

    const counts = entries.reduce((a, e) => ((a[e.status] = (a[e.status] || 0) + 1), a), {});
    const n = (c, one, many) => c && `${c} ${c === 1 ? one : many}`;
    const summary = [
      n(counts.absent, "חיסור", "חיסורים"),
      n(counts.late, "איחור", "איחורים"),
      counts.left && `${counts.left} ${counts.left === 1 ? "יצא" : "יצאו"} באמצע`,
    ]
      .filter(Boolean)
      .join(" · ");
    const tail = summary ? " · " + summary : "";
    sync.upload({
      ok: `נשמר בגיליון · ${next.lessons} שיעורים${tail}`,
      offline: `נשמר במכשיר בלבד — אין חיבור לגיליון${tail}. התחבר ל״גיליון״ והשיעור יעלה.`,
      fail: "נשמר במכשיר אבל לא בגיליון — ",
    });
  };

  const undoSave = () => {
    if (!lessonBase) return;
    const back = lessonBase;
    const log = attLog.filter((e) => e.lesson !== ledger.lessons);
    setLedger(back);
    saveLedger(cls, back);
    setAttLog(log);
    saveAtt(cls, log);
    dispatch({ type: "undone" });
    sync.upload({
      ok: `השמירה בוטלה · ${back.lessons} שיעורים`,
      offline: `השמירה בוטלה במכשיר בלבד — אין חיבור לגיליון · ${back.lessons} שיעורים`,
      fail: "בוטל במכשיר אבל לא בגיליון — ",
    });
  };

  /* ---- נתוני הכיתה ---- */

  /* שמירת רשימה ערוכה. החלוקה הנוכחית מתבטלת, כי היא נשענה על הרשימה
     הישנה. שם התצוגה משוכפל גם ללשונית הפנקס וליומן הנוכחות: הפנקס
     נבנה מהרשימה בכל העלאה, והיומן מתרענן כאן. */
  const saveRoster = (list) => {
    const log = renameInAtt(attLog, buildRoster(list));
    setRosterList(list);
    saveRosterList(cls, list);
    setAttLog(log);
    saveAtt(cls, log);
    setPanelOpen(null);
    dispatch({ type: "cleared" });
    sync.upload({
      roster: true,
      ok: `הרשימה נשמרה בגיליון · ${list.length} תלמידים`,
      offline: `הרשימה נשמרה במכשיר בלבד — אין חיבור לגיליון. התחבר ל״גיליון״ והיא תעלה.`,
      fail: "הרשימה נשמרה במכשיר אבל לא בגיליון — ",
    });
  };

  /* פנקס חדש לכיתה — איפוס, או טעינה מגיבוי. השיעור שעל המסך נשען על
     הפנקס הקודם, ולכן מתחיל מחדש. */
  const replaceLedger = (next, log, msgs) => {
    setLedger(next);
    saveLedger(cls, next);
    if (log) {
      setAttLog(log);
      saveAtt(cls, log);
    }
    dispatch({ type: "reset" });
    sync.upload(msgs);
  };
  const reset = () =>
    replaceLedger(EMPTY, [], {
      ok: "הפנקס ויומן הנוכחות אופסו גם בגיליון",
      offline: "הפנקס אופס במכשיר בלבד — אין חיבור לגיליון",
      fail: "אופס במכשיר אבל לא בגיליון — ",
    });
  const importLedger = (next) =>
    replaceLedger(next, null, {
      ok: `הגיבוי נטען ונכתב לגיליון · ${next.lessons} שיעורים`,
      offline: `הגיבוי נטען במכשיר בלבד — אין חיבור לגיליון · ${next.lessons} שיעורים`,
      fail: "הגיבוי נטען במכשיר אבל לא נכתב לגיליון — ",
    });

  return (
    <>
      <LessonNote last={lastNote.last} err={lastNote.err} stale={!lastNote.fresh && !lastNote.err} folded={!!res} />

      <Toolbar
        caps={caps}
        k={k}
        onPickK={setKPick}
        teacherOn={teacherOn}
        onTeacher={() => {
          setTeacherOn(!teacherOn);
          dispatch({ type: "cleared" });
        }}
        sync={sync}
        onSync={sync.on ? () => sync.pull(false) : sync.connect}
        panelOpen={panelOpen}
        onPanel={toggle}
        lessons={ledger.lessons}
        avg={avg}
      />

      {panelOpen === "roster" && (
        <div style={WIDE}>
          <RosterEditor cls={cls} list={rosterList} busy={sync.busy} onSave={saveRoster} onCancel={() => setPanelOpen(null)} />
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

      <main style={WIDE}>
        {liveMsg && (
          <div
            role="status"
            style={{
              /* קבועה בראש המסך: סיבת סירוב מתחת להרכב רחוק לא אמורה להיעלם מהעין */
              position: "sticky",
              top: 8,
              zIndex: 5,
              border: `1px solid ${C.teal}88`,
              background: C.panel,
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
          <div role="alert" style={{ border: `1px solid ${C.rose}66`, borderRadius: 14, padding: "24px 20px", textAlign: "center", color: C.rose, lineHeight: 1.6 }}>
            {drawErr}
          </div>
        )}

        {res && <Groups res={res} sel={sel} chipState={chipState} onPick={pickChip} adding={adding} canUndo={!!undo} edit={edit} />}

        {res && <SaveBar saved={saved} hasBase={!!lessonBase} onSave={save} onUndoSave={undoSave} />}

        {panelOpen === "track" && (
          <TrackPanel
            cls={cls}
            roster={roster}
            ledger={ledger}
            rows={track}
            sort={trackSort}
            onSort={setTrackSort}
            onImport={importLedger}
            onReset={reset}
          />
        )}
      </main>
    </>
  );
}
