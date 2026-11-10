import { useState, useEffect, useRef } from "react";
import * as Sheets from "./sheets.js";
import {
  TABS,
  ROSTER_TAB,
  ATT_TAB,
  buildRoster,
  rosterToRows,
  sheetRoster,
  ledgerToRows,
  rowsToLedger,
  attToRows,
  rowsToAtt,
  syncDirection,
  docToLines,
  lastLesson,
} from "./ensembles.js";
import {
  loadRosterList,
  hasRoster,
  saveRosterList,
  loadLedger,
  saveLedger,
  loadAtt,
  saveAtt,
  loadPending,
  savePending,
  loadNote,
  saveNote,
  usedGoogle,
  markGoogle,
} from "./storage.js";

/**
 * מעלה לגיליון את מה ששמור במכשיר לכיתה — הפנקס והיומן תמיד, והרשימה
 * כש-`roster` מבקש. בקריאה אחת, ולכן שלושתם נכתבים או אף אחד.
 *
 * זו הדרך **היחידה** שבה נתון מגיע לגיליון. קודם כל מסלול שמירה כתב
 * תת־קבוצה אחרת של הלשוניות, ושמירת שיעור כיבתה את הסימון "ממתין" בלי
 * להעלות רשימה שנערכה בלי חיבור.
 *
 * הרשימה אינה נכתבת בכל שמירה: היא נערכת גם בגיליון עצמו, ומכשיר שלא
 * משך מאז היה דורס את העריכה הזאת. ומכשיר שאין בו רשימה לעולם אינו
 * כותב אחת.
 */
async function pushAll(cls, { roster }) {
  /* הפנקס נכתב שורה לכל תלמיד שברשימה. בלי רשימה הוא היה נכתב ריק —
     ומוחק מהגיליון את מספר ההרכבים של כל הכיתה. */
  if (!hasRoster(cls)) throw new Error("אין במכשיר רשימת כיתה — טען אותה מהגיליון לפני שמירה");
  const list = loadRosterList(cls);
  const tabs = [
    { tab: TABS[cls], rows: ledgerToRows(buildRoster(list), loadLedger(cls)), cols: 4 },
    { tab: ATT_TAB(cls), rows: attToRows(loadAtt(cls)), cols: 5 },
  ];
  if (roster) tabs.unshift({ tab: ROSTER_TAB(cls), rows: rosterToRows(list), cols: 5 });
  await Sheets.writeTabs(tabs);
}

/**
 * הסנכרון של כיתה אחת מול הגיליון.
 *
 * הרכיב שמשתמש בזה נבנה מחדש בכל החלפת כיתה (`key={cls}`), ולכן `cls`
 * קבוע לכל אורך חייו. תשובה שמגיעה אחרי שהמורה עבר כיתה נכתבת למטמון
 * של הכיתה שלה — לפי `cls` — ו-setState על רכיב שכבר ירד אינו עושה דבר.
 *
 * `onPulled({ list, ledger, log })` נקרא כשהגיליון היה המעודכן והמצב
 * שעל המסך צריך להתחלף.
 */
export function useSync(cls, onPulled) {
  const [on, setOn] = useState(Sheets.connected());
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // שינוי מקומי שממתין לגיליון. מוצג בממשק — אחרת הוא עוד שקט
  const [pending, setPending] = useState(() => loadPending(cls));
  // שמירה שהתחברה בעצמה כבר מעלה הכול; משיכה במקביל רק הייתה דורסת את ההודעה שלה
  const quiet = useRef(false);
  const pulled = useRef(onPulled);
  useEffect(() => {
    pulled.current = onPulled;
  });

  const mark = (v) => {
    savePending(cls, v);
    setPending(v);
  };

  /**
   * בשני הכיוונים. הגיליון הוא מקור האמת, אבל לא תמיד המעודכן: השיעור
   * נרשם במכשיר ורק אחר כך נכתב. `syncDirection` מכריע קודם מי מעודכן —
   * לפני קריאת הרשימה, כי גם היא נדרסת במשיכה — ורק אז נוגעים בנתונים.
   */
  const pull = async (silent) => {
    if (!Sheets.connected()) return;
    setBusy(true);
    try {
      /* מכשיר בלי רשימה מקבל אותה לפני כל דבר אחר: גם ההעלאה נשענת
         עליה, ובלעדיה אין מה להציג. */
      let fetched = null;
      if (!hasRoster(cls)) {
        const got = sheetRoster(await Sheets.readRows(ROSTER_TAB(cls), 5));
        if (got.ok) {
          fetched = got.list;
          saveRosterList(cls, fetched);
        }
      }
      const rows = await Sheets.readRows(TABS[cls]);
      const sheetLessons = Number((rows[0] || [])[1]) || 0;
      const local = loadLedger(cls);

      if (syncDirection(local, { lessons: sheetLessons }, loadPending(cls)) === "push") {
        // רשימה שנמשכה זה עתה אינה חוזרת לגיליון — היא הגיעה ממנו
        await pushAll(cls, { roster: !fetched });
        mark(false);
        if (fetched) pulled.current({ list: fetched, ledger: local, log: loadAtt(cls) });
        setMsg(`מה שנשמר במכשיר הועלה לגיליון · ${local.lessons} שיעורים`);
        return;
      }

      /* הגיליון מעודכן. הרשימה נקראת ראשונה: הפנקס מפוענח מולה. היא
         נבדקת לפני שהיא נשמרת — רשימה שנערכה ביד בגיליון ויצאה עם מזהה
         כפול הייתה מפילה את האפליקציה בכל רענון. */
      let list = loadRosterList(cls);
      let warn = "";
      try {
        const got = sheetRoster(await Sheets.readRows(ROSTER_TAB(cls), 5));
        if (got.ok) {
          list = got.list;
          saveRosterList(cls, list);
          if (got.problems.length) warn = `ברשימה שבגיליון: ${got.problems[0]}`;
        } else if (!got.list.length) {
          // לשונית ריקה — מעלים את מה שיש במקום להישאר בלי רשימה
          if (hasRoster(cls)) await Sheets.writeRows(ROSTER_TAB(cls), rosterToRows(list), 5);
        } else {
          warn = `הרשימה שבגיליון לא תקינה (${got.problems[0]}) — ממשיך עם הרשימה שבמכשיר`;
        }
      } catch {
        /* כשל רשת או הרשאה. ממשיכים עם הרשימה המקומית: עדיף שיעור עם
           רשימה מהמטמון מאשר אפליקציה שלא עולה. */
      }
      const ledger = rowsToLedger(buildRoster(list), rows);
      saveLedger(cls, ledger);
      let log = loadAtt(cls);
      try {
        log = rowsToAtt(await Sheets.readRows(ATT_TAB(cls), 5));
        saveAtt(cls, log);
      } catch {
        // יומן הנוכחות הוא תוספת — כשל בקריאתו לא צריך להפיל את הסנכרון
      }
      pulled.current({ list, ledger, log });
      setMsg(warn || `מסונכרן · ${ledger.lessons} שיעורים בגיליון`);
    } catch (e) {
      setOn(Sheets.connected());
      if (!silent) setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setMsg("");
    setBusy(true);
    try {
      await Sheets.connect();
      markGoogle();
      setOn(true);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * כל מסלול שמירה מסתיים כאן, אחרי שהמטמון כבר עודכן: או שהנתון הגיע
   * לגיליון, או שהוא מסומן כממתין — אין מצב שלישי. הסימון נדלק **לפני**
   * הניסיון, כדי שסנכרון שרץ במקביל יעלה ולא ימשוך.
   *
   * הטוקן של גוגל חי כשעה. כשהוא פג, הלחיצה על "שמור" היא עצמה מבקשת
   * חדש — זו מחוות משתמש, ולכן הדפדפן מרשה — במקום להשאיר את השיעור
   * במכשיר עד שהמורה ישים לב. רק במכשיר שכבר התחבר פעם.
   *
   * `roster`: להעלות גם את הרשימה. היא עולה בכל מקרה כשכבר היה משהו
   * ממתין, כי ייתכן שזו הייתה עריכת רשימה.
   */
  const upload = async ({ ok, offline, fail, roster = false }) => {
    const all = roster || loadPending(cls);
    mark(true);
    setBusy(true);
    try {
      if (!Sheets.connected() && usedGoogle()) {
        try {
          await Sheets.connect();
          quiet.current = true;
        } catch {
          // לא התחבר — נשמר במכשיר, כמו קודם
        }
      }
      if (!Sheets.connected()) {
        setOn(false);
        return setMsg(offline);
      }
      setOn(true);
      await pushAll(cls, { roster: all });
      mark(false);
      setMsg(ok);
    } catch (e) {
      setOn(Sheets.connected());
      setMsg(fail + e.message);
    } finally {
      setBusy(false);
    }
  };

  // משיכה בכניסה לכיתה, וברגע שהתחברנו
  useEffect(() => {
    if (on && !quiet.current) pull(true);
    quiet.current = false;
    // pull תלויה ב-cls בלבד, והוא קבוע לכל חיי הרכיב
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  /* הטוקן פג בשקט. בדיקה תקופתית, ועוד אחת בכל חזרה למסך — בטלפון
     האפליקציה מושהית בין שיעור לשיעור, וטיימר לבדו לא בהכרח רץ. */
  useEffect(() => {
    const check = () => {
      const live = Sheets.connected();
      setOn((was) => {
        if (was && !live) setMsg("החיבור לגיליון פג — הוא יתחדש בשמירה הבאה, או בלחיצה על ״גיליון״");
        return live;
      });
    };
    const t = setInterval(check, 20000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return { on, msg, busy, pending, connect, pull, upload, setMsg };
}

/**
 * סיכום השיעור הקודם ממסמך התיעוד. מוצג מיד מהמטמון, ונקרא מחדש בכל
 * כניסה ובכל חזרה למסך: בטלפון האפליקציה נשארת פתוחה מהשיעור הקודם,
 * והתיעוד נכתב בינתיים. `fresh` = נקרא מהמסמך בביקור הזה.
 */
export function useLastNote(cls, on) {
  const [note, setNote] = useState(() => ({ last: loadNote(cls), err: "", fresh: false }));
  useEffect(() => {
    const id = Sheets.LESSON_DOCS[cls];
    if (!on || !id) return;
    let alive = true;
    const read = async () => {
      if (document.visibilityState === "hidden" || !Sheets.connected()) return;
      try {
        const last = lastLesson(docToLines(await Sheets.readDoc(id)));
        if (!alive) return;
        if (last) saveNote(cls, last);
        setNote({ last, err: last ? "" : "לא מצאתי במסמך התיעוד שורת תאריך", fresh: true });
      } catch (e) {
        if (alive) setNote((v) => ({ ...v, err: e.message }));
      }
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", read);
    };
  }, [cls, on]);
  return note;
}
