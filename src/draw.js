/* האלגוריתם: חלוקה, ניקוד, העשרת הרמוניה, וכמה הרכבים אפשר.
   בלי React ובלי דפדפן — נבדק ישירות ב-`npm test`. */

import { ROLE_OF, UNIQUE, orderOf, MAX_LOAD, MIN_GROUP, MAX_GROUP, MAX_GROUPS, REQUIRED, BENCH_COST, forRole, pairKey, EMPTY } from "./roster.js";

/* ============================ אלגוריתם ============================ */

/* מקור האקראיות של החלוקה. ניתן להחלפה כדי שהבדיקות ירוצו על רצף קבוע:
   עם Math.random כל ריצה בדקה חלוקות אחרות, ובדיקה שנכשלה פעם במאה לא
   הייתה ניתנת לשחזור. באפליקציה עצמה זה תמיד Math.random. */
let rnd = Math.random;
const setRandom = (fn) => {
  rnd = fn || Math.random;
};
// למודולים אחרים: תמיד דרך המקור הנוכחי, גם אחרי שהוחלף
const random = () => rnd();
/** מחולל פסאודו־אקראי קטן (mulberry32) — אותו seed, אותו רצף */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shuffle = (a0) => {
  const a = [...a0];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* הכלי שבו התלמיד ימלא את התפקיד. כולל כלים משניים, כי כשהם נכנסים
   לפעולה התלמיד מנגן בהם בפועל. */
const instFor = (s, role) => {
  if (role === "drums") return "תופים";
  if (role === "bass") return "בס";
  // הרמוני ומלודי — הכלי הראשון של התלמיד שממלא את התפקיד
  return [...s.instruments, ...(s.backup || [])].find((i) => (ROLE_OF[i] || "melody") === role);
};

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

  // 1. התפקידים שחייבים: תופים, בס, כלי הרמוני וכלי מלודי בכל הרכב.
  //    מתחילים מהתפקיד שיש בו הכי מעט נגנים — הוא הכי קשה לספק.
  const roles = [...REQUIRED].sort(
    (a, b) => forRole(roster, a).length - forRole(roster, b).length
  );
  for (const role of roles) {
    const cands = forRole(roster, role);
    for (const g of shuffle([...Array(k).keys()])) {
      const fits = (s) => !inGroup(s, g) && free(g, instFor(s, role));
      let ok = cands.filter((s) => (load[s.id] || 0) < MAX_LOAD && fits(s));
      // אין מי שפנוי במכסה? התפקיד חייב להתמלא, ולכן חורגים ממנה
      if (!ok.length) ok = cands.filter(fits);
      if (!ok.length) return null;
      // סדר: תלמיד שעוד לא ניגן היום → המורה → תלמיד שיכפיל הרכב
      const rank = (s) => (s.teacher ? 0.5 : load[s.id] || 0);
      ok.sort(
        (a, b) =>
          rank(a) - rank(b) || debt(a) - debt(b) || a.roles.length - b.roles.length || rnd() - 0.5
      );
      const head = ok[0];
      const top = ok.filter(
        (s) => rank(s) === rank(head) && debt(s) === debt(head) && s.roles.length === head.roles.length
      );
      const pick = shuffle(top)[0];
      place(pick, instFor(pick, role), role, g);
    }
  }

  /* 2. כל השאר — מי שעוד לא ניגן היום.
     קודם מקבצים לפי כלי ומשרשרים בסבב, כדי לפזר כלים זהים בין ההרכבים.
     ואז ממיינים את התור כולו לפי הפנקס — מיון יציב, ולכן הסבב נשמר בתוך
     כל רמת חוב. הסדר הגלובלי הזה חשוב דווקא כשנגמרים הכיסאות: מי שנשאר
     בסוף התור הוא מי שיישב, וזה חייב להיות מי שכבר צבר הכי הרבה. בלי
     המיון, מקום בתור נקבע לפי גודל קבוצת הכלי ולא לפי הצבירה. */
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
  queue.sort((x, y) => debt(x) - debt(y));

  const bench = [];
  const melodic = (g) => groups[g].filter((m) => m.slot === "melody").length;
  for (const s of queue) {
    let best = null,
      bestInst = null,
      bestScore = Infinity;
    for (let g = 0; g < k; g++) {
      // תקרת הגודל נאכפת כאן, במקום היחיד שמגדיל הרכבים. בלי זה MAX_GROUP
      // היה רק שיקול בניקוד, והרכבים של שמונה נגנים יצאו בפועל.
      if (groups[g].length >= MAX_GROUP) continue;
      const fam = groups[g].reduce((a, m) => a + (ledger.pairs[pairKey(s.id, m.id)] || 0), 0);
      s.instruments.forEach((inst, ord) => {
        if (!free(g, inst) || inGroup(s, g)) return;
        // שני כלים מלודיים זהים בהרכב הם מפגש מוזיקלי לגיטימי ולא תקלה,
        // ולכן העונש קל — מספיק כדי לפזר, לא כדי למנוע.
        const same = groups[g].filter((m) => m.playing === inst).length;
        const score =
          melodic(g) * 100 + groups[g].length * 25 + same * 12 + fam * 6 + ord * 8 + rnd() * 4;
        if (score < bestScore) (bestScore = score), (best = g), (bestInst = inst);
      });
    }
    if (best === null) bench.push(s);
    else place(s, bestInst, "melody", best);
  }

  /* אם המורה לא נדרש לאף כיסא — הוא מצטרף להרכב שאין בו פסנתר, והקטן
     ביותר מביניהם. גם הוא כפוף לתקרת הגודל: קודם הוא לא היה, וזה היה
     המקור האחרון להרכבים של שמונה נגנים. */
  const teacher = roster.find((s) => s.teacher);
  if (teacher && !load[teacher.id]) {
    const open = shuffle([...Array(k).keys()])
      .filter((g) => free(g, "פסנתר") && groups[g].length < MAX_GROUP)
      .sort((a, b) => groups[a].length - groups[b].length);
    if (open.length) place(teacher, "פסנתר", "harmony", open[0]);
  }

  return {
    groups: groups.map((g) => [...g].sort((a, b) => orderOf(a.playing) - orderOf(b.playing))),
    load,
    bench,
  };
}

/**
 * כלי הרמוני שני בהרכב — פסנתר וגיטרה יחד, שזה מותר ורצוי.
 *
 * בחלוקה רגילה זה לא קורה: כל נגן הרמוני נדרש לכיסא האחד של הרכב אחר,
 * ושלב המלודיה מצרף רק מי שעוד לא מנגן היום. לכן ההעשרה מצרפת נגן
 * שכבר מנגן — והתנאי לכך הוא שהספסל ריק. כשאיש לא יושב, הכיסא הנוסף
 * לא בא על חשבון זמן נגינה של אף אחד, והפנקס יאזן את העומס בשיעור הבא.
 * כשמישהו כן יושב, לתת לאחר לנגן פעמיים זה בדיוק הקיפוח שהפנקס נועד למנוע.
 *
 * המורה אינו מועמד: הוא נכנס להרכב אחד בלבד ואינו נספר בפנקס.
 * רץ אחרי בחירת החלוקה ולא בתוכה, כדי ש-capacity תמשיך למדוד את
 * החלוקה עצמה — אחרת תוספת נגן להרכב הייתה מצמצמת את מספר ההרכבים.
 */
function enrichHarmony(res, roster, ledger) {
  if (res.bench.length) return res;
  const groups = res.groups.map((g) => [...g]);
  const load = { ...res.load };
  const enriched = [];
  /* תקרת הגודל היא אותה תקרה של החלוקה עצמה. קודם היא הייתה
     Math.max(MAX_GROUP, הגודל שיצא בפועל) — מפני שהחלוקה ידעה לחרוג
     מ-MAX_GROUP. עכשיו היא לא, ולכן די בתקרה אחת. */
  const cap = MAX_GROUP;
  // מהקטן לגדול: יכולת ההעשרה מוגבלת ב-MAX_LOAD, ועדיף שתלך להרכב
  // שחסר בו נגן מאשר תנפח הרכב שכבר גדול
  const order = groups.map((g, i) => i).sort((a, b) => groups[a].length - groups[b].length);
  order.forEach((i) => {
    const g = groups[i];
    if (g.length >= cap) return;
    if (g.filter((m) => ROLE_OF[m.playing] === "harmony").length !== 1) return;
    const cands = roster.filter(
      (s) =>
        !s.teacher &&
        s.roles.includes("harmony") &&
        (load[s.id] || 0) < MAX_LOAD &&
        !g.some((m) => m.id === s.id) &&
        !g.some((m) => m.playing === instFor(s, "harmony"))
    );
    if (!cands.length) return;
    const fam = (s) => g.reduce((a, m) => a + (ledger.pairs[pairKey(s.id, m.id)] || 0), 0);
    cands.sort(
      (a, b) =>
        (load[a.id] || 0) - (load[b.id] || 0) ||
        (ledger.plays[a.id] || 0) - (ledger.plays[b.id] || 0) ||
        fam(a) - fam(b) ||
        rnd() - 0.5
    );
    const pick = cands[0];
    const inst = instFor(pick, "harmony");
    g.push({ ...pick, playing: inst, slot: "harmony" });
    g.sort((a, b) => orderOf(a.playing) - orderOf(b.playing));
    load[pick.id] = (load[pick.id] || 0) + 1;
    enriched.push({ group: i, id: pick.id, name: pick.name, instrument: inst });
  });
  return { ...res, groups, load, enriched };
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
  /* כולם מנגנים: יושב אחד יקר יותר מכל דבר אחר. קודם הוא עלה 12 וזיכה
     ב-plays*3, ולכן מרגע שהפנקס התמלא חלוקה עם ספסל ניצחה חלוקה בלי.
     הזיכוי נשאר רק כשובר שוויון: אם מישהו חייב לשבת — מי שצבר הכי הרבה. */
  res.bench.forEach((s) => {
    fairness += BENCH_COST - (ledger.plays[s.id] || 0) * 3;
  });
  let variety = 0;
  res.groups.forEach((g) =>
    g.forEach((a, i) => g.slice(i + 1).forEach((b) => (variety += ledger.pairs[pairKey(a.id, b.id)] || 0)))
  );
  return fairness * 4 + variety + rnd() * 0.5;
}

function bestDraw(roster, k, ledger, tries = 160) {
  const all = attempt(roster, k, ledger, tries);
  if (!all.length) return null;
  const best = all.reduce((b, r) => (cost(r, ledger) < cost(b, ledger) ? r : b));
  return enrichHarmony(best, roster, ledger);
}


/**
 * טבלת האפשרויות: לכל מספר הרכבים אפשרי — מה הוא אומר בפועל על הרצפה.
 * גודל ההרכב הקטן והגדול, כמה תלמידים יידרשו לנגן ביותר מהרכב אחד, וכמה
 * יישארו בחוץ. זו ההחלטה הפדגוגית של המורה, ולכן היא מוצגת לו ולא נקבעת
 * בקבוע נסתר לכל כיתה.
 *
 * `fits` הוא התנאי היחיד שמעניין: אף אחד לא יושב בחוץ, ואף הרכב לא עובר
 * את MAX_GROUP. לכל k דוגמים כמה חלוקות ולא אחת, כי חלוקה בודדת עלולה
 * לצאת גרועה במקרה ולעוות את הטבלה.
 */
function options(pool, tries = 40) {
  const top = Math.min(MAX_GROUPS, Math.max(1, Math.floor(pool.length / MIN_GROUP)));
  const out = [];
  for (let k = 1; k <= top; k++) {
    let best = null;
    for (const r of attempt(pool, k, EMPTY, tries)) {
      const sizes = r.groups.map((g) => g.length);
      const cand = {
        k,
        bench: r.bench.length,
        biggest: Math.max(...sizes),
        smallest: Math.min(...sizes),
        doubling: Object.values(r.load).filter((n) => n > 1).length,
      };
      cand.fits = !cand.bench && cand.biggest <= MAX_GROUP;
      if (!best || cand.bench < best.bench || (cand.bench === best.bench && cand.biggest < best.biggest))
        best = cand;
    }
    if (best) out.push(best);
  }
  return out;
}

/**
 * כמה הרכבים אפשר, וכמה מומלץ.
 *
 * כלל אחד: **הכי מעט הרכבים שבהם אף אחד לא יושב בחוץ ואף הרכב לא עובר
 * את MAX_GROUP.** פחות הרכבים פירושו יותר זמן במה לכל אחד — כל הרכב מספיק
 * לנגן כמה פעמים בשיעור — וגם פחות תלמידים שנדרשים לנגן פעמיים. לכן
 * מוסיפים הרכב רק כשהקודם כבר צפוף מדי.
 *
 * הכלל הזה מחזיר בדיוק את מה ששלושה קבועים נפרדים החזיקו קודם ביד
 * (PREFERRED_GROUPS, PREFER_SLACK ו-preferredK): 4 הרכבים בי״א, 3 בט׳.
 * כשאף מספר לא עומד בתנאי — שיעור עם הרבה נעדרים — בוחרים את הטוב שנמצא
 * (הכי מעט יושבים, ואז ההרכב הגדול הקטן ביותר) במקום ליפול ל-1.
 */
function capacity(pool) {
  const opts = options(pool);
  if (!opts.length) return { max: 1, rec: 1, options: [], playable: [] };
  const max = Math.max(...opts.map((o) => o.k));
  const fit = opts.filter((o) => o.fits);
  const rec = fit.length
    ? Math.min(...fit.map((o) => o.k))
    : opts.reduce((b, o) => (o.bench < b.bench || (o.bench === b.bench && o.biggest < b.biggest) ? o : b))
        .k;
  /* מה שמותר לבחור. כולם מנגנים בכל שיעור: מספר הרכבים שמושיב מישהו בחוץ
     אינו אפשרות כשיש מספר שאין בו ישיבה. רק כשאין כזה (נעדרים רבים,
     תפקיד שלם חסר) מציגים הכול, וכל מספר נושא את מספר היושבים שלו. */
  const playable = fit.length ? fit : opts;
  return { max, rec, options: opts, playable };
}

export {
  setRandom,
  random,
  seededRandom,
  shuffle,
  instFor,
  makeGroups,
  enrichHarmony,
  attempt,
  cost,
  bestDraw,
  options,
  capacity,
};
