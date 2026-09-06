import test from "node:test";
import assert from "node:assert/strict";
import {
  ROSTERS,
  CLASSES,
  TEACHER,
  MAX_LOAD,
  MAX_GROUP,
  EMPTY,
  applyLesson,
  addToDraw,
  removeFromDraw,
  buildRoster,
  pairKey,
  attempt,
  bestDraw,
  capacity,
  bottleneck,
  encodeLedger,
  decodeLedger,
  ledgerToRows,
  rowsToLedger,
} from "./ensembles.js";

const poolOf = (cls, teacher = true) => (teacher ? [...ROSTERS[cls], TEACHER] : ROSTERS[cls]);
const each = (fn) => CLASSES.forEach((cls) => [true, false].forEach((t) => fn(cls, t)));

/* ============================ הרשימה ============================ */

test("לכל תלמיד מזהה יציב, ואין כפילויות", () => {
  for (const cls of CLASSES) {
    const ids = ROSTERS[cls].map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `מזהה כפול בכיתה ${cls}`);
    ids.forEach((id) => assert.ok(id && id.trim(), "מזהה ריק"));
  }
});

test("המזהה לא נגזר מהשם — תיקון שם לא מאפס היסטוריה", () => {
  const before = buildRoster([["דנה", "כהן", ["בס"], "דנה-כהן"]]);
  const afterTypoFix = buildRoster([["דנה", "כהן לוי", ["בס"], "דנה-כהן"]]);
  assert.equal(afterTypoFix[0].id, before[0].id);
  assert.notEqual(afterTypoFix[0].name, undefined);
});

test("שורה בלי מזהה נופלת חזרה לנגזרת הישנה", () => {
  assert.equal(buildRoster([["דנה", "כהן", ["בס"]]])[0].id, "דנה-כהן");
});

test("מזהה כפול נכשל ברעש ולא בשקט", () => {
  assert.throws(
    () => buildRoster([["א", "ב", ["בס"], "x"], ["ג", "ד", ["תופים"], "x"]]),
    /מזהה כפול/
  );
});

/* ============================ החלוקה ============================ */

test("כל הרכב מקבל ריתמיקה מלאה, ואיש לא חורג מהמכסה", () => {
  each((cls, teacher) => {
    const pool = poolOf(cls, teacher);
    const { rec } = capacity(pool);
    for (let i = 0; i < 20; i++) {
      const r = bestDraw(pool, rec, EMPTY);
      assert.ok(r, `${cls} teacher=${teacher}: אין חלוקה ל-${rec} הרכבים`);
      for (const g of r.groups) {
        for (const role of ["drums", "bass", "harmony"])
          assert.ok(
            g.some((m) => m.slot === role),
            `${cls}: הרכב בלי ${role}`
          );
        // כלי ייחודי מופיע פעם אחת בהרכב, ואין תלמיד פעמיים באותו הרכב
        for (const inst of ["תופים", "בס", "פסנתר", "גיטרה"])
          assert.ok(g.filter((m) => m.playing === inst).length <= 1, `${cls}: שני ${inst} בהרכב`);
        const ids = g.map((m) => m.id);
        assert.equal(new Set(ids).size, ids.length, `${cls}: תלמיד פעמיים באותו הרכב`);
      }
      Object.entries(r.load).forEach(([id, n]) =>
        assert.ok(n <= MAX_LOAD, `${cls}: ${id} מנגן ב-${n} הרכבים`)
      );
    }
  });
});

test("הפנקס מזיז עדיפות: מי שצבר הרבה יושב לפני מי שצבר מעט", () => {
  const cls = "י״א";
  const roster = ROSTERS[cls];
  // נותנים לחצי הראשון חוב גבוה, ובודקים מי נוטה לשבת כשיש ספסל
  const heavy = new Set(roster.slice(0, 11).map((s) => s.id));
  const ledger = { plays: {}, pairs: {}, lessons: 10 };
  roster.forEach((s) => (ledger.plays[s.id] = heavy.has(s.id) ? 20 : 0));
  let heavyBench = 0;
  let lightBench = 0;
  for (let i = 0; i < 40; i++) {
    const r = bestDraw(roster, 2, ledger); // k=2 משאיר ספסל
    r.bench.forEach((s) => (heavy.has(s.id) ? heavyBench++ : lightBench++));
  }
  assert.ok(heavyBench > lightBench * 2, `עמוסים ${heavyBench} מול מקופחים ${lightBench}`);
});

/* ============================ שמירה בפנקס ============================ */

test("שמירת שיעור מוסיפה שיעור אחד ומעדכנת רק את מי שניגן", () => {
  const roster = ROSTERS["ט׳"];
  const r = bestDraw([...roster, TEACHER], 3, EMPTY);
  const next = applyLesson(roster, r, EMPTY);
  assert.equal(next.lessons, 1);
  const played = new Set(Object.keys(r.load));
  roster.forEach((s) => {
    const n = next.plays[s.id] || 0;
    if (played.has(s.id)) assert.equal(n, r.load[s.id]);
    else assert.equal(n, 0, `${s.name} צבר בלי לנגן`);
  });
  assert.ok(!("__teacher" in next.plays), "המורה נספר בפנקס");
});

test("שמירה חוזרת מעל אותו בסיס מחליפה ולא נספרת פעמיים (רגרסיה)", () => {
  // תיקון נוכחות אחרי שמירה, חלוקה מחדש ושמירה שוב — שיעור אחד, לא שניים
  const roster = ROSTERS["ט׳"];
  const base = { plays: {}, pairs: {}, lessons: 4 };
  const first = applyLesson(roster, bestDraw([...roster, TEACHER], 3, base), base);
  assert.equal(first.lessons, 5);

  const absent = new Set([roster[0].id]);
  const redraw = bestDraw([...roster.filter((s) => !absent.has(s.id)), TEACHER], 3, base);
  const second = applyLesson(roster, redraw, base); // מעל אותו בסיס, לא מעל התוצאה
  assert.equal(second.lessons, 5, "השמירה השנייה נספרה כשיעור נוסף");

  const total = roster.reduce((a, s) => a + (second.plays[s.id] || 0), 0);
  assert.ok(total <= roster.length * 2, "הצבירה הוכפלה");
  assert.equal(second.plays[roster[0].id] || 0, 0, "מי שסומן נעדר צבר בכל זאת");
});

test("applyLesson לא משנה את הבסיס, כדי שאפשר יהיה לבטל שמירה", () => {
  const roster = ROSTERS["ט׳"];
  const base = { plays: { [roster[1].id]: 3 }, pairs: { [pairKey(roster[0].id, roster[1].id)]: 2 }, lessons: 4 };
  const snapshot = JSON.parse(JSON.stringify(base));
  applyLesson(roster, bestDraw([...roster, TEACHER], 3, base), base);
  assert.deepEqual(base, snapshot, "הבסיס שונה במקום להיות מועתק");
});

/* ==================== שינוי נוכחות באמצע השיעור ==================== */

const drawFor = (cls, k) => bestDraw([...ROSTERS[cls], TEACHER], k, EMPTY);

test("מי שהגיע באיחור נכנס להרכב בלי לפרק את השאר", () => {
  const cls = "י״א";
  const roster = ROSTERS[cls];
  const late = roster.find((s) => s.instruments[0] === "שירה");
  const present = roster.filter((s) => s.id !== late.id);
  const before = bestDraw([...present, TEACHER], 4, EMPTY);
  const after = addToDraw(before, late, EMPTY);
  assert.ok(after, "לא נמצא כיסא למי שהגיע");

  // כל שאר ההרכבים זהים לחלוטין — אף אחד לא הוזז
  after.groups.forEach((g, i) => {
    const without = g.filter((m) => m.id !== late.id);
    assert.deepEqual(
      without.map((m) => m.id + ":" + m.playing),
      before.groups[i].map((m) => m.id + ":" + m.playing),
      `הרכב ${i + 1} השתנה`
    );
  });
  const joinedTo = after.groups.findIndex((g) => g.some((m) => m.id === late.id));
  assert.equal(joinedTo, after.joined);
  assert.equal(after.load[late.id], 1);
});

test("מי שכבר בחלוקה לא נכנס פעמיים", () => {
  const r = drawFor("ט׳", 3);
  const inside = r.groups[0][0];
  assert.equal(addToDraw(r, inside, EMPTY), null);
});

test("כשאין כיסא פנוי מדווחים במקום לדחוף בכוח", () => {
  // מתופף נוסף כשכל ההרכבים כבר מלאים בתופים
  const r = drawFor("ט׳", 3);
  r.groups.forEach((g) => assert.ok(g.some((m) => m.playing === "תופים")));
  const extraDrummer = { id: "חדש-מתופף", name: "חדש", instruments: ["תופים"], roles: ["drums"] };
  assert.equal(addToDraw(r, extraDrummer, EMPTY), null);
});

test("מי שממלא תפקיד חסר מקבל עדיפות על ההרכב הקטן", () => {
  const r = drawFor("ט׳", 3);
  // בסיסט שמנגן בהרכב אחד בלבד: הוצאתו פותחת חור יחיד, שאפשר לבדוק במדויק
  const bassist = r.groups.flat().find((m) => m.playing === "בס" && r.load[m.id] === 1);
  const at = r.groups.findIndex((g) => g.some((m) => m.id === bassist.id));
  const gapped = removeFromDraw(r, bassist.id);
  assert.ok(gapped.broken.some((b) => b.group === at && b.missing.includes("bass")));
  const back = addToDraw(gapped, bassist, EMPTY);
  assert.equal(back.joined, at, "הבסיסט לא חזר להרכב שנשאר בלי בס");
  assert.ok(
    !removeFromDraw(back, "אף-אחד").broken.some((b) => b.group === at),
    "ההרכב עדיין חסר תפקיד אחרי ההשלמה"
  );
});

test("תלמיד שמנגן בשני הרכבים משאיר שני חורים כשהוא יוצא", () => {
  const r = drawFor("ט׳", 3);
  const twice = r.groups.flat().find((m) => r.load[m.id] === 2 && !m.teacher);
  if (!twice) return; // לא בכל חלוקה יש כזה
  const out = removeFromDraw(r, twice.id);
  assert.equal(out.broken.length, 2, "לא דווח על שני ההרכבים");
  // החזרה ממלאת אחד מהם — המורה רואה בהודעה שהשני עדיין חסר
  const back = addToDraw(out, twice, EMPTY);
  assert.equal(removeFromDraw(back, "אף-אחד").broken.length, 1);
});

test("הוצאת תלמיד לא נוגעת בשאר ומדווחת על תפקיד שנפער", () => {
  const r = drawFor("ט׳", 3);
  const drummer = r.groups[0].find((m) => m.playing === "תופים");
  const out = removeFromDraw(r, drummer.id);
  assert.ok(!out.groups.flat().some((m) => m.id === drummer.id), "התלמיד עדיין בחלוקה");
  assert.equal(out.load[drummer.id], undefined);
  assert.ok(
    out.broken.some((b) => b.missing.includes("drums")),
    "לא דווח שההרכב נשאר בלי תופים"
  );
  // ההרכבים שלא נגעו בהם זהים
  out.groups.forEach((g, i) => {
    if (r.groups[i].some((m) => m.id === drummer.id)) return;
    assert.deepEqual(g.map((m) => m.id), r.groups[i].map((m) => m.id), `הרכב ${i + 1} השתנה`);
  });
});

test("הוצאה והחזרה לא משנות את סך הניגון בפנקס", () => {
  const cls = "ט׳";
  const roster = ROSTERS[cls];
  const r = drawFor(cls, 3);
  const someone = r.groups[2].find((m) => !m.teacher && m.slot === "melody");
  const back = addToDraw(removeFromDraw(r, someone.id), roster.find((s) => s.id === someone.id), EMPTY);
  const before = applyLesson(roster, r, EMPTY);
  const after = applyLesson(roster, back, EMPTY);
  assert.equal(
    roster.reduce((a, s) => a + (after.plays[s.id] || 0), 0),
    roster.reduce((a, s) => a + (before.plays[s.id] || 0), 0)
  );
});

/* ============================ capacity ============================ */

test("ההמלצה יציבה ולא קורסת ל-1 (רגרסיה)", () => {
  each((cls, teacher) => {
    const pool = poolOf(cls, teacher);
    const recs = new Set();
    for (let i = 0; i < 25; i++) recs.add(capacity(pool).rec);
    assert.equal(recs.size, 1, `${cls} teacher=${teacher}: המלצה לא יציבה ${[...recs]}`);
    assert.ok([...recs][0] > 1, `${cls} teacher=${teacher}: ההמלצה נפלה ל-${[...recs][0]}`);
  });
});

test("ההמלצה תמיד בטווח, וניתנת לחלוקה בפועל", () => {
  each((cls, teacher) => {
    const pool = poolOf(cls, teacher);
    const { max, rec } = capacity(pool);
    assert.ok(rec >= 1 && rec <= max, `${cls}: rec=${rec} max=${max}`);
    assert.ok(bestDraw(pool, rec, EMPTY), `${cls}: אי אפשר לחלק ל-${rec}`);
  });
});

test("כשאין k מושלם בוחרים את הטוב שנמצא ולא נופלים ל-1", () => {
  // רשימה עם מתופף אחד: התקרה 2, וההמלצה חייבת להיות 2 ולא 1
  const one = ROSTERS["י״א"].filter(
    (s) => !["נועם-בנימיני", "איתן-יעקובסון"].includes(s.id)
  );
  const { max, rec } = capacity(one);
  assert.equal(max, 2);
  assert.equal(rec, 2);
});

test("ההמלצה מכבדת את גודל ההרכב כשאפשר", () => {
  each((cls, teacher) => {
    const pool = poolOf(cls, teacher);
    const { rec } = capacity(pool);
    const sizes = attempt(pool, rec, EMPTY, 40).map((r) => Math.max(...r.groups.map((g) => g.length)));
    assert.ok(Math.min(...sizes) <= MAX_GROUP, `${cls}: כל החלוקות גדולות מ-${MAX_GROUP}`);
  });
});

/* ============================ צוואר הבקבוק ============================ */

test("התפקיד הנדיר קובע את התקרה", () => {
  const oneDrummer = ROSTERS["י״א"].filter(
    (s) => !["נועם-בנימיני", "איתן-יעקובסון"].includes(s.id)
  );
  const b = bottleneck(oneDrummer);
  assert.equal(b.role, "drums");
  assert.equal(b.count, 1);
  assert.equal(b.limit, MAX_LOAD);
  assert.ok(capacity(oneDrummer).max <= b.limit, "התקרה בפועל חרגה מהחסם התיאורטי");
});

/* ============================ הגיבוי ============================ */

const sampleLedger = (cls) => {
  const ids = ROSTERS[cls].map((s) => s.id);
  return {
    ids,
    ledger: {
      plays: Object.fromEntries(ids.map((id, i) => [id, i])),
      pairs: { [pairKey(ids[0], ids[3])]: 7, [pairKey(ids[1], ids[2])]: 2 },
      lessons: 4,
    },
  };
};

test("גיבוי הלוך ושוב שומר על הכול", () => {
  for (const cls of CLASSES) {
    const { ids, ledger } = sampleLedger(cls);
    const { ledger: back, dropped, added } = decodeLedger(cls, encodeLedger(cls, ledger));
    ids.forEach((id) => assert.equal(back.plays[id], ledger.plays[id]));
    assert.deepEqual(back.pairs, ledger.pairs);
    assert.equal(back.lessons, 4);
    assert.equal(dropped, 0);
    assert.equal(added, 0);
  }
});

test("הוספת תלמיד לרשימה לא מזיזה לאחרים את ההיסטוריה (רגרסיה)", () => {
  const cls = "ט׳";
  const { ids, ledger } = sampleLedger(cls);
  const text = JSON.parse(encodeLedger(cls, ledger));
  // מדמים גיבוי שנוצר לפני שנוסף תלמיד בראש הרשימה
  text.s = text.s.slice(1);
  text.p = text.p.slice(1);
  const { ledger: back, added } = decodeLedger(cls, JSON.stringify(text));
  ids.slice(1).forEach((id) => assert.equal(back.plays[id], ledger.plays[id], `${id} זז`));
  assert.equal(added, 1, "התלמיד החדש לא דווח");
});

test("תלמיד שהוסר מדווח ולא משנה נתונים בשקט", () => {
  const cls = "ט׳";
  const { ledger } = sampleLedger(cls);
  const text = JSON.parse(encodeLedger(cls, ledger));
  text.s = ["רוח-רפאים", ...text.s.slice(1)];
  const { dropped } = decodeLedger(cls, JSON.stringify(text));
  assert.equal(dropped, 1);
});

test("גיבוי בפורמט הישן (v1) עדיין נקרא", () => {
  const cls = "ט׳";
  const { ids, ledger } = sampleLedger(cls);
  const v2 = JSON.parse(encodeLedger(cls, ledger));
  const v1 = JSON.stringify({ v: 1, c: v2.c, l: v2.l, p: v2.p, x: v2.x }); // בלי s
  const { ledger: back } = decodeLedger(cls, v1);
  ids.forEach((id) => assert.equal(back.plays[id], ledger.plays[id]));
  assert.deepEqual(back.pairs, ledger.pairs);
});

test("גיבוי של כיתה אחרת נדחה", () => {
  const { ledger } = sampleLedger("ט׳");
  assert.throws(() => decodeLedger("י״א", encodeLedger("ט׳", ledger)), /שייך לכיתה/);
});

/* ============================ הגיליון ============================ */

test("כתיבה וקריאה של הגיליון שומרות על הכול", () => {
  for (const cls of CLASSES) {
    const { ids, ledger } = sampleLedger(cls);
    const back = rowsToLedger(cls, ledgerToRows(cls, ledger));
    ids.forEach((id) => assert.equal(back.plays[id], ledger.plays[id]));
    assert.deepEqual(back.pairs, ledger.pairs);
    assert.equal(back.lessons, 4);
  }
});

test("הגיליון נושא עמודת מזהה", () => {
  const cls = "ט׳";
  const rows = ledgerToRows(cls, sampleLedger(cls).ledger);
  assert.equal(rows[1][2], "מזהה");
  assert.equal(rows[2][2], ROSTERS[cls][0].id);
});

test("גיליון ישן בלי עמודת מזהה עדיין נקרא לפי שם", () => {
  const cls = "ט׳";
  const { ids, ledger } = sampleLedger(cls);
  const old = ledgerToRows(cls, ledger).map((r, i) => (i < 2 ? r : [r[0], r[1], "", ""]));
  const back = rowsToLedger(cls, old);
  ids.forEach((id) => assert.equal(back.plays[id], ledger.plays[id]));
  assert.deepEqual(back.pairs, ledger.pairs);
});

test("שורה בגיליון שאין לה מקבילה ברשימה לא מזייפת צירופים", () => {
  const cls = "ט׳";
  const { ids, ledger } = sampleLedger(cls);
  const rows = ledgerToRows(cls, ledger);
  rows[2] = ["מישהו אחר", 99, "לא-קיים", ""]; // התלמיד הראשון הוחלף
  const back = rowsToLedger(cls, rows);
  assert.equal(back.plays["לא-קיים"], undefined);
  assert.equal(back.pairs[pairKey(ids[0], ids[3])], undefined, "צירוף שויך לתלמיד הלא נכון");
  assert.equal(back.pairs[pairKey(ids[1], ids[2])], 2, "צירוף תקין נפגע");
});

test("שם שהשתנה בגיליון לא מאבד היסטוריה — המזהה מנצח (רגרסיה)", () => {
  const cls = "ט׳";
  const { ids, ledger } = sampleLedger(cls);
  const rows = ledgerToRows(cls, ledger);
  // שם התצוגה של תלמיד משתנה מעצמו ברגע שנוסף עוד תלמיד עם אותו שם פרטי,
  // ואז השורה בגיליון כבר לא תואמת בשם. עמודת המזהה היא שמצילה אותה.
  const i = rows.findIndex((r) => r[2] === ids[3]);
  rows[i] = ["שם ישן שלא קיים ברשימה", rows[i][1], ids[3], ""];
  const back = rowsToLedger(cls, rows);
  assert.equal(back.plays[ids[3]], ledger.plays[ids[3]], "ההיסטוריה אבדה");
  assert.equal(back.pairs[pairKey(ids[0], ids[3])], 7, "הצירוף אבד");
});

test("לשונית ריקה מחזירה פנקס ריק", () => {
  assert.deepEqual(rowsToLedger("ט׳", []), EMPTY);
});
