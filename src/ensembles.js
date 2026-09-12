/* לוגיקת החלוקה, בלי React ובלי דפדפן — כדי שאפשר יהיה לבדוק אותה ישירות
   ב-`npm test`. כל מה שנוגע ל-localStorage ולתצוגה נשאר ב-App.jsx. */

/* ============================ נתוני התלמידים ============================ */

const RAW = {
  "י״א": [
    ["מעיין", "אלפר", ["תופים"], "מעיין-אלפר"],
    ["נועם", "בנימיני", ["תופים"], "נועם-בנימיני"],
    ["יאיר", "גדות", ["טרומבון"], "יאיר-גדות"],
    ["גבריאל", "גדליוביץ", ["פסנתר"], "גבריאל-גדליוביץ"],
    ["סער", "חג׳בי", ["טנור"], "סער-חג׳בי"],
    ["עידן", "חסילביץ", ["בס"], "עידן-חסילביץ"],
    ["דן", "טל הוד", ["פסנתר"], "דן-טל הוד"],
    ["נגה", "יעקבי", ["אלט"], "נגה-יעקבי"],
    ["איתן", "יעקובסון", ["תופים"], "איתן-יעקובסון"],
    ["אילון", "כהן מנור", ["טנור"], "אילון-כהן מנור"],
    ["אנדריי", "ליסובסקי", ["טנור"], "אנדריי-ליסובסקי"],
    ["נדב", "מילדוורט", ["בס"], "נדב-מילדוורט"],
    ["שי", "ספין", ["שירה"], "שי-ספין"],
    ["הלל", "עפרוני", ["חצוצרה"], "הלל-עפרוני"],
    ["יהונתן", "צדוק", ["פסנתר"], "יהונתן-צדוק", ["בס"]],
    ["דן", "קוצ׳ין", ["שירה"], "דן-קוצ׳ין"],
    ["ליר", "רגב", ["שירה"], "ליר-רגב"],
    ["נתן", "רנדל", ["אלט"], "נתן-רנדל"],
    ["עידן", "שטרית", ["גיטרה"], "עידן-שטרית"],
    ["ארתור", "שטרן", ["גיטרה"], "ארתור-שטרן"],
    ["קורה", "שפע", ["אלט"], "קורה-שפע"],
    ["ניאה", "תורן", ["שירה"], "ניאה-תורן"],
  ],
  "ט׳": [
    ["אילה", "אוריין", ["אלט"], "אילה-אוריין"],
    ["אביגיל", "וייס גולדשטיין", ["שירה"], "אביגיל-וייס גולדשטיין"],
    ["אלונה", "זעירא", ["חליל"], "אלונה-זעירא"],
    ["נועם", "טל", ["טנור"], "נועם-טל"],
    ["יהלי", "יריב", ["גיטרה"], "יהלי-יריב", ["בס"]],
    ["עדאל", "ירמקוב", ["שירה"], "עדאל-ירמקוב"],
    ["אוריה", "כהן אוריה", ["חצוצרה"], "סמואל-כהן אוריה"],
    ["ניב", "כנען", ["בס"], "ניב-כנען"],
    ["לאו", "סוסנה", ["תופים"], "לאו-סוסנה"],
    ["דני", "סלומון", ["חצוצרה"], "דניאל-סלומון", ["פסנתר"]],
    ["אלון", "ספורטא", ["פסנתר"], "אלון-ספורטא"],
    ["מאיה", "פינטו", ["חליל"], "מאיה-פינטו"],
    ["אדם", "פלוינסקי", ["פסנתר"], "אדם-פלוינסקי"],
    ["יהונתן", "פריינטא", ["תופים"], "יהונתן-פריינטא"],
  ],
};

const ROLE_OF = { "תופים": "drums", "בס": "bass", "פסנתר": "harmony", "גיטרה": "harmony" };
const UNIQUE = new Set(["תופים", "בס", "פסנתר", "גיטרה"]);
const ORDER = ["תופים", "בס", "פסנתר", "גיטרה", "חצוצרה", "טרומבון", "אלט", "טנור", "חליל", "שירה"];
const orderOf = (i) => (ORDER.indexOf(i) === -1 ? 99 : ORDER.indexOf(i));
const CLASSES = Object.keys(RAW);
const KEYS = { "ט׳": "ens-ledger-g9", "י״א": "ens-ledger-g11" };
const TABS = { "ט׳": "g9", "י״א": "g11" }; // לשוניות בגיליון
/* תלמיד לא ינגן ביותר משני הרכבים באותו שיעור — אלא אם אין ברירה:
   הדרישה לתופים, בס וכלי הרמוני בכל הרכב גוברת. בסיסט יחיד בכיתה ינגן
   בכל ההרכבים, כי אחרת חלקם יישארו בלי בס. ההקלה תקפה רק לתפקידים
   החיוניים; צירוף מלודי והעשרה לעולם לא יחרגו. */
const MAX_LOAD = 2;
const MAX_GROUP = 6; // מעבר לזה ההרכב כבר לא באמת מנגן
const MAX_GROUPS = 5; // יותר מזה לא מנוהל בשיעור אחד
const TEACHER = {
  id: "__teacher",
  name: "תומר",
  instruments: ["פסנתר"],
  roles: ["harmony"],
  teacher: true,
};

/**
 * האיבר הרביעי בכל שורה הוא המזהה, והוא הדבר היחיד ששומר על ההיסטוריה.
 * הוא לא נגזר מהשם בכוונה: כך אפשר לתקן שם שנכתב לא נכון בלי לאפס לתלמיד
 * את הפנקס. שורה בלי מזהה נופלת חזרה לנגזרת הישנה, כדי לא לשבור נתונים.
 * את המזהה של תלמיד קיים אין לשנות — הוא המפתח בגיליון ובגיבויים.
 */
function buildRoster(list) {
  const c = {};
  list.forEach(([f]) => (c[f] = (c[f] || 0) + 1));
  const roster = list.map(([first, last, inst, id, backup = []]) => ({
    id: id || `${first}-${last}`,
    name: c[first] > 1 ? `${first} ${last}` : first,
    instruments: inst,
    roles: [...new Set(inst.map((x) => ROLE_OF[x] || "melody"))],
    // כלים משניים: רזרבה בלבד. נכנסים רק כשאין אף נוכח שזה כליו הראשי.
    backup,
    backupRoles: [...new Set(backup.map((x) => ROLE_OF[x] || "melody"))],
  }));
  const ids = new Set(roster.map((s) => s.id));
  if (ids.size !== roster.length) throw new Error("יש מזהה כפול ברשימת התלמידים");
  return roster;
}
const ROSTERS = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, buildRoster(v)]));

/* שמות תצוגה קודמים של תלמידים ששמם שונה. משמש רק כשקוראים גיליון
   שנכתב לפני שנוספה עמודת המזהה — שם הזיהוי הוא לפי שם, ובלי המיפוי
   הזה שינוי שם היה מוחק לתלמיד את כל ההיסטוריה בשקט.
   מוסיפים כאן שורה בכל פעם ששם תצוגה משתנה. */
const FORMER_NAMES = {
  "סמואל": "סמואל-כהן אוריה",
  "דניאל": "דניאל-סלומון",
};

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
/* הכלי שבו התלמיד ימלא את התפקיד. כולל כלים משניים, כי כשהם נכנסים
   לפעולה התלמיד מנגן בהם בפועל. */
const instFor = (s, role) =>
  role === "drums"
    ? "תופים"
    : role === "bass"
      ? "בס"
      : [...s.instruments, ...(s.backup || [])].find((i) => ROLE_OF[i] === "harmony");

/* מי יכול למלא תפקיד חיוני. כלי משני הוא רזרבה: הוא נכנס רק כשאין אף
   נוכח שזה כליו הראשי — כלומר בחיסור, ולא כדי להקל על מי שכן נוכח. */
const forRole = (pool, role) => {
  const primary = pool.filter((s) => s.roles.includes(role));
  return primary.length ? primary : pool.filter((s) => (s.backupRoles || []).includes(role));
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

  // 1. ריתמיקה מלאה: תופים, בס וכלי הרמוני בכל הרכב.
  //    מתחילים מהתפקיד שיש בו הכי מעט נגנים.
  const roles = ["drums", "bass", "harmony"].sort(
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
  /* תקרת גודל: הרכב יגדל עד MAX_GROUP, או עד הגודל שהחלוקה כבר חייבה —
     הגדול מביניהם. כך ההעשרה ממלאת את ההרכבים הקטנים ומאזנת אותם,
     ולעולם לא מנפחת הרכב מעבר למה שכבר היה בו. */
  const cap = Math.max(MAX_GROUP, ...groups.map((g) => g.length));
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
        Math.random() - 0.5
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
  const best = all.reduce((b, r) => (cost(r, ledger) < cost(b, ledger) ? r : b));
  return enrichHarmony(best, roster, ledger);
}

const ROLE_MISSING = { drums: "תופים", bass: "בס", harmony: "כלי הרמוני" };

/** אילו תפקידים חיוניים חסרים בהרכב. לפי הכלי שמנגנים בפועל, ולא לפי ה-slot,
    כי גיטריסט שנכנס כתוספת מסומן melody אבל עדיין ממלא תפקיד הרמוני. */
const missingRoles = (g) =>
  ["drums", "bass", "harmony"].filter((r) => !g.some((m) => ROLE_OF[m.playing] === r));

/**
 * מכניס תלמיד לחלוקה קיימת בלי לפרק אותה — בשביל מי שהגיע באמצע השיעור.
 * בוחר את ההרכב שהכי מתאים: קודם כל אחד שחסר בו תפקיד חיוני שהתלמיד ממלא,
 * אחר כך ההרכב הקטן ביותר, ומי שהוא ניגן איתו הכי מעט.
 * מחזיר null אם אין לו כיסא פנוי באף הרכב.
 */
function addToDraw(res, student, ledger) {
  if (res.groups.some((g) => g.some((m) => m.id === student.id))) return null;
  let best = null;
  let bestInst = null;
  let bestScore = Infinity;
  res.groups.forEach((g, i) => {
    const fam = g.reduce((a, m) => a + (ledger.pairs[pairKey(student.id, m.id)] || 0), 0);
    const gaps = missingRoles(g);
    student.instruments.forEach((inst, ord) => {
      if (UNIQUE.has(inst) && g.some((m) => m.playing === inst)) return;
      const fills = gaps.includes(ROLE_OF[inst]) ? -1000 : 0; // סותם חור אמיתי
      const same = g.filter((m) => m.playing === inst).length;
      const score = fills + g.length * 25 + same * 40 + fam * 6 + ord * 8;
      if (score < bestScore) (bestScore = score), (best = i), (bestInst = inst);
    });
  });
  if (best === null) return null;
  const joined = { ...student, playing: bestInst, slot: ROLE_OF[bestInst] || "melody" };
  return {
    groups: res.groups.map((g, i) =>
      i === best ? [...g, joined].sort((a, b) => orderOf(a.playing) - orderOf(b.playing)) : g
    ),
    load: { ...res.load, [student.id]: (res.load[student.id] || 0) + 1 },
    bench: res.bench.filter((s) => s.id !== student.id),
    joined: best,
  };
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
  return { groups, load, bench: res.bench, broken };
}

/**
 * משלים תפקידים חיוניים שנפערו בחלוקה קיימת — בלי להזיז אף אחד ממקומו.
 * זה מה ששומר על הכלל "תופים, בס וכלי הרמוני בכל הרכב" גם כשמישהו יוצא
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
    bench = res.bench.filter((s) => s.id !== into.id).concat([out]);
  };
  if (a.g === BENCH) toBench(A, B);
  if (b.g === BENCH) toBench(B, A);

  return { groups, load, bench, moved: [A.name, B.name] };
}

/* ============================ יומן נוכחות ============================ */

const ATT_LABEL = { present: "נוכח", late: "איחור", absent: "חיסור", left: "יצא" };
const ATT_TAB = (cls) => `נוכחות ${cls}`;

/**
 * מצב הנוכחות של כל תלמיד בשיעור, מתוך השוואה בין מי שסומן חסר בזמן
 * החלוקה לבין מי שסומן חסר בסופו:
 *   סומן חסר ונשאר חסר   → חיסור
 *   סומן חסר ואז הוחזר    → איחור (הגיע אחרי שההרכבים כבר חולקו)
 *   היה נוכח ואז סומן חסר → יצא באמצע
 *   אחרת                  → נוכח
 */
function attendanceOf(roster, absentAtDraw, absentNow) {
  return roster.map((s) => {
    const was = absentAtDraw.has(s.id);
    const now = absentNow.has(s.id);
    return {
      id: s.id,
      name: s.name,
      status: was ? (now ? "absent" : "late") : now ? "left" : "present",
    };
  });
}

/* ביומן נרשמות רק החריגות. מי שהיה נוכח לכל אורך השיעור לא נרשם —
   אחרת היומן היה מתמלא בשורות שאין בהן מידע. */
function lessonAttendance(roster, absentAtDraw, absentNow, lesson, date) {
  return attendanceOf(roster, absentAtDraw, absentNow)
    .filter((e) => e.status !== "present")
    .map((e) => ({ date, lesson, id: e.id, name: e.name, status: e.status }));
}

/* שמירה חוזרת של אותו שיעור מחליפה את רשומותיו, ולא מוסיפה כפילויות */
function mergeAttendance(log, lesson, entries) {
  return [...log.filter((e) => e.lesson !== lesson), ...entries];
}

function attToRows(log) {
  return [
    ["תאריך", "שיעור", "תלמיד", "מזהה", "סטטוס"],
    ...[...log]
      .sort((a, b) => a.lesson - b.lesson || a.name.localeCompare(b.name, "he"))
      .map((e) => [e.date, e.lesson, e.name, e.id, ATT_LABEL[e.status] || e.status]),
  ];
}

function rowsToAtt(rows) {
  const byLabel = Object.fromEntries(Object.entries(ATT_LABEL).map(([k, v]) => [v, k]));
  return (rows || [])
    .slice(1)
    .filter((r) => r && r[3])
    .map((r) => ({
      date: r[0] || "",
      lesson: Number(r[1]) || 0,
      name: r[2] || "",
      id: String(r[3]).trim(),
      status: byLabel[String(r[4] || "").trim()] || "absent",
    }));
}

const EMPTY = { plays: {}, pairs: {}, lessons: 0 };

/**
 * מוסיף חלוקה אחת לפנקס, תמיד מעל `base` — מצב הפנקס שלפני השיעור הזה.
 * זה מה שמאפשר לשמור שוב את אותו שיעור אחרי תיקון נוכחות: השמירה
 * השנייה מחליפה את הראשונה במקום להיספר כשיעור נוסף.
 * המורה לא נספר בפנקס — הוא ממלא כיסא, לא מתחרה על זמן ניגון.
 */
function applyLesson(roster, res, base) {
  const plays = { ...base.plays };
  const pairs = { ...base.pairs };
  roster.forEach((s) => (plays[s.id] = (plays[s.id] || 0) + (res.load[s.id] || 0)));
  res.groups.forEach((g) =>
    g.forEach((a, i) =>
      g.slice(i + 1).forEach((b) => {
        if (a.teacher || b.teacher) return;
        const key = pairKey(a.id, b.id);
        pairs[key] = (pairs[key] || 0) + 1;
      })
    )
  );
  return { plays, pairs, lessons: base.lessons + 1 };
}

/* ייצוא/ייבוא הפנקס כטקסט קצר, כדי לשמור אותו איפה שנוח.
   גרסה 2 נושאת את המזהים עצמם ולא רק מספרים לפי סדר, ולכן הגיבוי שורד
   הוספה או הסרה של תלמידים מהרשימה. גרסה 1 הייתה לפי מיקום בלבד. */
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
  return JSON.stringify({ v: 2, c: cls, l: ledger.lessons, s: ids, p, x });
}

/** מחזיר { ledger, dropped, added } — dropped/added כדי שנוכל להגיד למשתמש
    מה קרה במקום לשנות לו את ההיסטוריה בשקט */
function decodeLedger(cls, text) {
  const o = JSON.parse(text);
  if (o.c !== cls) throw new Error("הפנקס שייך לכיתה " + o.c);
  const list = ROSTERS[cls];
  const known = new Set(list.map((s) => s.id));
  // גיבוי ישן (v1) לא נשא מזהים — נקרא לפי סדר הרשימה הנוכחית, כמו קודם
  const src = Array.isArray(o.s) ? o.s : list.map((s) => s.id);
  const ids = src.map((id) => (known.has(id) ? id : null));
  const plays = {};
  (o.p || []).forEach((n, i) => {
    if (ids[i]) plays[ids[i]] = Number(n) || 0;
  });
  const pairs = {};
  (o.x || "")
    .split(",")
    .filter(Boolean)
    .forEach((part) => {
      const [ij, n] = part.split(":");
      const [a, b] = ij.split("-").map(Number);
      if (ids[a] && ids[b]) pairs[pairKey(ids[a], ids[b])] = Number(n);
    });
  return {
    ledger: { plays, pairs, lessons: o.l || 0 },
    dropped: ids.filter((id) => !id).length,
    added: list.filter((s) => !(s.id in plays)).length,
  };
}

/* המרה בין הפנקס לשורות הגיליון:
   A1: "שיעורים" | מספר | "צירופים" | מחרוזת דחוסה
   A2: כותרות, ומשורה 3: שם תלמיד | כמה הרכבים | מזהה
   הצירופים דחוסים לפי מיקום השורה, ועמודת המזהה היא שמפרשת את המיקומים —
   בלעדיה הוספת תלמיד באמצע הרשימה הייתה מזיזה לכולם את ההיסטוריה. */
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
    ["תלמיד", "הרכבים", "מזהה", ""],
    ...list.map((s) => [s.name, ledger.plays[s.id] || 0, s.id, ""]),
  ];
}

function rowsToLedger(cls, rows) {
  if (!rows.length) return { plays: {}, pairs: {}, lessons: 0 };
  const list = ROSTERS[cls];
  const known = new Set(list.map((s) => s.id));
  const byName = Object.fromEntries(list.map((s) => [s.name, s.id]));
  const lessons = Number(rows[0] && rows[0][1]) || 0;
  const plays = {};
  // סדר השורות בגיליון הוא הבסיס לאינדקסים של הצירופים, ולכן נבנה ממנו
  const order = [];
  rows.slice(2).forEach((r) => {
    const marked = (r[2] || "").trim();
    // גיליון שנכתב לפני עמודת המזהה — נופלים חזרה לזיהוי לפי שם
    const shown = (r[0] || "").trim();
    const alias = FORMER_NAMES[shown];
    const id = known.has(marked) ? marked : byName[shown] || (known.has(alias) ? alias : null);
    order.push(id);
    if (id) plays[id] = Number(r[1]) || 0;
  });
  const pairs = {};
  ((rows[0] && rows[0][3]) || "")
    .split(",")
    .filter(Boolean)
    .forEach((part) => {
      const [ij, n] = part.split(":");
      const [a, b] = ij.split("-").map(Number);
      if (order[a] && order[b]) pairs[pairKey(order[a], order[b])] = Number(n);
    });
  return { plays, pairs, lessons };
}


/**
 * כמה הרכבים אפשר להרכיב, וכמה מומלץ.
 * לכל k דוגמים כמה חלוקות ולא אחת — חלוקה בודדת עלולה לצאת גרועה במקרה
 * ולהפיל את ההמלצה. ואם אף k לא עומד בכל התנאים בוחרים את הטוב שנמצא
 * (הכי מעט יושבים, ואז ההרכב הגדול הקטן ביותר) במקום ליפול ל-1.
 */
function capacity(roster) {
  const hardMax = Math.min(MAX_GROUPS, Math.max(1, Math.floor(roster.length / 4)));
  let max = hardMax;
  while (max > 1 && !attempt(roster, max, EMPTY, 25).length) max--;

  const better = (a, b) => !b || a.bench < b.bench || (a.bench === b.bench && a.biggest < b.biggest);
  let rec = null;
  let fallback = null;
  for (let k = max; k >= 1; k--) {
    let best = null;
    for (const r of attempt(roster, k, EMPTY, 40)) {
      const cand = { k, bench: r.bench.length, biggest: Math.max(...r.groups.map((g) => g.length)) };
      if (better(cand, best)) best = cand;
    }
    if (!best) continue;
    if (better(best, fallback)) fallback = best;
    if (!best.bench && best.biggest <= MAX_GROUP) {
      rec = k;
      break;
    }
  }
  return { max, rec: rec ?? (fallback ? fallback.k : max) };
}

const ROLE_LABEL = { drums: "מתופפים", bass: "בסיסטים", harmony: "כלים הרמוניים" };

/* מה חוסם את מספר ההרכבים. מאז שהתפקידים החיוניים גוברים על MAX_LOAD,
   נגן יחיד בתפקיד מכסה כמה הרכבים שצריך — ולכן מספר הנגנים בתפקיד כבר
   אינו מגביל. מה שחוסם הוא תפקיד שאין לו אף נגן נוכח.
   מחזיר את התפקיד החיוני הדל ביותר; missing אומר שהוא ריק לגמרי,
   ואז אי אפשר להרכיב אף הרכב. */
function bottleneck(pool) {
  let count = Infinity;
  let role = null;
  for (const r of ["drums", "bass", "harmony"]) {
    const n = forRole(pool, r).length;
    if (n < count) (count = n), (role = r);
  }
  return { role, count, missing: count === 0 };
}

export {
  RAW,
  ROSTERS,
  CLASSES,
  KEYS,
  TABS,
  TEACHER,
  MAX_LOAD,
  MAX_GROUP,
  MAX_GROUPS,
  ROLE_OF,
  ROLE_LABEL,
  ORDER,
  EMPTY,
  ROLE_MISSING,
  ATT_LABEL,
  FORMER_NAMES,
  ATT_TAB,
  attendanceOf,
  lessonAttendance,
  mergeAttendance,
  attToRows,
  rowsToAtt,
  applyLesson,
  addToDraw,
  enrichHarmony,
  removeFromDraw,
  repairDraw,
  swapPlayers,
  BENCH,
  buildRoster,
  forRole,
  pairKey,
  makeGroups,
  attempt,
  cost,
  bestDraw,
  capacity,
  bottleneck,
  encodeLedger,
  decodeLedger,
  ledgerToRows,
  rowsToLedger,
};
