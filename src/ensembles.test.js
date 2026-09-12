import test from "node:test";
import assert from "node:assert/strict";
import {
  ROSTERS,
  CLASSES,
  TEACHER,
  MAX_LOAD,
  MIN_GROUP,
  MAX_GROUP,
  MAX_GROUPS,
  REQUIRED,
  ROLE_OF,
  EMPTY,
  applyLesson,
  addToDraw,
  enrichHarmony,
  removeFromDraw,
  repairDraw,
  swapPlayers,
  ATT_TAB,
  FORMER_NAMES,
  attendanceOf,
  lessonAttendance,
  mergeAttendance,
  attToRows,
  rowsToAtt,
  attendanceSummary,
  buildRoster,
  forRole,
  ORDER,
  pairKey,
  attempt,
  bestDraw,
  capacity,
  emptyRoles,
  SEED,
  INSTRUMENTS,
  rowsToRoster,
  rosterToRows,
  makeId,
  assignIds,
  rosterProblems,
  encodeLedger,
  decodeLedger,
  ledgerToRows,
  rowsToLedger,
} from "./ensembles.js";

const poolOf = (cls, teacher = true) => (teacher ? [...ROSTERS[cls], TEACHER] : ROSTERS[cls]);
/* מספר ההרכבים נגזר מהנתונים ולא מקובע: עריכת רשימת התלמידים משנה את
   מה שאפשר, ובדיקה שמקבעת מספר נשברת בכל שינוי כזה. */
const recK = (cls) => capacity(poolOf(cls)).rec;
/* חריגה מ-MAX_LOAD חוקית רק כשתפקיד חיוני לא ניתן לכיסוי אחרת —
   למשל בסיסט יחיד בכיתה שחייב לנגן בכל ההרכבים. */
const overloadOk = (pool, k, id, n) => {
  if (n <= MAX_LOAD) return true;
  const me = pool.find((s) => s.id === id);
  if (!me) return false;
  return REQUIRED.some(
    (r) => me.roles.includes(r) && pool.filter((s) => s.roles.includes(r)).length * MAX_LOAD < k
  );
};
const recDraw = (cls, ledger = EMPTY) => bestDraw(poolOf(cls), recK(cls), ledger);
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

/* ========================= כלי משני (רזרבה) ========================= */

test("כלי משני נכנס רק כשאין אף נוכח שזה כליו הראשי", () => {
  const roster = ROSTERS["י״א"];
  const backupBass = roster.find((s) => s.backupRoles.includes("bass"));
  assert.ok(backupBass, "אין בי״א בעל כלי משני בס לבדיקה");
  const primaries = roster.filter((s) => s.roles.includes("bass"));
  assert.ok(primaries.length >= 2, "צריך שני בסיסטים ראשיים לבדיקה");

  // כל הבסיסטים הראשיים נוכחים — הרזרבה לא נכנסת לתפקיד
  for (let i = 0; i < 15; i++) {
    const d = bestDraw(poolOf("י״א"), recK("י״א"), EMPTY);
    const asBass = d.groups.flat().filter((mm) => mm.id === backupBass.id && mm.playing === "בס");
    assert.equal(asBass.length, 0, `${backupBass.name} ניגן בס למרות שיש בסיסט ראשי נוכח`);
  }

  // גם כשרק אחד מהם נוכח — עדיין יש ראשי, ולכן הרזרבה עדיין לא נכנסת
  const oneGone = roster.filter((s) => s.id !== primaries[0].id);
  const pool1 = [...oneGone, TEACHER];
  const d1 = bestDraw(pool1, capacity(pool1).rec, EMPTY);
  assert.ok(d1);
  assert.equal(
    d1.groups.flat().filter((mm) => mm.id === backupBass.id && mm.playing === "בס").length,
    0,
    "הרזרבה נכנסה למרות שנשאר בסיסט ראשי"
  );
});

test("כלי משני כן נכנס כשאין אף ראשי נוכח", () => {
  const roster = ROSTERS["י״א"];
  const backupBass = roster.find((s) => s.backupRoles.includes("bass"));
  const present = roster.filter((s) => !s.roles.includes("bass"));
  const pool = [...present, TEACHER];
  const k = capacity(pool).rec;
  const d = bestDraw(pool, k, EMPTY);
  assert.ok(d, "לא נוצרה חלוקה למרות שיש רזרבה");
  d.groups.forEach((g, i) =>
    assert.ok(g.some((mm) => mm.playing === "בס"), `הרכב ${i + 1} נשאר בלי בס`)
  );
  assert.ok(d.load[backupBass.id] > 0, "הרזרבה לא שובצה");
});

test("הבסיסט היחיד בט׳ נעדר — הרזרבה מצילה את השיעור (רגרסיה)", () => {
  const cls = "ט׳";
  const roster = ROSTERS[cls];
  const onlyBass = roster.filter((s) => s.roles.includes("bass"));
  assert.equal(onlyBass.length, 1, "ההנחה השתנתה: כבר לא בסיסט יחיד");
  const present = roster.filter((s) => s.id !== onlyBass[0].id);
  const pool = [...present, TEACHER];
  const k = capacity(pool).rec;
  assert.ok(k >= 1);
  const d = bestDraw(pool, k, EMPTY);
  assert.ok(d, "בלי הבסיסט היחיד לא נוצרה חלוקה — הרזרבה לא עבדה");
  d.groups.forEach((g, i) =>
    assert.ok(g.some((mm) => mm.playing === "בס"), `הרכב ${i + 1} בלי בס`)
  );
});

test("כלי משני אינו משמש לצירוף מלודי ולא להעשרה", () => {
  CLASSES.forEach((cls) => {
    const roster = ROSTERS[cls];
    for (let i = 0; i < 15; i++) {
      const d = recDraw(cls);
      (d.enriched || []).forEach((e) => {
        const s = roster.find((x) => x.id === e.id);
        assert.ok(s.roles.includes("harmony"), `${e.name} הועשר על כלי משני`);
      });
      // נגן שאינו ממלא תפקיד חיוני מנגן תמיד בכלי ראשי שלו
      d.groups.flat().forEach((mm) => {
        if (mm.teacher || ["drums", "bass", "harmony"].includes(mm.slot)) return;
        const s = roster.find((x) => x.id === mm.id);
        assert.ok(s.instruments.includes(mm.playing), `${mm.name} שובץ ל${mm.playing} שאינו כליו הראשי`);
      });
    }
  });
});

test("forRole מעדיף ראשי, ונופל לרזרבה רק בהיעדרו", () => {
  const prim = { id: "p", name: "p", instruments: ["בס"], roles: ["bass"], backup: [], backupRoles: [] };
  const back = { id: "b", name: "b", instruments: ["חליל"], roles: ["melody"], backup: ["בס"], backupRoles: ["bass"] };
  assert.deepEqual(forRole([prim, back], "bass"), [prim]);
  assert.deepEqual(forRole([back], "bass"), [back]);
  assert.deepEqual(forRole([prim], "bass"), [prim]);
  assert.deepEqual(forRole([back], "drums"), []);
});

test("תפקיד שיש לו רק רזרבה אינו נחשב חסר", () => {
  const roster = ROSTERS["ט׳"];
  const noPrimaryBass = roster.filter((s) => !s.roles.includes("bass"));
  assert.ok(!emptyRoles([...noPrimaryBass, TEACHER]).includes("bass"), "תפקיד עם רזרבה דווח כחסר");
  const noBassAtAll = roster.filter((s) => !s.roles.includes("bass") && !s.backupRoles.includes("bass"));
  assert.ok(emptyRoles([...noBassAtAll, TEACHER]).includes("bass"));
});

test("כל כלי משני הוא כלי מוכר, ואינו כפול לכלי ראשי", () => {
  CLASSES.forEach((cls) =>
    ROSTERS[cls].forEach((s) => {
      s.backup.forEach((inst) => {
        assert.ok(ORDER.includes(inst), `${s.name}: כלי משני לא מוכר — ${inst}`);
        assert.ok(!s.instruments.includes(inst), `${s.name}: ${inst} מופיע גם כראשי וגם כמשני`);
      });
    })
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
        assert.ok(
          overloadOk(pool, rec, id, n),
          `${cls}: ${id} מנגן ב-${n} הרכבים בלי שתפקיד חיוני חייב זאת`
        )
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
  const r = bestDraw([...roster, TEACHER], recK("ט׳"), EMPTY);
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
  const first = applyLesson(roster, bestDraw([...roster, TEACHER], recK("ט׳"), base), base);
  assert.equal(first.lessons, 5);

  const absent = new Set([roster[0].id]);
  const redraw = bestDraw([...roster.filter((s) => !absent.has(s.id)), TEACHER], recK("ט׳"), base);
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
  applyLesson(roster, bestDraw([...roster, TEACHER], recK("ט׳"), base), base);
  assert.deepEqual(base, snapshot, "הבסיס שונה במקום להיות מועתק");
});

test("הפנקס מוריד עומס ממי שמקדים בתוך אותו תפקיד (רגרסיה)", () => {
  /* נגני ריתמיקה ינגנו יותר ממלודיים — זה מבני ומקובל, כי כל הרכב חייב
     תופים, בס, כלי הרמוני וכלי מלודי. האיזון נעשה בין השיעורים דרך הפנקס: מי שצבר
     יותר מקבל פחות כיסאות בשיעור הבא. זה המנגנון שהאפליקציה נשענת עליו. */
  const roster = ROSTERS["י״א"];
  const pool = poolOf("י״א");
  const k = recK("י״א");
  let balanced = 0;
  ["drums", "bass"].forEach((role) => {
    const players = roster.filter((s) => s.roles.includes(role));
    assert.ok(players.length > 1, `אין מספיק נגני ${role} לבדיקה`);
    const ahead = players[0];
    const ledger = {
      plays: Object.fromEntries(roster.map((s) => [s.id, s.id === ahead.id ? 30 : 10])),
      pairs: {},
      lessons: 10,
    };
    const seats = {};
    for (let i = 0; i < 20; i++) {
      const d = bestDraw(pool, k, ledger);
      players.forEach((s) => (seats[s.id] = (seats[s.id] || 0) + (d.load[s.id] || 0)));
    }
    /* כשהביקוש מחייב את כולם בדיוק באותה מידה — בי״א יש שני בסיסטים
       וארבעה כיסאות בס, כלומר שניים לכל אחד — אין מה לאזן, וזה תקין.
       הפנקס נמדד שם שאין לו מרחב תמרון; המדידה האמיתית היא בתפקיד שבו
       העומס כן יכול להשתנות (מתופפים: שלושה נגנים על ארבעה כיסאות). */
    const forced = players.length * MAX_LOAD === k;
    players
      .filter((s) => s.id !== ahead.id)
      .forEach((s) =>
        assert.ok(
          forced ? seats[ahead.id] === seats[s.id] : seats[ahead.id] < seats[s.id],
          `${role}: ${ahead.name} צבר 30 וקיבל ${seats[ahead.id]} כיסאות, ${s.name} צבר 10 וקיבל ${seats[s.id]}`
        )
      );
    if (!forced) balanced++;
  });
  assert.ok(balanced > 0, "אף תפקיד לא אפשר איזון — הבדיקה איבדה את השיניים");
});

/* ==================== שינוי נוכחות באמצע השיעור ==================== */

const drawFor = (cls, k) => bestDraw([...ROSTERS[cls], TEACHER], k ?? recK("ט׳"), EMPTY);

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
  const r = drawFor("ט׳");
  const inside = r.groups[0][0];
  assert.equal(addToDraw(r, inside, EMPTY), null);
});

test("כשאין כיסא פנוי מדווחים במקום לדחוף בכוח", () => {
  // מתופף נוסף כשכל ההרכבים כבר מלאים בתופים
  const r = drawFor("ט׳");
  r.groups.forEach((g) => assert.ok(g.some((m) => m.playing === "תופים")));
  const extraDrummer = { id: "חדש-מתופף", name: "חדש", instruments: ["תופים"], roles: ["drums"] };
  assert.equal(addToDraw(r, extraDrummer, EMPTY), null);
});

test("מי שממלא תפקיד חסר מקבל עדיפות על ההרכב הקטן", () => {
  // י״א ולא ט׳: צריך בסיסט שמנגן בהרכב אחד בלבד, וזה קיים רק כשיש די בסיסטים
  const r = drawFor("י״א");
  // בסיסט שמנגן בהרכב אחד בלבד: הוצאתו פותחת חור יחיד, שאפשר לבדוק במדויק
  const bassist = r.groups.flat().find((m) => m.playing === "בס" && r.load[m.id] === 1);
  assert.ok(bassist, "אין בסיסט שמנגן בהרכב אחד בלבד");
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

test("מתופף שמנגן בשני הרכבים משאיר שני חורים כשהוא יוצא", () => {
  /* דווקא מתופף: שני הכיסאות שלו חיוניים ואין לו מחליף באותו הרכב.
     נגן הרמוני שהועשר משאיר חור אחד בלבד, כי בהרכב השני נשאר הכלי הראשי. */
  let r, twice;
  for (let i = 0; i < 30 && !twice; i++) {
    r = drawFor("ט׳");
    twice = r.groups.flat().find((m) => r.load[m.id] === 2 && !m.teacher && m.playing === "תופים");
  }
  if (!twice) return;
  const out = removeFromDraw(r, twice.id);
  assert.equal(out.broken.length, 2, "לא דווח על שני ההרכבים");
  out.broken.forEach((b) => assert.ok(b.missing.includes("drums")));
  // החזרה ממלאת אחד מהם — המורה רואה בהודעה שהשני עדיין חסר
  const back = addToDraw(out, twice, EMPTY);
  assert.equal(removeFromDraw(back, "אף-אחד").broken.length, 1);
});

test("הוצאת תלמיד לא נוגעת בשאר ומדווחת על תפקיד שנפער", () => {
  const r = drawFor("ט׳");
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
  const r = drawFor(cls);
  // עומס 1 במפורש: תלמיד שמנגן בשני הרכבים משאיר שני חורים ביציאה,
  // וחזרה ממלאת רק אחד — זה נבדק בנפרד ואינו המקרה כאן
  const someone = r.groups.flat().find((m) => !m.teacher && r.load[m.id] === 1);
  const back = addToDraw(removeFromDraw(r, someone.id), roster.find((s) => s.id === someone.id), EMPTY);
  const before = applyLesson(roster, r, EMPTY);
  const after = applyLesson(roster, back, EMPTY);
  assert.equal(
    roster.reduce((a, s) => a + (after.plays[s.id] || 0), 0),
    roster.reduce((a, s) => a + (before.plays[s.id] || 0), 0)
  );
});

/* ============ הכלל נשמר גם כשמישהו יוצא באמצע ============ */

const rhythmOk = (groups) =>
  groups.every((g) =>
    ["drums", "bass", "harmony"].every((r) => g.some((m) => ROLE_OF[m.playing] === r))
  );

test("יציאת נגן ריתמיקה נסתמת, והכלל נשמר בכל ההרכבים", () => {
  const cls = "י״א";
  const roster = ROSTERS[cls];
  let fixedCount = 0;
  for (let t = 0; t < 25; t++) {
    const r = bestDraw([...roster, TEACHER], recK("ט׳"), EMPTY);
    for (const inst of ["תופים", "בס", "פסנתר"]) {
      const victim = r.groups.flat().find((m) => m.playing === inst && !m.teacher);
      if (!victim) continue;
      const present = roster.filter((s) => s.id !== victim.id);
      const fixed = repairDraw(removeFromDraw(r, victim.id), [...present, TEACHER], EMPTY);
      assert.equal(fixed.unfixable.length, 0, `${inst}: לא הושלם ${JSON.stringify(fixed.unfixable)}`);
      assert.ok(rhythmOk(fixed.groups), `${inst}: הרכב נשאר בלי ריתמיקה מלאה`);
      fixedCount++;
    }
  }
  assert.ok(fixedCount > 20, "לא נבדקו מספיק מקרים");
});

test("ההשלמה לא מזיזה אף אחד ממקומו", () => {
  const roster = ROSTERS["י״א"];
  const r = bestDraw([...roster, TEACHER], recK("י״א"), EMPTY);
  const victim = r.groups.flat().find((m) => m.playing === "בס" && !m.teacher);
  const present = roster.filter((s) => s.id !== victim.id);
  const fixed = repairDraw(removeFromDraw(r, victim.id), [...present, TEACHER], EMPTY);

  fixed.groups.forEach((g, i) => {
    const added = new Set(fixed.filled.filter((f) => f.group === i).map((f) => f.id));
    const survivors = g.filter((m) => !added.has(m.id)).map((m) => m.id + ":" + m.playing);
    const expected = r.groups[i]
      .filter((m) => m.id !== victim.id)
      .map((m) => m.id + ":" + m.playing);
    assert.deepEqual(survivors, expected, `הרכב ${i + 1} השתנה מעבר להשלמה`);
  });
});

test("ההשלמה מעדיפה מי שעוד לא מנגן היום על מי שכבר מנגן", () => {
  const roster = ROSTERS["י״א"];
  const r = bestDraw([...roster, TEACHER], 2, EMPTY); // k=2 משאיר ספסל
  assert.ok(r.bench.length, "אין ספסל בחלוקה הזו");
  const victim = r.groups.flat().find((m) => m.playing === "תופים" && !m.teacher);
  const present = roster.filter((s) => s.id !== victim.id);
  const fixed = repairDraw(removeFromDraw(r, victim.id), [...present, TEACHER], EMPTY);
  fixed.filled.forEach((f) => {
    const alsoPlaying = (r.load[f.id] || 0) > 0;
    const freeDrummer = present.some(
      (s) => s.roles.includes(f.role) && !(r.load[s.id] > 0) && s.id !== f.id
    );
    if (alsoPlaying) assert.ok(!freeDrummer, `${f.name} נבחר למרות שיש נגן פנוי`);
  });
});

test("אף אחד לא חורג מהמכסה בגלל ההשלמה", () => {
  const roster = ROSTERS["ט׳"];
  const r = bestDraw([...roster, TEACHER], recK("ט׳"), EMPTY);
  const victim = r.groups.flat().find((m) => m.playing === "תופים" && !m.teacher);
  const present = roster.filter((s) => s.id !== victim.id);
  const pool = [...present, TEACHER];
  const k = r.groups.length;
  const fixed = repairDraw(removeFromDraw(r, victim.id), pool, EMPTY);
  Object.entries(fixed.load).forEach(([id, n]) =>
    assert.ok(overloadOk(pool, k, id, n), `${id} מנגן ב-${n} הרכבים בלי הצדקה`)
  );
});

test("כשבאמת אין מי שימלא — נאמר במפורש ולא מעמידים פנים", () => {
  const roster = ROSTERS["ט׳"];
  const drummers = roster.filter((s) => s.roles.includes("drums"));
  const r = bestDraw([...roster, TEACHER], 2, EMPTY);
  // כל המתופפים הולכים הביתה
  const present = roster.filter((s) => !drummers.some((d) => d.id === s.id));
  let stripped = r;
  for (const d of drummers) stripped = removeFromDraw(stripped, d.id);
  const fixed = repairDraw(stripped, [...present, TEACHER], EMPTY);
  assert.ok(fixed.unfixable.length > 0, "לא דווח שאי אפשר להשלים");
  fixed.unfixable.forEach((u) => assert.ok(u.missing.includes("drums")));
});

/* ==================== החלפה ידנית בין הרכבים ==================== */

const findIn = (res, g, pred) => res.groups[g].find(pred);
const ids = (g) => g.map((m) => m.id + ":" + m.playing);
const missingIn = (g) =>
  ["drums", "bass", "harmony"].filter((r) => !g.some((m) => ROLE_OF[m.playing] === r));

test("החלפה תקינה מזיזה בדיוק שני נגנים ולא נוגעת בשאר", () => {
  const roster = ROSTERS["י״א"];
  const r = bestDraw([...roster, TEACHER], recK("י״א"), EMPTY);
  // לא כל זוג ניתן להחלפה — גיטריסט מסומן melody אבל הכלי שלו ייחודי,
  // ולכן ייתכן שאין לו כיסא ביעד. סורקים את כל הזוגות עד שנמצאת החלפה מותרת.
  let A, B, gi, gj, out;
  outer: for (let i = 0; i < r.groups.length; i++)
    for (let j = i + 1; j < r.groups.length; j++)
      for (const x of r.groups[i])
        for (const y of r.groups[j]) {
          const t = swapPlayers(r, { g: i, id: x.id }, { g: j, id: y.id });
          if (t.error) continue;
          (A = x), (B = y), (gi = i), (gj = j), (out = t);
          break outer;
        }
  assert.ok(out, "לא נמצאה אף החלפה מותרת בכל החלוקה");

  assert.ok(out.groups[gi].some((m) => m.id === B.id), "B לא הגיע להרכב של A");
  assert.ok(out.groups[gj].some((m) => m.id === A.id), "A לא הגיע להרכב של B");
  assert.ok(!out.groups[gi].some((m) => m.id === A.id));
  assert.ok(!out.groups[gj].some((m) => m.id === B.id));

  // כל שאר ההרכבים זהים בייט-בייט
  r.groups.forEach((g, i) => {
    if (i === gi || i === gj) return;
    assert.deepEqual(ids(out.groups[i]), ids(g), `הרכב ${i + 1} השתנה`);
  });
  // ומי שלא הוחלף נשאר במקומו גם בשני ההרכבים שנגעו בהם
  [gi, gj].forEach((i) => {
    const keep = (arr) => arr.filter((m) => m.id !== A.id && m.id !== B.id).map((m) => m.id).sort();
    assert.deepEqual(keep(out.groups[i]), keep(r.groups[i]), `הרכב ${i + 1} השתנה מעבר להחלפה`);
  });
});

test("הכלל נשמר: החלפה ששוברת ריתמיקה נדחית עם סיבה", () => {
  // חלוקה בנויה ביד, כדי לבודד בדיוק את המקרה: הבסיסט של הרכב 1 מנגן גם
  // פסנתר, ולכן יש לו כיסא פנוי בהרכב 2 — אבל הרכב 1 יישאר בלי בס.
  const seat = (id, inst, slot, insts) => ({ id, name: id, instruments: insts || [inst], playing: inst, slot });
  const res = {
    groups: [
      [seat("d1", "תופים", "drums"), seat("x", "בס", "bass", ["בס", "פסנתר"]), seat("g1", "גיטרה", "harmony")],
      [seat("d2", "תופים", "drums"), seat("b2", "בס", "bass"), seat("g2", "גיטרה", "harmony"), seat("m2", "חליל", "melody")],
    ],
    load: { d1: 1, x: 1, g1: 1, d2: 1, b2: 1, g2: 1, m2: 1 },
    bench: [],
  };
  const out = swapPlayers(res, { g: 0, id: "x" }, { g: 1, id: "m2" });
  assert.ok(out.error, "החלפה ששוברת את הכלל התקבלה");
  assert.match(out.error, /הרכב 1 יישאר בלי בס/);
});

test("החלפת שני מתופפים בין הרכבים מותרת", () => {
  const roster = ROSTERS["י״א"];
  const r = bestDraw([...roster, TEACHER], recK("י״א"), EMPTY);
  const d0 = findIn(r, 0, (m) => m.playing === "תופים");
  const d1 = findIn(r, 1, (m) => m.playing === "תופים");
  const out = swapPlayers(r, { g: 0, id: d0.id }, { g: 1, id: d1.id });
  if (d0.id === d1.id) return; // אותו מתופף ×2 — לא רלוונטי
  assert.ok(!out.error, out.error);
  out.groups.forEach((g) =>
    ["drums", "bass", "harmony"].forEach((role) =>
      assert.ok(g.some((m) => ROLE_OF[m.playing] === role), "נשבר תפקיד")
    )
  );
});

test("תלמיד שמנגן בשני הרכבים לא מתחלף עם עצמו (רגרסיה)", () => {
  const roster = ROSTERS["ט׳"];
  for (let t = 0; t < 30; t++) {
    const r = bestDraw([...roster, TEACHER], recK("ט׳"), EMPTY);
    const twice = r.groups.flat().find((m) => r.load[m.id] === 2 && !m.teacher);
    if (!twice) continue;
    const gs = r.groups.map((g, i) => (g.some((m) => m.id === twice.id) ? i : -1)).filter((i) => i >= 0);
    const out = swapPlayers(r, { g: gs[0], id: twice.id }, { g: gs[1], id: twice.id });
    assert.ok(out.error, "התקבלה החלפה של תלמיד עם עצמו");
    assert.match(out.error, /אותו תלמיד/);
    return;
  }
});

test("החלפה בתוך אותו הרכב נדחית", () => {
  const r = recDraw("ט׳");
  const [x, y] = r.groups[0];
  assert.match(swapPlayers(r, { g: 0, id: x.id }, { g: 0, id: y.id }).error, /באותו מקום/);
});

test("תלמיד לא מוחלף להרכב שהוא כבר מנגן בו", () => {
  const roster = ROSTERS["ט׳"];
  for (let t = 0; t < 30; t++) {
    const r = bestDraw([...roster, TEACHER], recK("ט׳"), EMPTY);
    const twice = r.groups.flat().find((m) => r.load[m.id] === 2 && !m.teacher);
    if (!twice) continue;
    const gs = r.groups.map((g, i) => (g.some((m) => m.id === twice.id) ? i : -1)).filter((i) => i >= 0);
    const other = r.groups[gs[1]].find((m) => m.id !== twice.id && !m.teacher);
    const out = swapPlayers(r, { g: gs[0], id: twice.id }, { g: gs[1], id: other.id });
    assert.ok(out.error, "התקבלה החלפה שמכניסה תלמיד פעמיים לאותו הרכב");
    return;
  }
});

test("החלפה מול הספסל מעבירה גם את העומס", () => {
  const roster = ROSTERS["י״א"];
  const r = bestDraw(roster, 2, EMPTY); // k=2 משאיר ספסל
  assert.ok(r.bench.length, "אין ספסל");
  const sitting = r.bench[0];
  // מחפשים בהרכב נגן מלודי עם אותו סוג כלי, כדי שההחלפה לא תשבור ריתמיקה
  let target = null, gi = -1;
  r.groups.forEach((g, i) => {
    const c = g.find((m) => m.slot === "melody" && !m.teacher);
    if (c && !target) (target = c), (gi = i);
  });
  const out = swapPlayers(r, { g: -1, id: sitting.id }, { g: gi, id: target.id });
  if (out.error) return; // לא כל צירוף אפשרי — הכלל קודם
  assert.equal(out.load[sitting.id], 1, "מי שנכנס לא קיבל עומס");
  assert.equal(out.load[target.id], undefined, "מי שיצא לספסל נשאר עם עומס");
  assert.ok(out.bench.some((s) => s.id === target.id), "מי שיצא לא הגיע לספסל");
  assert.ok(!out.bench.some((s) => s.id === sitting.id), "מי שנכנס נשאר בספסל");
});

test("סך הנגנים נשמר, וכל החלפה מותרת שומרת על ריתמיקה מלאה", () => {
  const roster = ROSTERS["י״א"];
  let checked = 0;
  for (let t = 0; t < 10; t++) {
    const r = bestDraw([...roster, TEACHER], recK("י״א"), EMPTY);
    // עוברים על כל זוגות ההחלפה האפשריים ובודקים כל אחת שהתקבלה
    for (let i = 0; i < r.groups.length; i++)
      for (let j = i + 1; j < r.groups.length; j++)
        for (const A of r.groups[i])
          for (const B of r.groups[j]) {
            const out = swapPlayers(r, { g: i, id: A.id }, { g: j, id: B.id });
            if (out.error) continue;
            checked++;
            assert.equal(out.groups.flat().length, r.groups.flat().length, "מספר הנגנים השתנה");
            out.groups.forEach((g, gi) =>
              assert.equal(missingIn(g).length, 0, `הרכב ${gi + 1} נשאר בלי תפקיד אחרי החלפה`)
            );
          }
  }
  assert.ok(checked > 50, `נבדקו רק ${checked} החלפות`);
});

/* ============================ יומן נוכחות ============================ */

const S = (...ids) => new Set(ids);

test("איחור = סומן חסר בחלוקה, ואז הוחזר", () => {
  const roster = ROSTERS["ט׳"];
  const [a, b, c, d] = roster.map((x) => x.id);
  // a חסר ונשאר חסר, b חסר והוחזר, c היה ויצא, d נוכח לכל אורך השיעור
  const out = attendanceOf(roster, S(a, b), S(a, c));
  const of = (id) => out.find((e) => e.id === id).status;
  assert.equal(of(a), "absent");
  assert.equal(of(b), "late");
  assert.equal(of(c), "left");
  assert.equal(of(d), "present");
});

test("ביומן נרשמות רק חריגות", () => {
  const roster = ROSTERS["ט׳"];
  const [a, b] = roster.map((x) => x.id);
  const rows = lessonAttendance(roster, S(a, b), S(a), 7, "2026-09-07");
  assert.equal(rows.length, 2, "נרשמו גם תלמידים שהיו נוכחים");
  assert.deepEqual(
    rows.map((e) => e.status).sort(),
    ["absent", "late"]
  );
  rows.forEach((e) => {
    assert.equal(e.lesson, 7);
    assert.equal(e.date, "2026-09-07");
  });
  // שיעור בלי חריגות לא מייצר שורות
  assert.equal(lessonAttendance(roster, S(), S(), 8, "2026-09-07").length, 0);
});

test("שמירה חוזרת של אותו שיעור מחליפה ולא מכפילה", () => {
  const roster = ROSTERS["ט׳"];
  const [a, b] = roster.map((x) => x.id);
  const first = lessonAttendance(roster, S(a, b), S(a, b), 3, "2026-09-07");
  let log = mergeAttendance([], 3, first);
  assert.equal(log.length, 2);

  // b הגיע באיחור, ושומרים שוב את אותו שיעור
  const second = lessonAttendance(roster, S(a, b), S(a), 3, "2026-09-07");
  log = mergeAttendance(log, 3, second);
  assert.equal(log.filter((e) => e.lesson === 3).length, 2, "נוצרו כפילויות");
  assert.equal(log.find((e) => e.id === b).status, "late", "האיחור לא עודכן");
  assert.equal(log.find((e) => e.id === a).status, "absent");
});

test("יומן של שיעורים אחרים לא נפגע", () => {
  const roster = ROSTERS["ט׳"];
  const [a] = roster.map((x) => x.id);
  const log = mergeAttendance(
    lessonAttendance(roster, S(a), S(a), 1, "2026-09-01"),
    2,
    lessonAttendance(roster, S(a), S(), 2, "2026-09-08")
  );
  assert.equal(log.length, 2);
  const again = mergeAttendance(log, 2, lessonAttendance(roster, S(), S(), 2, "2026-09-08"));
  assert.equal(again.length, 1, "שיעור 1 נמחק");
  assert.equal(again[0].lesson, 1);
});

test("שורות הגיליון הלוך ושוב", () => {
  const roster = ROSTERS["י״א"];
  const [a, b, c] = roster.map((x) => x.id);
  const log = mergeAttendance([], 4, lessonAttendance(roster, S(a, b), S(a, c), 4, "2026-09-07"));
  const rows = attToRows(log);
  assert.deepEqual(rows[0], ["תאריך", "שיעור", "תלמיד", "מזהה", "סטטוס"]);
  assert.equal(rows.length, log.length + 1);
  assert.ok(rows.slice(1).every((r) => r.length === 5));
  // התוויות בעברית, קריאות בגיליון
  const labels = rows.slice(1).map((r) => r[4]);
  labels.forEach((l) => assert.ok(["חיסור", "איחור", "יצא"].includes(l), l));

  const back = rowsToAtt(rows);
  const key = (e) => `${e.lesson}|${e.id}|${e.status}|${e.date}`;
  assert.deepEqual(back.map(key).sort(), log.map(key).sort());
});

test("יומן ריק וגיליון ריק לא מפילים", () => {
  assert.deepEqual(rowsToAtt([]), []);
  assert.deepEqual(rowsToAtt([["תאריך", "שיעור", "תלמיד", "מזהה", "סטטוס"]]), []);
  assert.equal(attToRows([]).length, 1);
});

test("שם הלשונית נגזר מהכיתה", () => {
  CLASSES.forEach((c) => assert.equal(ATT_TAB(c), `נוכחות ${c}`));
  assert.equal(new Set(CLASSES.map(ATT_TAB)).size, CLASSES.length, "שתי כיתות לאותה לשונית");
});

/* ================= כלי הרמוני שני: פסנתר וגיטרה ================= */

const HARM = ["פסנתר", "גיטרה"];
const harmIn = (g) => g.filter((mm) => HARM.includes(mm.playing)).map((mm) => mm.playing);

test("פסנתר וגיטרה יחד אכן קורה בחלוקה המומלצת (רגרסיה)", () => {
  // עד לשינוי הזה זה היה 0% — כל נגן הרמוני נדרש לכיסא האחד של הרכב אחר
  CLASSES.forEach((cls) => {
    let both = 0;
    const draws = 20;
    for (let i = 0; i < draws; i++)
      recDraw(cls).groups.forEach((g) => {
        if (harmIn(g).length > 1) both++;
      });
    assert.ok(both >= draws, `${cls}: רק ${both} הרכבים עם פסנתר וגיטרה ב-${draws} חלוקות`);
  });
});

test("לעולם לא יותר מ-MAX_GROUPS הרכבים", () => {
  // כיתה גדולה מלאכותית: בלי התקרה היא הייתה מגיעה ל-10 הרכבים
  const many = [];
  ["תופים", "בס", "פסנתר", "חליל"].forEach((inst) =>
    Array.from({ length: 10 }, (_, i) =>
      many.push({ id: inst + i, name: inst + i, instruments: [inst], roles: [ROLE_OF[inst] || "melody"] })
    )
  );
  assert.ok(Math.floor(many.length / 4) > MAX_GROUPS, "הכיתה המלאכותית קטנה מדי לבדיקה");
  const c = capacity(many);
  assert.ok(c.max <= MAX_GROUPS, `max=${c.max} חורג מ-${MAX_GROUPS}`);
  assert.ok(c.rec <= MAX_GROUPS, `rec=${c.rec} חורג מ-${MAX_GROUPS}`);
  CLASSES.forEach((cls) => assert.ok(capacity(poolOf(cls)).max <= MAX_GROUPS, cls));
});

test("ההעשרה לא מנפחת הרכב מעבר לתקרת הגודל", () => {
  CLASSES.forEach((cls) => {
    const pool = poolOf(cls);
    const k = recK(cls);
    for (let i = 0; i < 15; i++) {
      const raw = attempt(pool, k, EMPTY, 1)[0];
      if (!raw) continue;
      const rich = enrichHarmony(raw, pool, EMPTY);
      rich.groups.forEach((g, gi) =>
        assert.ok(g.length <= MAX_GROUP, `${cls}/${gi + 1}: ${g.length} נגנים, מעל התקרה ${MAX_GROUP}`)
      );
    }
  });
});

test("ההעשרה מאזנת גדלים ולא פותחת פער של יותר מנגן אחד", () => {
  CLASSES.forEach((cls) => {
    const pool = poolOf(cls);
    const k = recK(cls);
    let checked = 0;
    for (let i = 0; i < 20; i++) {
      const raw = attempt(pool, k, EMPTY, 1)[0];
      if (!raw || raw.bench.length) continue;
      const sz = (r) => r.groups.map((g) => g.length);
      const gap = (r) => Math.max(...sz(r)) - Math.min(...sz(r));
      const rich = enrichHarmony(raw, pool, EMPTY);
      /* ההעשרה מוסיפה כיסא אחד להרכב, ולכן היא יכולה ליצור פער של נגן
         אחד כשכל ההרכבים יצאו שווים. מה שהיא לא תעשה זה להגדיל פער קיים:
         היא הולכת להרכב הקטן ביותר קודם, ולעולם לא חורגת מ-MAX_GROUP. */
      assert.ok(
        gap(rich) <= Math.max(gap(raw), 1),
        `${cls}: הפער גדל מ-${gap(raw)} ל-${gap(rich)}`
      );
      rich.groups.forEach((g) => assert.ok(g.length <= MAX_GROUP, `${cls}: ${g.length} נגנים`));
      checked++;
    }
    assert.ok(checked > 5, `${cls}: נבדקו רק ${checked} חלוקות`);
  });
});

test("ההעשרה לא שוברת אף כלל", () => {
  CLASSES.forEach((cls) => {
    const pool = poolOf(cls);
    for (let i = 0; i < 15; i++) {
      const d = recDraw(cls);
      d.groups.forEach((g, gi) => {
        // ריתמיקה מלאה נשמרת
        assert.equal(missingIn(g).length, 0, `${cls}/${gi + 1}: חסר תפקיד`);
        // אין כלי ייחודי כפול, ואין תלמיד פעמיים באותו הרכב
        HARM.concat(["תופים", "בס"]).forEach((inst) =>
          assert.ok(g.filter((mm) => mm.playing === inst).length <= 1, `${cls}: שני ${inst}`)
        );
        const ids = g.map((mm) => mm.id);
        assert.equal(new Set(ids).size, ids.length, `${cls}: תלמיד פעמיים באותו הרכב`);
      });
      Object.entries(d.load).forEach(([id, n]) =>
        assert.ok(overloadOk(pool, recK(cls), id, n), `${cls}: ${id} מנגן ב-${n} הרכבים בלי הצדקה`)
      );
      // ההעשרה עצמה לעולם לא חורגת מהמכסה — היא רשות, לא חובה
      (d.enriched || []).forEach((e) =>
        assert.ok(d.load[e.id] <= MAX_LOAD, `${cls}: ההעשרה העלתה את ${e.name} ל-${d.load[e.id]}`)
      );
      // המורה נכנס להרכב אחד בלבד
      assert.ok((d.load["__teacher"] || 0) <= 1, `${cls}: המורה שובץ פעמיים`);
      assert.ok(pool.length > 0);
    }
  });
});

test("אין העשרה כשמישהו יושב על הספסל", () => {
  // כשיש ספסל, לתת לאחד לנגן פעמיים זה בדיוק הקיפוח שהפנקס נועד למנוע
  const pool = poolOf("י״א");
  let checked = 0;
  for (let i = 0; i < 25; i++) {
    const d = bestDraw(pool, 2, EMPTY); // k נמוך משאיר ספסל
    if (!d || !d.bench.length) continue;
    assert.ok(!d.enriched, "הועשר למרות שמישהו יושב על הספסל");
    checked++;
  }
  assert.ok(checked > 5, `נבדקו רק ${checked} חלוקות עם ספסל`);
});

test("ההעשרה מצרפת להרכב הקטן לפני הגדול", () => {
  const roster = ROSTERS["י״א"];
  const seat = (id, inst, slot) => ({ id, name: id, instruments: [inst], roles: [ROLE_OF[inst] || "melody"], playing: inst, slot });
  const base = (n) => [seat("d" + n, "תופים", "drums"), seat("b" + n, "בס", "bass"), seat("g" + n, "גיטרה", "harmony")];
  const res = {
    groups: [[...base(1), seat("x1", "חליל", "melody"), seat("x2", "אלט", "melody")], base(2)],
    load: { d1: 1, b1: 1, g1: 1, x1: 1, x2: 1, d2: 1, b2: 1, g2: 1 },
    bench: [],
  };
  // פסנתרן יחיד פנוי — חייב ללכת להרכב 2, הקטן מבין השניים
  const pianist = roster.find((s) => s.instruments.includes("פסנתר"));
  const out = enrichHarmony(res, [pianist], EMPTY);
  assert.ok(out.enriched.length, "לא הייתה העשרה כלל");
  assert.equal(out.enriched[0].group, 1, "ההעשרה הראשונה הלכה להרכב הגדול");
  assert.deepEqual(harmIn(out.groups[1]).sort(), ["גיטרה", "פסנתר"].sort());
});

test("ההעשרה מעדיפה את מי שצבר הכי פחות בפנקס", () => {
  const seat = (id, inst, slot) => ({ id, name: id, instruments: [inst], roles: [ROLE_OF[inst] || "melody"], playing: inst, slot });
  const res = {
    groups: [[seat("d", "תופים", "drums"), seat("b", "בס", "bass"), seat("g", "גיטרה", "harmony")]],
    load: { d: 1, b: 1, g: 1, rich: 1, poor: 1 },
    bench: [],
  };
  const cand = (id) => ({ id, name: id, instruments: ["פסנתר"], roles: ["harmony"] });
  const ledger = { plays: { rich: 20, poor: 1 }, pairs: {}, lessons: 10 };
  const out = enrichHarmony(res, [cand("rich"), cand("poor")], ledger);
  assert.equal(out.enriched[0].id, "poor", "נבחר מי שכבר צבר הרבה");
});

test("capacity לא מושפעת מההעשרה", () => {
  // ההעשרה רצה אחרי בחירת החלוקה בדיוק כדי שלא תצמצם את מספר ההרכבים
  CLASSES.forEach((cls) => {
    const pool = poolOf(cls);
    const recs = new Set();
    for (let i = 0; i < 10; i++) recs.add(capacity(pool).rec);
    assert.equal(recs.size, 1, `${cls}: ההמלצה לא יציבה`);
    assert.ok(bestDraw(pool, [...recs][0], EMPTY), `${cls}: אי אפשר לחלק לפי ההמלצה`);
  });
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

test("נגן יחיד בתפקיד חיוני מנגן בכל ההרכבים (רגרסיה)", () => {
  /* הדרישה לריתמיקה מלאה גוברת על MAX_LOAD: בסיסט או מתופף יחיד בכיתה
     ינגן בכל ההרכבים, כי אחרת חלקם יישארו בלי התפקיד. עד לשינוי הזה
     התקרה הייתה 2 הרכבים בלבד. */
  const one = ROSTERS["י״א"].filter(
    (s) => !["נועם-בנימיני", "איתן-יעקובסון"].includes(s.id)
  );
  const drummer = one.find((s) => s.roles.includes("drums"));
  const { rec } = capacity(one);
  assert.ok(rec > MAX_LOAD, `rec=${rec} — המתופף היחיד לא כיסה יותר מ-${MAX_LOAD} הרכבים`);
  const d = bestDraw(one, rec, EMPTY);
  assert.ok(d, "לא נוצרה חלוקה");
  d.groups.forEach((g, i) =>
    assert.ok(g.some((mm) => ROLE_OF[mm.playing] === "drums"), `הרכב ${i + 1} נשאר בלי תופים`)
  );
  assert.equal(d.load[drummer.id], rec, "המתופף לא ניגן בכל ההרכבים");
});

test("ההמלצה היא הכי מעט הרכבים שבהם אף אחד לא יושב ואין חריגת גודל", () => {
  /* זה כל הכלל. קודם היו כאן שלושה קבועים (PREFERRED_GROUPS, PREFER_SLACK)
     ופונקציה נפרדת (preferredK) שקבעו ידנית 4 לי״א — הכלל מחזיר את אותו
     מספר, בלי להכיר את הכיתה. */
  each((cls, teacher) => {
    const pool = poolOf(cls, teacher);
    const { rec, options: opts } = capacity(pool);
    const fit = opts.filter((o) => o.fits);
    if (!fit.length) return; // אין מספר שעומד בתנאי — נבדק בבדיקה הבאה
    assert.equal(rec, Math.min(...fit.map((o) => o.k)), `${cls} teacher=${teacher}: לא הכי מעט`);
    opts
      .filter((o) => o.k < rec)
      .forEach((o) =>
        assert.ok(!o.fits, `${cls}: k=${o.k} היה מתאים אבל ההמלצה הייתה ${rec}`)
      );
  });
});

test("ההמלצה בפועל לא מושיבה איש ולא חורגת מהגודל", () => {
  each((cls, teacher) => {
    const pool = poolOf(cls, teacher);
    const { rec } = capacity(pool);
    for (let i = 0; i < 12; i++) {
      const d = bestDraw(pool, rec, EMPTY);
      assert.ok(d, `${cls}: אי אפשר לחלק ל-${rec}`);
      assert.equal(d.bench.length, 0, `${cls}: ${d.bench.length} תלמידים על הספסל`);
      d.groups.forEach((g, gi) =>
        assert.ok(g.length <= MAX_GROUP, `${cls}/${gi + 1}: ${g.length} נגנים`)
      );
    }
  });
});

test("הטבלה מתארת נכון את מה שהחלוקה באמת מייצרת", () => {
  /* המורה בוחר מספר לפי הטבלה. אם היא לא מתארת את המציאות, הבחירה שלו
     נשענת על מספרים מומצאים. */
  CLASSES.forEach((cls) => {
    const pool = poolOf(cls);
    capacity(pool).options.forEach((o) => {
      assert.ok(o.k >= 1 && o.k <= MAX_GROUPS, `${cls}: k=${o.k} מחוץ לטווח`);
      assert.equal(o.fits, !o.bench && o.biggest <= MAX_GROUP, `${cls}/k=${o.k}: fits לא עקבי`);
      assert.ok(o.smallest <= o.biggest, `${cls}/k=${o.k}: קטן גדול מגדול`);
      const d = bestDraw(pool, o.k, EMPTY);
      assert.ok(d, `${cls}: הטבלה הציעה k=${o.k} שאי אפשר לחלק אליו`);
      assert.equal(d.groups.length, o.k, `${cls}: יצאו ${d.groups.length} הרכבים במקום ${o.k}`);
    });
  });
});

test("הטבלה לא מציעה הרכב קטן מארבעה נגנים", () => {
  /* MIN_GROUP נגזר מארבעת התפקידים החיוניים: פחות מזה אינו הרכב. */
  assert.equal(MIN_GROUP, REQUIRED.length);
  CLASSES.forEach((cls) => {
    const pool = poolOf(cls);
    assert.ok(
      capacity(pool).max <= Math.floor(pool.length / MIN_GROUP),
      `${cls}: המקסימום מאפשר הרכבים קטנים מ-${MIN_GROUP}`
    );
  });
});

test("ההמלצה מכבדת את גודל ההרכב כשאפשר, ואחרת בוחרת את הטוב ביותר", () => {
  const biggest = (pool, k) => {
    const all = attempt(pool, k, EMPTY, 40);
    return all.length ? Math.min(...all.map((r) => Math.max(...r.groups.map((g) => g.length)))) : Infinity;
  };
  each((cls, teacher) => {
    const pool = poolOf(cls, teacher);
    const { max, rec } = capacity(pool);
    if (biggest(pool, rec) <= MAX_GROUP) return; // ההמלצה עומדת בגודל — הכול טוב

    // אחרת: מותר רק אם אף k אחר לא היה עומד בו. אחרת נבחרה המלצה גרועה מהצורך.
    for (let k = 1; k <= max; k++)
      assert.ok(
        biggest(pool, k) > MAX_GROUP,
        `${cls}: k=${k} היה נותן הרכבים עד ${MAX_GROUP}, אבל ההמלצה הייתה ${rec}`
      );
  });
});

/* ============================ תפקיד ריק ============================ */

test("תפקיד חיוני חוסם רק כשאין בו אף נגן", () => {
  const oneDrummer = ROSTERS["י״א"].filter(
    (s) => !["נועם-בנימיני", "איתן-יעקובסון"].includes(s.id)
  );
  assert.deepEqual(emptyRoles(oneDrummer), [], "מתופף אחד אינו חוסם — הוא מכסה כמה הרכבים שצריך");
  assert.ok(capacity(oneDrummer).max > 1);

  const noDrums = ROSTERS["י״א"].filter((s) => !s.roles.includes("drums"));
  assert.deepEqual(emptyRoles(noDrums), ["drums"]);
  assert.equal(bestDraw(noDrums, 1, EMPTY), null, "נוצרה חלוקה בלי מתופף");

  const noMelody = ROSTERS["י״א"].filter((s) => !s.roles.includes("melody"));
  assert.deepEqual(emptyRoles(noMelody), ["melody"]);
  assert.equal(bestDraw(noMelody, 1, EMPTY), null, "נוצרה חלוקה בלי כלי מלודי");
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
    const { ledger: back, dropped, added } = decodeLedger(cls, ROSTERS[cls], encodeLedger(cls, ROSTERS[cls], ledger));
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
  const text = JSON.parse(encodeLedger(cls, ROSTERS[cls], ledger));
  // מדמים גיבוי שנוצר לפני שנוסף תלמיד בראש הרשימה
  text.s = text.s.slice(1);
  text.p = text.p.slice(1);
  const { ledger: back, added } = decodeLedger(cls, ROSTERS[cls], JSON.stringify(text));
  ids.slice(1).forEach((id) => assert.equal(back.plays[id], ledger.plays[id], `${id} זז`));
  assert.equal(added, 1, "התלמיד החדש לא דווח");
});

test("תלמיד שהוסר מדווח ולא משנה נתונים בשקט", () => {
  const cls = "ט׳";
  const { ledger } = sampleLedger(cls);
  const text = JSON.parse(encodeLedger(cls, ROSTERS[cls], ledger));
  text.s = ["רוח-רפאים", ...text.s.slice(1)];
  const { dropped } = decodeLedger(cls, ROSTERS[cls], JSON.stringify(text));
  assert.equal(dropped, 1);
});

test("גיבוי בפורמט הישן (v1) עדיין נקרא", () => {
  const cls = "ט׳";
  const { ids, ledger } = sampleLedger(cls);
  const v2 = JSON.parse(encodeLedger(cls, ROSTERS[cls], ledger));
  const v1 = JSON.stringify({ v: 1, c: v2.c, l: v2.l, p: v2.p, x: v2.x }); // בלי s
  const { ledger: back } = decodeLedger(cls, ROSTERS[cls], v1);
  ids.forEach((id) => assert.equal(back.plays[id], ledger.plays[id]));
  assert.deepEqual(back.pairs, ledger.pairs);
});

test("גיבוי של כיתה אחרת נדחה", () => {
  const { ledger } = sampleLedger("ט׳");
  assert.throws(() => decodeLedger("י״א", ROSTERS["י״א"], encodeLedger("ט׳", ROSTERS["ט׳"], ledger)), /שייך לכיתה/);
});

/* ============================ הגיליון ============================ */

test("כתיבה וקריאה של הגיליון שומרות על הכול", () => {
  for (const cls of CLASSES) {
    const { ids, ledger } = sampleLedger(cls);
    const back = rowsToLedger(ROSTERS[cls], ledgerToRows(ROSTERS[cls], ledger));
    ids.forEach((id) => assert.equal(back.plays[id], ledger.plays[id]));
    assert.deepEqual(back.pairs, ledger.pairs);
    assert.equal(back.lessons, 4);
  }
});

test("הגיליון נושא עמודת מזהה", () => {
  const cls = "ט׳";
  const rows = ledgerToRows(ROSTERS[cls], sampleLedger(cls).ledger);
  assert.equal(rows[1][2], "מזהה");
  assert.equal(rows[2][2], ROSTERS[cls][0].id);
});

test("גיליון ישן בלי עמודת מזהה עדיין נקרא לפי שם", () => {
  const cls = "ט׳";
  const { ids, ledger } = sampleLedger(cls);
  const old = ledgerToRows(ROSTERS[cls], ledger).map((r, i) => (i < 2 ? r : [r[0], r[1], "", ""]));
  const back = rowsToLedger(ROSTERS[cls], old);
  ids.forEach((id) => assert.equal(back.plays[id], ledger.plays[id]));
  assert.deepEqual(back.pairs, ledger.pairs);
});

test("שינוי שם תלמיד לא מאבד היסטוריה בגיליון ישן (רגרסיה)", () => {
  const cls = "ט׳";
  // גיליון שנכתב לפני עמודת המזהה, ועדיין נושא את השמות הקודמים
  const rows = [
    ["שיעורים", 5, "צירופים", ""],
    ["תלמיד", "הרכבים", "", ""],
    ["סמואל", 7, "", ""],
    ["דניאל", 4, "", ""],
  ];
  const back = rowsToLedger(ROSTERS[cls], rows);
  assert.equal(back.plays["סמואל-כהן אוריה"], 7, "ההיסטוריה של אוריה אבדה");
  assert.equal(back.plays["דניאל-סלומון"], 4, "ההיסטוריה של דני אבדה");
});

test("כל שם קודם מצביע על מזהה שקיים באחת הכיתות", () => {
  const all = new Set(CLASSES.flatMap((c) => ROSTERS[c].map((s) => s.id)));
  Object.entries(FORMER_NAMES).forEach(([name, id]) =>
    assert.ok(all.has(id), `${name} מצביע על מזהה שאינו קיים: ${id}`)
  );
});

test("שם קודם לא גובר על שם קיים", () => {
  // אם שם קודם מתנגש בשם של תלמיד אחר בכיתה, השם הקיים מנצח
  CLASSES.forEach((cls) => {
    const live = new Set(ROSTERS[cls].map((s) => s.name));
    Object.keys(FORMER_NAMES).forEach((name) => {
      if (!live.has(name)) return;
      const rows = [
        ["שיעורים", 1, "צירופים", ""],
        ["תלמיד", "הרכבים", "", ""],
        [name, 9, "", ""],
      ];
      const owner = ROSTERS[cls].find((s) => s.name === name);
      assert.equal(rowsToLedger(ROSTERS[cls], rows).plays[owner.id], 9, `${name} שויך לתלמיד הלא נכון`);
    });
  });
});

test("שורה בגיליון שאין לה מקבילה ברשימה לא מזייפת צירופים", () => {
  const cls = "ט׳";
  const { ids, ledger } = sampleLedger(cls);
  const rows = ledgerToRows(ROSTERS[cls], ledger);
  rows[2] = ["מישהו אחר", 99, "לא-קיים", ""]; // התלמיד הראשון הוחלף
  const back = rowsToLedger(ROSTERS[cls], rows);
  assert.equal(back.plays["לא-קיים"], undefined);
  assert.equal(back.pairs[pairKey(ids[0], ids[3])], undefined, "צירוף שויך לתלמיד הלא נכון");
  assert.equal(back.pairs[pairKey(ids[1], ids[2])], 2, "צירוף תקין נפגע");
});

test("שם שהשתנה בגיליון לא מאבד היסטוריה — המזהה מנצח (רגרסיה)", () => {
  const cls = "ט׳";
  const { ids, ledger } = sampleLedger(cls);
  const rows = ledgerToRows(ROSTERS[cls], ledger);
  // שם התצוגה של תלמיד משתנה מעצמו ברגע שנוסף עוד תלמיד עם אותו שם פרטי,
  // ואז השורה בגיליון כבר לא תואמת בשם. עמודת המזהה היא שמצילה אותה.
  const i = rows.findIndex((r) => r[2] === ids[3]);
  rows[i] = ["שם ישן שלא קיים ברשימה", rows[i][1], ids[3], ""];
  const back = rowsToLedger(ROSTERS[cls], rows);
  assert.equal(back.plays[ids[3]], ledger.plays[ids[3]], "ההיסטוריה אבדה");
  assert.equal(back.pairs[pairKey(ids[0], ids[3])], 7, "הצירוף אבד");
});

test("לשונית ריקה מחזירה פנקס ריק", () => {
  assert.deepEqual(rowsToLedger(ROSTERS["ט׳"], []), EMPTY);
});

/* ==================== הרשימה כנתון (גיליון ועריכה) ==================== */

test("הרשימה עוברת לגיליון וחוזרת בלי לאבד דבר", () => {
  CLASSES.forEach((cls) => {
    const back = rowsToRoster(rosterToRows(SEED[cls]));
    assert.equal(back.length, SEED[cls].length, cls);
    SEED[cls].forEach(([first, last, inst, id, backup = []], i) => {
      assert.deepEqual(back[i], [first, last, inst, id, backup], `${cls}: ${first}`);
    });
  });
});

test("רשימה שחזרה מהגיליון בונה בדיוק את אותם תלמידים", () => {
  CLASSES.forEach((cls) => {
    const built = buildRoster(rowsToRoster(rosterToRows(SEED[cls])));
    assert.deepEqual(
      built.map((s) => [s.id, s.name, s.instruments, s.backup]),
      ROSTERS[cls].map((s) => [s.id, s.name, s.instruments, s.backup]),
      cls
    );
  });
});

test("שורות ריקות ורווחים בגיליון לא יוצרים תלמידי רפאים", () => {
  const rows = [
    ["שם פרטי", "שם משפחה", "כלי", "כלי משני", "מזהה"],
    ["  דנה ", " לוי ", " חליל ", "", " דנה-לוי "],
    ["", "", "", "", ""],
    [],
    ["רן", "", "תופים, פסנתר", "בס", "רן"],
  ];
  const list = rowsToRoster(rows);
  assert.equal(list.length, 2, "שורות ריקות נספרו כתלמידים");
  assert.deepEqual(list[0], ["דנה", "לוי", ["חליל"], "דנה-לוי", []]);
  assert.deepEqual(list[1], ["רן", "", ["תופים", "פסנתר"], "רן", ["בס"]]);
});

test("מזהה חדש ייחודי, וגם כששני תלמידים באותו שם", () => {
  const list = [...SEED["ט׳"]];
  const id = makeId("אילה", "אוריין", SEED["י״א"]);
  assert.equal(id, "אילה-אוריין", "מזהה פנוי שונה שלא לצורך");
  const dup = makeId("אילה", "אוריין", [...list, ["אילה", "אוריין", ["חליל"], "אילה-אוריין"]]);
  assert.notEqual(dup, "אילה-אוריין");
  assert.ok(!list.some((r) => r[3] === dup));
  assert.equal(makeId("רן", "", []), "רן", "שם משפחה ריק השאיר מקף");
});

test("מזהה של תלמיד קיים לא משתנה כששמו משתנה", () => {
  /* המזהה הוא כל ההיסטוריה. עריכת שם היא פעולה נפרדת מיצירת מזהה,
     ולכן makeId לא נקרא בה — הבדיקה מוודאת שהצורה תומכת בזה. */
  const [, last, inst, id] = SEED["ט׳"][0];
  const renamed = ["שם חדש", last, inst, id];
  const built = buildRoster([renamed]);
  assert.equal(built[0].id, id, "שינוי שם שינה את המזהה");
  assert.equal(built[0].name, "שם חדש");
});

test("בעיות ברשימה מדווחות כולן יחד, ולא אחת בכל פעם", () => {
  const bad = [
    ["", "כהן", ["חליל"], "ריק"],
    ["דנה", "לוי", [], "דנה-לוי"],
    ["רן", "כהן", ["תופים"], "כפול"],
    ["שי", "מור", ["בס"], "כפול"],
    ["גל", "בר", ["פסנתר"], "גל-בר", ["פסנתר"]],
  ];
  const out = rosterProblems(bad);
  assert.ok(out.some((m) => m.includes("אין שם פרטי")), out.join(" | "));
  assert.ok(out.some((m) => m.includes("אין כלי")), out.join(" | "));
  assert.ok(out.some((m) => m.includes("מזהה כפול")), out.join(" | "));
  assert.ok(out.some((m) => m.includes("גם כראשי וגם כמשני")), out.join(" | "));
  assert.ok(out.length >= 4, "לא כל הבעיות דווחו יחד");
});

test("כיתה שחסר בה תפקיד חיוני מדווחת בעריכה, לא בשיעור", () => {
  const noDrums = SEED["ט׳"].filter((r) => !r[2].includes("תופים"));
  const out = rosterProblems(noDrums);
  assert.ok(out.some((m) => m.includes("מתופפים")), out.join(" | "));
  assert.deepEqual(rosterProblems(SEED["ט׳"]), [], "כיתה תקינה דווחה כבעייתית");
  assert.deepEqual(rosterProblems(SEED["י״א"]), []);
});

test("כלי שאינו ברשימת הכלים המוכרים עדיין עובד, כמלודי", () => {
  /* מורה שמוסיף קלרינט לא אמור להיתקע. כלי לא מוכר נחשב מלודי ולא ייחודי,
     ולכן הוא משתלב בלי שינוי קוד. */
  const list = [
    ...SEED["ט׳"].filter((r) => r[2][0] !== "חליל"),
    ["נועה", "קלר", ["קלרינט"], "נועה-קלר"],
  ];
  assert.ok(!INSTRUMENTS.includes("קלרינט"));
  assert.deepEqual(rosterProblems(list), []);
  const roster = buildRoster(list);
  const added = roster.find((s) => s.id === "נועה-קלר");
  assert.deepEqual(added.roles, ["melody"]);
  const d = bestDraw([...roster, TEACHER], capacity([...roster, TEACHER]).rec, EMPTY);
  assert.ok(d, "כיתה עם כלי לא מוכר לא התחלקה");
});

test("הפנקס עובד מול רשימה שנערכה, ולא מול רשימה קבועה", () => {
  /* זה מה שמאפשר לרשום כיתה חדשה: הפונקציות מקבלות את הרשימה כפרמטר
     במקום לחפש אותה בטבלה סטטית. */
  const edited = buildRoster([
    ...SEED["ט׳"],
    ["חדשה", "חדשה", ["חצוצרה"], "חדשה-חדשה"],
  ]);
  const ledger = { plays: { "חדשה-חדשה": 3, "ניב-כנען": 5 }, pairs: {}, lessons: 2 };
  const back = rowsToLedger(edited, ledgerToRows(edited, ledger));
  assert.equal(back.plays["חדשה-חדשה"], 3, "תלמיד חדש לא נשמר בגיליון");
  assert.equal(back.plays["ניב-כנען"], 5);
  assert.equal(back.lessons, 2);
  const { ledger: restored } = decodeLedger("ט׳", edited, encodeLedger("ט׳", edited, ledger));
  assert.equal(restored.plays["חדשה-חדשה"], 3, "תלמיד חדש לא שרד גיבוי");
});

test("assignIds משלים רק למי שחסר, ולא נוגע במזהה קיים", () => {
  const list = [
    ["דנה", "לוי", ["חליל"], "מזהה-ותיק"],
    ["גל", "בר", ["פסנתר"], "גל-בר"],
    ["רן", "כהן", ["תופים"], ""],
    ["רן", "כהן", ["בס"], ""],
  ];
  const out = assignIds(list);
  assert.equal(out[0][3], "מזהה-ותיק", "מזהה קיים שונה — היסטוריה נמחקה");
  assert.ok(out[2][3] && out[3][3], "לא הושלם מזהה");
  assert.notEqual(out[2][3], out[3][3], "שני תלמידים בשם זהה קיבלו אותו מזהה");
  assert.deepEqual(rosterProblems(out), [], rosterProblems(out).join(" | "));
});

test("תלמיד חדש בעריכה אינו נחשב שגוי לפני שנשמר (רגרסיה)", () => {
  /* העורך אימת את הטיוטה לפני השלמת המזהה, ולכן כל תלמיד שנוסף דווח
     כ"אין מזהה" וכפתור השמירה נשאר נעול — אי אפשר היה להוסיף תלמיד בכלל. */
  const draft = [...SEED["ט׳"], ["נועה", "קלר", ["קלרינט"], "", []]];
  assert.ok(rosterProblems(draft).some((m) => m.includes("אין מזהה")), "הטיוטה הגולמית תקינה?");
  assert.deepEqual(rosterProblems(assignIds(draft)), [], "תלמיד חדש עדיין חוסם שמירה");
});

/* ==================== סיכום לציונים ==================== */

const sumOf = (roster, log, ledger) =>
  Object.fromEntries(attendanceSummary(roster, log, ledger).map((e) => [e.id, e]));

test("הסיכום סופר חיסורים, איחורים ויציאות לכל תלמיד", () => {
  const roster = ROSTERS["ט׳"];
  const [a, b] = roster;
  const log = [
    { date: "1", lesson: 1, id: a.id, name: a.name, status: "absent" },
    { date: "2", lesson: 2, id: a.id, name: a.name, status: "absent" },
    { date: "2", lesson: 2, id: a.id, name: a.name, status: "late" },
    { date: "3", lesson: 3, id: b.id, name: b.name, status: "left" },
  ];
  const ledger = { plays: { [a.id]: 4 }, pairs: {}, lessons: 10 };
  const sum = sumOf(roster, log, ledger);
  assert.equal(sum[a.id].absent, 2);
  assert.equal(sum[a.id].late, 1);
  assert.equal(sum[a.id].plays, 4);
  assert.equal(sum[b.id].left, 1);
  assert.equal(sum[b.id].absent, 0);
});

test("הנוכחות מחושבת בחיסור, כי ביומן יש רק חריגות", () => {
  const roster = ROSTERS["ט׳"];
  const s0 = roster[0];
  const ledger = { plays: {}, pairs: {}, lessons: 20 };
  const log = Array.from({ length: 5 }, (_, i) => ({
    date: "d", lesson: i + 1, id: s0.id, name: s0.name, status: "absent",
  }));
  const sum = sumOf(roster, log, ledger);
  assert.equal(sum[s0.id].present, 15);
  assert.equal(sum[s0.id].rate, 75);
  // מי שלא נרשם ביומן כלל היה נוכח בכל השיעורים
  assert.equal(sum[roster[1].id].present, 20);
  assert.equal(sum[roster[1].id].rate, 100);
});

test("בלי שיעורים שמורים אין אחוז נוכחות, ולא 100% מומצא", () => {
  const sum = sumOf(ROSTERS["ט׳"], [], EMPTY);
  Object.values(sum).forEach((e) => {
    assert.equal(e.rate, null, `${e.name}: הומצא אחוז`);
    assert.equal(e.present, 0);
  });
});

test("הסיכום נבנה מהיומן שחוזר מהגיליון, לא רק מהיומן שבזיכרון", () => {
  const roster = ROSTERS["י״א"];
  const s0 = roster[0];
  const log = [{ date: "2026-09-07", lesson: 3, id: s0.id, name: s0.name, status: "late" }];
  const back = rowsToAtt(attToRows(log));
  const ledger = { plays: {}, pairs: {}, lessons: 3 };
  assert.equal(sumOf(roster, back, ledger)[s0.id].late, 1);
});

test("הסיכום מכסה את כל הכיתה, כולל מי שאין לו שום רישום", () => {
  CLASSES.forEach((cls) => {
    const out = attendanceSummary(ROSTERS[cls], [], { plays: {}, pairs: {}, lessons: 4 });
    assert.equal(out.length, ROSTERS[cls].length, cls);
    out.forEach((e) => assert.ok(e.name && e.id, `${cls}: רשומה בלי שם`));
  });
});

test("רישום של תלמיד שכבר לא ברשימה לא מופיע ולא מפיל", () => {
  const roster = ROSTERS["ט׳"];
  const log = [{ date: "1", lesson: 1, id: "מי-שעזב", name: "מי שעזב", status: "absent" }];
  const out = attendanceSummary(roster, log, { plays: {}, pairs: {}, lessons: 5 });
  assert.equal(out.length, roster.length);
  assert.ok(!out.some((e) => e.id === "מי-שעזב"));
});
