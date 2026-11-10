/* שינוי חלוקה קיימת: מי שהגיע או יצא באמצע השיעור, ועריכה ידנית.
   בלי React ובלי דפדפן — נבדק ישירות ב-`npm test`. */

import { ROLE_OF, UNIQUE, orderOf, MAX_LOAD, REQUIRED, MAX_GROUP, forRole, pairKey } from "./roster.js";
import { instFor, random } from "./draw.js";

const ROLE_MISSING = {
  drums: "תופים",
  bass: "בס",
  harmony: "כלי הרמוני",
  melody: "כלי מלודי",
};

/** אילו תפקידים חיוניים חסרים בהרכב. לפי הכלי שמנגנים בפועל, ולא לפי ה-slot,
    כי גיטריסט שנכנס כתוספת מסומן melody אבל עדיין ממלא תפקיד הרמוני. */
const missingRoles = (g) =>
  REQUIRED.filter((r) => !g.some((m) => (ROLE_OF[m.playing] || "melody") === r));

/**
 * מכניס תלמיד לחלוקה קיימת בלי לפרק אותה — בשביל מי שהגיע באמצע השיעור.
 *
 * שלושה מסלולים, לפי סדר:
 *
 * 1. **כיסא פנוי** בהרכב שאינו מלא. קודם הרכב שחסר בו תפקיד חיוני שהתלמיד
 *    ממלא, אחר כך ההרכב הקטן ביותר, ומי שהוא ניגן איתו הכי מעט.
 *
 * 2. **פינוי כיסא ממי שמנגן בכמה הרכבים.** פסנתרן שאיחר נתקל בכך שלכל
 *    ההרכבים כבר יש פסנתר — אבל חלק מהכיסאות האלה נתפסו בכפל דווקא מפני
 *    שהוא לא היה כאן. להחזיר לו כיסא כזה זה לא "לפרק את החלוקה", זה
 *    לבטל פתרון שנועד להיעדרותו: הוא מקבל לנגן, והמוכפל יורד להרכב אחד.
 *    בוחרים את מי שמנגן הכי הרבה, ומתוכם את ההרכב שהתלמיד ניגן איתו
 *    הכי מעט. ההרכב נבדק אחרי ההחלפה — הוא חייב להישאר עם כל התפקידים.
 *
 * 3. **כיסא פנוי גם במחיר חריגה מ-MAX_GROUP.** מוצא אחרון: עדיף הרכב של
 *    שמונה מאשר תלמיד שהגיע ויושב בחוץ. מדווח ב-`oversize`.
 *
 * מחזיר null רק כשבאמת אין שום מקום. `replaced` מציין שכיסא פונה.
 */
function addToDraw(res, student, ledger) {
  if (res.groups.some((g) => g.some((m) => m.id === student.id))) return null;
  const load = res.load || {};
  const byOrder = (a, b) => orderOf(a.playing) - orderOf(b.playing);
  const famWith = (members) =>
    members.reduce((a, m) => a + (ledger.pairs[pairKey(student.id, m.id)] || 0), 0);
  const seatOf = (inst) => ({ ...student, playing: inst, slot: ROLE_OF[inst] || "melody" });

  // 1 ו-3: כיסא פנוי. `room` מבדיל בין הרכב שיש בו מקום לבין חריגה מהגודל.
  const freeSeat = (room) => {
    let best = null;
    let bestInst = null;
    let bestScore = Infinity;
    res.groups.forEach((g, i) => {
      if (room !== g.length < MAX_GROUP) return;
      const fam = famWith(g);
      const gaps = missingRoles(g);
      student.instruments.forEach((inst, ord) => {
        if (UNIQUE.has(inst) && g.some((m) => m.playing === inst)) return;
        const fills = gaps.includes(ROLE_OF[inst] || "melody") ? -1000 : 0; // סותם חור אמיתי
        const same = g.filter((m) => m.playing === inst).length;
        const score = fills + g.length * 25 + same * 12 + fam * 6 + ord * 8;
        if (score < bestScore) (bestScore = score), (best = i), (bestInst = inst);
      });
    });
    return best === null ? null : { group: best, inst: bestInst };
  };

  const join = (pick, extra) => ({
    groups: res.groups.map((g, i) =>
      i === pick.group ? [...g, seatOf(pick.inst)].sort(byOrder) : g
    ),
    load: { ...load, [student.id]: (load[student.id] || 0) + 1 },
    bench: res.bench.filter((s) => s.id !== student.id),
    joined: pick.group,
    ...extra,
  });

  const room = freeSeat(true);
  if (room) return join(room);

  // 2. פינוי כיסא ממי שמנגן ביותר מהרכב אחד
  const swaps = [];
  res.groups.forEach((g, i) => {
    g.forEach((m) => {
      if (m.teacher || (load[m.id] || 0) < 2) return;
      const rest = g.filter((x) => x !== m);
      student.instruments.forEach((inst, ord) => {
        if (UNIQUE.has(inst) && rest.some((x) => x.playing === inst)) return;
        // ההרכב חייב להישאר שלם אחרי ההחלפה, לא רק לפניה
        if (missingRoles([...rest, seatOf(inst)]).length) return;
        swaps.push({ group: i, inst, ord, out: m, busy: load[m.id], fam: famWith(rest) });
      });
    });
  });
  if (swaps.length) {
    swaps.sort(
      (a, b) => b.busy - a.busy || a.fam - b.fam || a.ord - b.ord || random() - 0.5
    );
    const pick = swaps[0];
    const nextLoad = { ...load, [student.id]: (load[student.id] || 0) + 1 };
    nextLoad[pick.out.id] = pick.busy - 1;
    return {
      groups: res.groups.map((g, i) =>
        i === pick.group ? [...g.filter((x) => x !== pick.out), seatOf(pick.inst)].sort(byOrder) : g
      ),
      load: nextLoad,
      bench: res.bench.filter((s) => s.id !== student.id),
      joined: pick.group,
      replaced: {
        id: pick.out.id,
        name: pick.out.name,
        instrument: pick.out.playing,
        was: pick.busy,
        now: pick.busy - 1,
      },
    };
  }

  // 3. מוצא אחרון: הרכב חורג בנגן, ובלבד שמי שהגיע ינגן
  const over = freeSeat(false);
  return over ? join(over, { oversize: true }) : null;
}

/**
 * מוציא תלמיד מחלוקה קיימת — למי שהתברר שאינו כאן.
 * מדווח אילו הרכבים נשארו בלי תפקיד חיוני, כדי שהמורה ידע ולא יגלה תוך כדי נגינה.
 */
function removeFromDraw(res, id) {
  const groups = res.groups.map((g) => g.filter((m) => m.id !== id));
  const load = { ...res.load };
  delete load[id];
  const broken = [];
  groups.forEach((g, i) => {
    const missing = missingRoles(g);
    if (missing.length) broken.push({ group: i, missing });
  });
  // גם מהספסל: מי שאינו כאן לא "יושב בחוץ", ואסור שיוצע להחלפה
  return { groups, load, bench: res.bench.filter((s) => s.id !== id), broken };
}

/**
 * משלים תפקידים חיוניים שנפערו בחלוקה קיימת — בלי להזיז אף אחד ממקומו.
 * זה מה ששומר על הכלל "תופים, בס, כלי הרמוני וכלי מלודי בכל הרכב" גם כשמישהו יוצא
 * באמצע השיעור, במקום לפרק הכול ולחלק מחדש.
 *
 * מי שנכנס נבחר לפי אותם כללים כמו בחלוקה עצמה: קודם מי שעוד לא מנגן
 * היום (כולל מי שיושב על הספסל), אחר כך המורה, ואחר כך מי שצבר הכי פחות
 * הרכבים בפנקס. איש לא חורג מ-MAX_LOAD.
 *
 * `unfixable` מחזיר את מה שבאמת אי אפשר להשלים — למשל כשהמתופף היחיד
 * בכיתה הלך הביתה. שם הכלל לא ניתן לשמירה, וצריך לחלק מחדש.
 */
function repairDraw(res, pool, ledger) {
  const groups = res.groups.map((g) => [...g]);
  const load = { ...res.load };
  const filled = [];
  groups.forEach((g, i) => {
    for (const role of missingRoles(g)) {
      const able = forRole(pool, role);
      const fits = (s) =>
        able.includes(s) &&
        !g.some((m) => m.id === s.id) &&
        !g.some((m) => m.playing === instFor(s, role));
      let cands = pool.filter((s) => fits(s) && (load[s.id] || 0) < MAX_LOAD);
      if (!cands.length) cands = pool.filter(fits); // התפקיד גובר על המכסה
      if (!cands.length) continue;
      const rank = (s) => (s.teacher ? 0.5 : load[s.id] || 0);
      const debt = (s) => ledger.plays[s.id] || 0;
      cands.sort((a, b) => rank(a) - rank(b) || debt(a) - debt(b) || a.roles.length - b.roles.length);
      const pick = cands[0];
      const inst = instFor(pick, role);
      g.push({ ...pick, playing: inst, slot: role });
      g.sort((a, b) => orderOf(a.playing) - orderOf(b.playing));
      load[pick.id] = (load[pick.id] || 0) + 1;
      filled.push({ group: i, role, id: pick.id, name: pick.name, instrument: inst });
    }
  });
  const unfixable = [];
  groups.forEach((g, i) => {
    const missing = missingRoles(g);
    if (missing.length) unfixable.push({ group: i, missing });
  });
  return {
    groups,
    load,
    bench: res.bench.filter((s) => !filled.some((f) => f.id === s.id)),
    filled,
    unfixable,
  };
}

const BENCH = -1; // "הרכב" הספסל, לצורך בחירה והחלפה

/**
 * מחליף שני נגנים ביניהם — בין שני הרכבים, או בין הרכב לספסל.
 * זו עריכה ידנית: המורה מכיר את הכיתה טוב יותר מהאלגוריתם, ולפעמים
 * צירוף מסוים פשוט לא עובד. ההחלפה לא נוגעת באף אחד אחר.
 *
 * מחזיר { error } עם סיבה קריאה כשההחלפה שוברת כלל, כדי שאפשר יהיה
 * לומר למורה למה — ולא סתם לסרב.
 * a ו-b הם { g, id }, כאשר g === BENCH מציין את הספסל.
 */
function swapPlayers(res, a, b) {
  if (a.g === b.g) return { error: "שני הנגנים באותו מקום" };
  // תלמיד שמנגן בשני הרכבים יכול היה "להתחלף עם עצמו" — פעולה שהתקבלה
  // ולא עשתה דבר. עדיף לומר את זה מאשר להיראות תקוע.
  if (a.id === b.id) return { error: "זה אותו תלמיד" };
  const find = (sel) =>
    sel.g === BENCH
      ? res.bench.find((s) => s.id === sel.id)
      : (res.groups[sel.g] || []).find((m) => m.id === sel.id);
  const A = find(a);
  const B = find(b);
  if (!A || !B) return { error: "אחד הנגנים כבר לא בחלוקה" };

  const rest = (sel) => (sel.g === BENCH ? [] : res.groups[sel.g].filter((m) => m.id !== sel.id));
  const restA = rest(a);
  const restB = rest(b);

  // תלמיד לא מנגן פעמיים באותו הרכב
  if (b.g !== BENCH && restB.some((m) => m.id === A.id)) return { error: `${A.name} כבר מנגן בהרכב ${b.g + 1}` };
  if (a.g !== BENCH && restA.some((m) => m.id === B.id)) return { error: `${B.name} כבר מנגן בהרכב ${a.g + 1}` };

  // הכלי שהתלמיד ינגן ביעד: קודם מה שהוא מנגן עכשיו, אחרת כלי אחר שלו שפנוי
  const fit = (s, group) =>
    [s.playing, ...s.instruments].find(
      (inst) =>
        inst && s.instruments.includes(inst) && (!UNIQUE.has(inst) || !group.some((m) => m.playing === inst))
    );
  const instA = b.g === BENCH ? null : fit(A, restB);
  const instB = a.g === BENCH ? null : fit(B, restA);
  if (b.g !== BENCH && !instA) return { error: `אין כיסא פנוי ל${A.name} בהרכב ${b.g + 1}` };
  if (a.g !== BENCH && !instB) return { error: `אין כיסא פנוי ל${B.name} בהרכב ${a.g + 1}` };

  const seat = (s, inst) => ({ ...s, playing: inst, slot: ROLE_OF[inst] || "melody" });
  const byOrder = (x, y) => orderOf(x.playing) - orderOf(y.playing);
  const groups = res.groups.map((g, i) => {
    if (i === a.g) return [...restA, seat(B, instB)].sort(byOrder);
    if (i === b.g) return [...restB, seat(A, instA)].sort(byOrder);
    return g;
  });

  // הכלל נשמר גם אחרי עריכה ידנית
  for (const i of [a.g, b.g]) {
    if (i === BENCH) continue;
    const miss = missingRoles(groups[i]);
    if (miss.length)
      return { error: `הרכב ${i + 1} יישאר בלי ${miss.map((r) => ROLE_MISSING[r]).join(" ובלי ")}` };
  }

  // החלפה בין הרכבים לא משנה עומס. מול הספסל — היא כן.
  const load = { ...res.load };
  let bench = res.bench;
  const toBench = (into, out) => {
    load[into.id] = (load[into.id] || 0) + 1;
    load[out.id] = (load[out.id] || 0) - 1;
    if (!load[out.id]) delete load[out.id];
    // מי שעדיין מנגן בהרכב אחר רק מפנה כיסא — הוא לא עולה לספסל
    bench = res.bench.filter((s) => s.id !== into.id);
    if (!load[out.id]) bench = bench.concat([out]);
  };
  if (a.g === BENCH) toBench(A, B);
  if (b.g === BENCH) toBench(B, A);

  return { groups, load, bench, moved: [A.name, B.name] };
}

/* ======================= עריכה ידנית: העברה, הוספה, הוצאה =======================

   ארבע פעולות נוספות על `swapPlayers`, באותו חוזה: מחזירות `{ groups, load,
   bench, msg }` או `{ error }` עם סיבה קריאה. כולן שומרות על אותם כללים
   כמו החלוקה האוטומטית — REQUIRED בכל הרכב, MAX_GROUP, כלי ייחודי אחד —
   כי המורה יכול לשנות החלטה של האלגוריתם אבל לא לשבור הרכב בלי לדעת.
   ================================================================== */

const seatOrder = (a, b) => orderOf(a.playing) - orderOf(b.playing);
const takeSeat = (s, inst) => ({ ...s, playing: inst, slot: ROLE_OF[inst] || "melody" });
const gapText = (miss) => miss.map((r) => ROLE_MISSING[r]).join(" ובלי ");

function seatAt(res, at) {
  const pool = at.g === BENCH ? res.bench : res.groups[at.g] || [];
  return pool.find((m) => m.id === at.id);
}

/** מי שמנגן או יושב כרגע — בהרכב כלשהו או על הספסל */
function someoneIn(res, id) {
  return res.bench.find((s) => s.id === id) || res.groups.flat().find((m) => m.id === id);
}

/**
 * האם התלמיד יכול לקבל כיסא בהרכב, ובאיזה כלי. תקרת MAX_GROUP נאכפת כאן —
 * זה מקום נוסף שבו הרכב יכול לגדול. כלי שממלא תפקיד חסר בהרכב קודם לכלי
 * הנוכחי של התלמיד.
 */
function entry(group, s, n) {
  if (group.some((m) => m.id === s.id)) return { error: `${s.name} כבר מנגן בהרכב ${n}` };
  if (group.length >= MAX_GROUP) return { error: `הרכב ${n} מלא — ${MAX_GROUP} נגנים זה המקסימום` };
  const gaps = missingRoles(group);
  const options = [s.playing, ...s.instruments].filter(
    (i) => i && s.instruments.includes(i) && (!UNIQUE.has(i) || !group.some((m) => m.playing === i))
  );
  if (!options.length) return { error: `אין כיסא פנוי ל${s.name} בהרכב ${n}` };
  const fills = (i) => (gaps.includes(ROLE_OF[i] || "melody") ? 0 : 1);
  const inst = [...options].sort((a, b) => fills(a) - fills(b))[0];
  return { inst, fillsGap: fills(inst) === 0 };
}

/** מוציא כיסא מהרכב, ובודק שההרכב נשאר שלם */
function without(res, at) {
  const rest = res.groups[at.g].filter((m) => m.id !== at.id);
  const miss = missingRoles(rest);
  return miss.length ? { error: `הרכב ${at.g + 1} יישאר בלי ${gapText(miss)}` } : { rest };
}

/**
 * מעביר נגן מהרכב אחד לאחר. העומס לא משתנה — הוא רק עובר כיסא.
 * מהספסל לא מעבירים אלא מוסיפים, ולכן זה מפנה ל-addPlayer.
 */
function movePlayer(res, from, to) {
  if (from.g === BENCH) return addPlayer(res, from.id, to);
  if (from.g === to) return { error: "הוא כבר בהרכב הזה" };
  const s = seatAt(res, from);
  if (!s) return { error: "הנגן כבר לא בחלוקה" };
  if (!res.groups[to]) return { error: "אין הרכב כזה" };
  const dest = entry(res.groups[to], s, to + 1);
  if (dest.error) return dest;
  const left = without(res, from);
  if (left.error) return left;
  const groups = res.groups.map((g, i) =>
    i === from.g ? left.rest : i === to ? [...g, takeSeat(s, dest.inst)].sort(seatOrder) : g
  );
  return {
    groups,
    load: res.load,
    bench: res.bench,
    msg: `${s.name} עבר מהרכב ${from.g + 1} להרכב ${to + 1} (${dest.inst}).`,
  };
}

/**
 * מוסיף נגן להרכב — מי שיושב על הספסל, או מי שכבר מנגן בהרכב אחר
 * וייקח כיסא נוסף. התוספת עולה בעומס, ולכן:
 *  - תומר נכנס להרכב אחד בלבד;
 *  - מי שכבר ב-MAX_LOAD הרכבים מצטרף רק להרכב שחסר בו תפקיד חיוני שהוא ממלא
 *    (אותה הקלה כמו בחלוקה, ולא רחבה ממנה).
 */
function addPlayer(res, id, to) {
  const s = someoneIn(res, id);
  if (!s) return { error: "הנגן כבר לא בחלוקה" };
  if (!res.groups[to]) return { error: "אין הרכב כזה" };
  const n = res.load[id] || 0;
  if (s.teacher && n >= 1) return { error: `${s.name} נכנס להרכב אחד בלבד` };
  const dest = entry(res.groups[to], s, to + 1);
  if (dest.error) return dest;
  if (n >= MAX_LOAD && !dest.fillsGap)
    return { error: `${s.name} כבר מנגן ב-${n} הרכבים — עוד אחד רק אם ההרכב חסר תפקיד שהוא ממלא` };
  const load = { ...res.load, [id]: n + 1 };
  return {
    groups: res.groups.map((g, i) => (i === to ? [...g, takeSeat(s, dest.inst)].sort(seatOrder) : g)),
    load,
    bench: res.bench.filter((x) => x.id !== id),
    msg: n
      ? `${s.name} מנגן עכשיו גם בהרכב ${to + 1} (${dest.inst}) — ×${n + 1}.`
      : `${s.name} הצטרף להרכב ${to + 1} (${dest.inst}).`,
  };
}

/**
 * מוציא נגן מהרכב. מי שאין לו הרכב אחר יורד לספסל (ויקבל עדיפות בשיעור
 * הבא); מי שמנגן גם במקום אחר פשוט מפנה את הכיסא, ולא נשכח על הספסל.
 */
function removePlayer(res, at) {
  if (at.g === BENCH) return { error: "הוא כבר על הספסל" };
  const s = seatAt(res, at);
  if (!s) return { error: "הנגן כבר לא בחלוקה" };
  const left = without(res, at);
  if (left.error) return left;
  const n = (res.load[at.id] || 1) - 1;
  const load = { ...res.load };
  if (n > 0) load[at.id] = n;
  else delete load[at.id];
  return {
    groups: res.groups.map((g, i) => (i === at.g ? left.rest : g)),
    load,
    bench: n > 0 ? res.bench : [...res.bench, s],
    msg: `${s.name} יצא מהרכב ${at.g + 1}` + (n > 0 ? ` ונשאר בהרכב אחר.` : ` ועבר לספסל.`),
  };
}

/**
 * מחליף את הכלי שנגן מנגן בהרכב. כלי משני מותר כאן — המורה מחליט — אבל
 * ההרכב חייב להישאר שלם, ובכלי ייחודי אסור שיהיו שניים.
 */
function changeInstrument(res, at, inst) {
  const s = at.g === BENCH ? null : seatAt(res, at);
  if (!s) return { error: "הנגן כבר לא בהרכב" };
  if (inst === s.playing) return { error: `${s.name} כבר מנגן ב${inst}` };
  if (![...s.instruments, ...(s.backup || [])].includes(inst))
    return { error: `${s.name} לא מנגן ב${inst}` };
  const rest = res.groups[at.g].filter((m) => m.id !== at.id);
  if (UNIQUE.has(inst) && rest.some((m) => m.playing === inst))
    return { error: `בהרכב ${at.g + 1} כבר יש ${inst}` };
  const next = [...rest, takeSeat(s, inst)].sort(seatOrder);
  const miss = missingRoles(next);
  if (miss.length) return { error: `הרכב ${at.g + 1} יישאר בלי ${gapText(miss)}` };
  return {
    groups: res.groups.map((g, i) => (i === at.g ? next : g)),
    load: res.load,
    bench: res.bench,
    msg: `${s.name} עבר מ${s.playing} ל${inst} בהרכב ${at.g + 1}.`,
  };
}

/** החלוקה כטקסט פשוט — לשליחה לכיתה או להדבקה במקום אחר */
function drawText(res, title) {
  const lines = [title];
  res.groups.forEach((g, i) => {
    lines.push("", `הרכב ${i + 1}`, ...g.map((m) => `${m.name} — ${m.playing}`));
  });
  if (res.bench.length) lines.push("", `יושבים: ${res.bench.map((s) => s.name).join(", ")}`);
  return lines.join("\n");
}

export {
  ROLE_MISSING,
  missingRoles,
  addToDraw,
  removeFromDraw,
  repairDraw,
  BENCH,
  swapPlayers,
  seatOrder,
  takeSeat,
  gapText,
  seatAt,
  someoneIn,
  entry,
  without,
  movePlayer,
  addPlayer,
  removePlayer,
  changeInstrument,
  drawText,
};
