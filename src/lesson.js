/* מצב השיעור של היום (reducer), ושמירתו במכשיר.
   בלי React ובלי דפדפן — נבדק ישירות ב-`npm test`. */

/* ============================ מצב השיעור ============================

   ערכים שתמיד השתנו יחד: החלוקה, האם נשמרה, הפנקס שלפניה, תמונת
   הנוכחות ברגע החלוקה, היום שבו נערכה, השגיאה, ההודעה, הנגן שנבחר
   לעריכה, ההרכב שמוסיפים אליו נגן, והחלוקה שלפני העריכה האחרונה. כל מסלול היה צריך לזכור את כל ה-setters, ומסלול ששכח אחד
   מהם השאיר על המסך הודעה או בחירה ממצב קודם.

   reducer הופך כל שינוי למעבר אחד בעל שם, ולכן אי אפשר לשכוח חצי ממנו.
   הוא כאן ולא ב-App.jsx כדי שיהיה אפשר לבדוק אותו ישירות: מחזור החיים
   של `atDraw` הוא מה שקובע מי נרשם כמאחר, ובלי בדיקה הוא נשבר בשקט.
   ================================================================== */

const NO_LESSON = {
  res: null,
  saved: false,
  base: null,
  atDraw: null,
  day: null,
  err: "",
  msg: "",
  sel: null,
  cls: null, // הכיתה שהמצב שייך לה — רק מצב של הכיתה הנוכחית נשמר במכשיר
  adding: null, // אינדקס ההרכב שפותחים בו את בורר ההוספה
  undo: null, // החלוקה שלפני העריכה הידנית האחרונה
};

/**
 * השיעור של היום כטקסט, כדי שיעבור רענון של הדף. החלוקה חיה ב-reducer, כלומר
 * בזיכרון — ובטלפון דף ברקע נסגר, או שהמורה מרענן לקבל גרסה חדשה, והחלוקה
 * והעריכות הידניות היו אובדות. נשמר גם `base`: בלעדיו שמירה אחרי רענון הייתה
 * נספרת כשיעור נוסף במקום לעדכן את זה שכבר נשמר, ו״בטל שמירה״ לא היה זמין.
 */
function packLesson(st, today, teacher) {
  return JSON.stringify({
    v: 1,
    d: today,
    teacher,
    res: st.res,
    saved: st.saved,
    base: st.base,
    atDraw: st.atDraw ? [...st.atDraw] : null,
    day: st.day,
    undo: st.undo,
  });
}

/**
 * מחזיר `{ lesson, teacher }`, או null כשאין מה לשחזר: טקסט פגום, שיעור של
 * יום אחר (אסור שחלוקה של שבוע שעבר תחזור), או חלוקה שמזכירה תלמיד שכבר
 * אינו ברשימה. עדיף חלוקה חדשה על חלוקה שאי אפשר לסמוך עליה.
 */
function unpackLesson(text, today, knownIds) {
  try {
    const o = JSON.parse(text);
    if (!o || o.v !== 1 || o.d !== today || !o.res || !Array.isArray(o.res.groups)) return null;
    const known = new Set(knownIds);
    const seen = [...o.res.groups.flat(), ...(o.res.bench || [])];
    if (seen.some((m) => !known.has(m.id))) return null;
    return {
      teacher: o.teacher !== false,
      lesson: {
        res: o.res,
        saved: !!o.saved,
        base: o.base || null,
        atDraw: Array.isArray(o.atDraw) ? new Set(o.atDraw) : null,
        day: o.day ?? null,
        undo: o.undo || null,
      },
    };
  } catch {
    return null;
  }
}

function lessonReducer(st, a) {
  switch (a.type) {
    // כיתה אחרת, רשימה שנערכה, או פנקס שנטען — הכול מתחיל מחדש
    case "reset":
      return { ...NO_LESSON, cls: st.cls };
    // טעינת הכיתה: השיעור של היום כפי שנשמר במכשיר, או שיעור ריק
    case "restore":
      return { ...NO_LESSON, ...(a.lesson || {}), cls: a.cls };
    // החלוקה יורדת מהמסך, אבל השיעור עצמו נמשך (הפנקס שלפניו נשמר)
    case "cleared":
      return { ...st, res: null, saved: false, err: "", msg: "", sel: null, adding: null, undo: null };
    case "drew": {
      /* תמונת הנוכחות נלקחת בחלוקה הראשונה של השיעור ונשמרת בחלוקה
         חוזרת, אחרת "חלק מחדש" היה מוחק את רישום האיחורים.

         אבל היא לא נגררת ליום אחר. אפליקציה שנשארה פתוחה משיעור לשיעור
         (טלפון, PWA) הייתה מגיעה לשיעור הבא עם התמונה של הקודם, ואז
         רושמת כמאחר את מי שנעדר בשבוע שעבר ומפספסת את מי שאיחר היום.
         זה בדיוק מה ש-loadAbsent כבר נזהר ממנו במטמון — ובזיכרון זה
         נשאר פרוץ. מאותה סיבה גם `base` מתאפס: בלעדיו השמירה של היום
         הייתה נכתבת על השיעור של השבוע שעבר במקום להוסיף לו. */
      const sameDay = st.day === null || st.day === a.day;
      return {
        ...st,
        res: a.res,
        err: a.err,
        saved: false,
        msg: "",
        sel: null,
        adding: null,
        undo: null,
        day: a.day ?? st.day,
        base: sameDay ? st.base : null,
        atDraw: (sameDay && st.atDraw) || a.atDraw,
      };
    }
    /* עריכה ידנית, או מי שהגיע/יצא באמצע — החלוקה משתנה בלי להיבנות מחדש.
       רק עריכה ידנית (`undoable`) ניתנת לביטול: שינוי נוכחות משנה גם את
       קבוצת הנעדרים, וביטולו היה משאיר את החלוקה והנוכחות לא מסונכרנות. */
    case "edit":
      return {
        ...st,
        res: a.res ?? st.res,
        saved: false,
        err: "",
        msg: a.msg || "",
        sel: null,
        adding: null,
        undo: a.undoable ? st.res : null,
      };
    case "undo":
      return st.undo
        ? { ...st, res: st.undo, undo: null, saved: false, msg: "העריכה האחרונה בוטלה.", sel: null, adding: null }
        : st;
    case "msg":
      return { ...st, msg: a.msg };
    case "select":
      return { ...st, sel: a.sel, adding: null, msg: a.sel ? "" : st.msg };
    case "adding":
      return { ...st, adding: a.g, sel: null, msg: "" };
    /* מי שסומן חסר בטעות לפני החלוקה ותוקן אחריה נרשם כמאחר. זו הדרך
       לומר "הוא היה כאן מההתחלה" — בלי לפתוח את הגיליון ולמחוק שורה. */
    case "onTime": {
      if (!st.atDraw || !st.atDraw.has(a.id)) return st;
      const atDraw = new Set(st.atDraw);
      atDraw.delete(a.id);
      return { ...st, atDraw, saved: false };
    }
    case "saved":
      return { ...st, saved: true, base: a.base };
    case "undone":
      return { ...st, saved: false, base: null };
    /* הפנקס נמשך מהגיליון. אם השיעור של היום הוא האחרון שם — בדיוק שיעור
       אחד מעל `base` — דבר לא השתנה, והשיעור נשאר שמור על אותו בסיס.
       קודם כל משיכה איפסה את שניהם: מספיק היה להחליף כיתה ולחזור, והכפתור
       חזר ל"שמור את השיעור" וספר את אותו שיעור פעמיים.
       כשהגיליון מחזיק מספר אחר, הבסיס כבר אינו נכון. פחות שיעורים — השיעור
       אינו שם וצריך לשמור אותו; יותר — הוא שם, ומישהו שמר אחריו. */
    case "rebased": {
      if (!st.base) return st;
      const mine = st.base.lessons + 1;
      if (a.lessons === mine) return st;
      return { ...st, base: null, saved: a.lessons > mine ? st.saved : false };
    }
    /* היום התחלף בזמן שהאפליקציה נשארה פתוחה. חלוקה של יום אחר אינה
       השיעור של היום: עריכה ושמירה שלה היו נכתבות על ה-`base` הישן,
       כלומר דורסות את השיעור הקודם במקום להוסיף אחד. */
    case "tick":
      return st.day && st.day !== a.day ? { ...NO_LESSON, cls: st.cls } : st;
    default:
      return st;
  }
}

export {
  NO_LESSON,
  packLesson,
  unpackLesson,
  lessonReducer,
};
