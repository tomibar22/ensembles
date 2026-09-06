/* לוגיקת החלוקה, בלי React ובלי דפדפן — כדי שאפשר יהיה לבדוק אותה ישירות
   ב-`npm test`. כל מה שנוגע ל-localStorage ולתצוגה נשאר ב-App.jsx. */

/* ============================ נתוני התלמידים ============================ */

const RAW = {
  "ט׳": [
    ["אילה", "אוריין", ["אלט"], "אילה-אוריין"],
    ["אביגיל", "וייס גולדשטיין", ["שירה"], "אביגיל-וייס גולדשטיין"],
    ["אלונה", "זעירא", ["חליל"], "אלונה-זעירא"],
    ["נועם", "טל", ["טנור"], "נועם-טל"],
    ["יהלי", "יריב", ["גיטרה", "בס"], "יהלי-יריב"],
    ["עדאל", "ירמקוב", ["שירה"], "עדאל-ירמקוב"],
    ["סמואל", "כהן אוריה", ["חצוצרה"], "סמואל-כהן אוריה"],
    ["ניב", "כנען", ["בס"], "ניב-כנען"],
    ["לאו", "סוסנה", ["תופים"], "לאו-סוסנה"],
    ["דניאל", "סלומון", ["חצוצרה"], "דניאל-סלומון"],
    ["אלון", "ספורטא", ["פסנתר"], "אלון-ספורטא"],
    ["מאיה", "פינטו", ["חליל"], "מאיה-פינטו"],
    ["אדם", "פלוינסקי", ["פסנתר"], "אדם-פלוינסקי"],
    ["יהונתן", "פריינטא", ["תופים"], "יהונתן-פריינטא"],
  ],
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
    ["שי", "ספין", ["פסנתר", "שירה"], "שי-ספין"],
    ["הלל", "עפרוני", ["חצוצרה"], "הלל-עפרוני"],
    ["יהונתן", "צדוק", ["בס", "פסנתר"], "יהונתן-צדוק"],
    ["דן", "קוצ׳ין", ["שירה"], "דן-קוצ׳ין"],
    ["ליר", "רגב", ["שירה"], "ליר-רגב"],
    ["נתן", "רנדל", ["אלט"], "נתן-רנדל"],
    ["עידן", "שטרית", ["גיטרה"], "עידן-שטרית"],
    ["ארתור", "שטרן", ["גיטרה"], "ארתור-שטרן"],
    ["קורה", "שפע", ["אלט"], "קורה-שפע"],
    ["ניאה", "תורן", ["שירה"], "ניאה-תורן"],
  ],
};

const ROLE_OF = { "תופים": "drums", "בס": "bass", "פסנתר": "harmony", "גיטרה": "harmony" };
const UNIQUE = new Set(["תופים", "בס", "פסנתר", "גיטרה"]);
const ORDER = ["תופים", "בס", "פסנתר", "גיטרה", "חצוצרה", "טרומבון", "אלט", "טנור", "חליל", "שירה"];
const orderOf = (i) => (ORDER.indexOf(i) === -1 ? 99 : ORDER.indexOf(i));
const CLASSES = Object.keys(RAW);
const KEYS = { "ט׳": "ens-ledger-g9", "י״א": "ens-ledger-g11" };
const TABS = { "ט׳": "g9", "י״א": "g11" }; // לשוניות בגיליון
const MAX_LOAD = 2; // תלמיד לא ינגן ביותר משני הרכבים באותו שיעור
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
  const roster = list.map(([first, last, inst, id]) => ({
    id: id || `${first}-${last}`,
    name: c[first] > 1 ? `${first} ${last}` : first,
    instruments: inst,
    roles: [...new Set(inst.map((x) => ROLE_OF[x] || "melody"))],
  }));
  const ids = new Set(roster.map((s) => s.id));
  if (ids.size !== roster.length) throw new Error("יש מזהה כפול ברשימת התלמידים");
  return roster;
}
const ROSTERS = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, buildRoster(v)]));

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
const instFor = (s, role) =>
  role === "drums" ? "תופים" : role === "bass" ? "בס" : s.instruments.find((i) => ROLE_OF[i] === "harmony");

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
    (a, b) => roster.filter((s) => s.roles.includes(a)).length - roster.filter((s) => s.roles.includes(b)).length
  );
  for (const role of roles) {
    const cands = roster.filter((s) => s.roles.includes(role));
    for (const g of shuffle([...Array(k).keys()])) {
      const ok = cands.filter(
        (s) => (load[s.id] || 0) < MAX_LOAD && !inGroup(s, g) && free(g, instFor(s, role))
      );
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
  return all.reduce((best, r) => (cost(r, ledger) < cost(best, ledger) ? r : best));
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
    const id = known.has(marked) ? marked : byName[(r[0] || "").trim()] || null;
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

const MAX_GROUP = 6; // מעבר לזה ההרכב כבר לא באמת מנגן

/**
 * כמה הרכבים אפשר להרכיב, וכמה מומלץ.
 * לכל k דוגמים כמה חלוקות ולא אחת — חלוקה בודדת עלולה לצאת גרועה במקרה
 * ולהפיל את ההמלצה. ואם אף k לא עומד בכל התנאים בוחרים את הטוב שנמצא
 * (הכי מעט יושבים, ואז ההרכב הגדול הקטן ביותר) במקום ליפול ל-1.
 */
function capacity(roster) {
  const hardMax = Math.max(1, Math.floor(roster.length / 4));
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

/* מה חוסם את מספר ההרכבים. כל הרכב צריך תופים, בס וכלי הרמוני, ותלמיד
   מכסה לכל היותר MAX_LOAD הרכבים — כך שהתפקיד הנדיר קובע את התקרה.
   בלי ההסבר הזה ירידה פתאומית מ-5 הרכבים ל-2 אחרי סימון נעדרים נראית כמו תקלה. */
function bottleneck(pool) {
  let limit = Infinity;
  let role = null;
  for (const r of ["drums", "bass", "harmony"]) {
    const n = pool.filter((s) => s.roles.includes(r)).length;
    if (n * MAX_LOAD < limit) (limit = n * MAX_LOAD), (role = r);
  }
  return { limit, role, count: limit / MAX_LOAD };
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
  ROLE_OF,
  ROLE_LABEL,
  ORDER,
  EMPTY,
  ROLE_MISSING,
  applyLesson,
  addToDraw,
  removeFromDraw,
  buildRoster,
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
