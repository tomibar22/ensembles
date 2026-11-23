/* מנוע החלוקה להרכבים. בלי React, בלי דפדפן ובלי מסד נתונים — נבדק ישירות.
 *
 * כל מה שהיה קבוע בגרסה הקודמת הוא כאן נתון: אילו תפקידים חובה בכל הרכב,
 * גודל ההרכב, כמה הרכבים מותר לנגן, ומה התפקיד של כל כלי. כך אפשר ליצור
 * גם הרכבים מיוחדים (בלי בס, בלי תופים…) בלי לגעת בקוד.
 */

export type Role = "drums" | "bass" | "harmony" | "melody";
export const ROLES: Role[] = ["drums", "bass", "harmony", "melody"];
export const ROLE_NAME: Record<Role, string> = {
  drums: "תופים",
  bass: "בס",
  harmony: "כלי הרמוני",
  melody: "כלי מלודי",
};
export const ROLE_PLURAL: Record<Role, string> = {
  drums: "מתופפים",
  bass: "בסיסטים",
  harmony: "כלים הרמוניים",
  melody: "כלים מלודיים",
};

export interface Player {
  id: string;
  name: string;
  instruments: string[]; // ראשיים
  backup: string[]; // משניים — רזרבה בלבד
  teacher?: boolean;
}

/** כיסא בהרכב. slot = התפקיד שלשמו הושב, או "fill" למי שצורף בשלב המילוי. */
export interface Seat {
  id: string;
  inst: string;
  slot: Role | "fill";
}

export interface Draw {
  groups: Seat[][];
  bench: string[];
  load: Record<string, number>;
  /** מוביל לכל הרכב (מצב "תלמיד מוביל"), לפי אינדקס ההרכב */
  leaders?: (string | null)[];
}

export interface History {
  plays: Record<string, number>;
  pairs: Record<string, number>;
  leads: Record<string, number>;
  lessons: number;
}
export const NO_HISTORY: History = { plays: {}, pairs: {}, leads: {}, lessons: 0 };

export interface Rules {
  required: Role[];
  maxGroup: number;
  maxLoad: number;
  maxGroups: number;
  enrich: boolean;
}
export const DEFAULT_RULES: Rules = {
  required: ["drums", "bass", "harmony", "melody"],
  maxGroup: 7,
  maxLoad: 2,
  maxGroups: 5,
  enrich: true,
};

export interface Catalog {
  role(inst: string): Role;
  unique(inst: string): boolean;
  order(inst: string): number;
}

export interface Option {
  k: number;
  bench: number;
  biggest: number;
  smallest: number;
  doubling: number;
  /** כמה פעמים חסר תפקיד חיוני בהרכב (הרכב בלי בס = 1) */
  gaps: number;
  /** הכי הרבה הרכבים שתלמיד אחד מנגן בהם */
  busiest: number;
  fits: boolean;
}

/** בעיה בחלוקה. group = אינדקס ההרכב, או BENCH לבעיה כללית. */
export interface Issue {
  group: number;
  kind: "missing" | "oversize" | "double" | "empty" | "teacher";
  text: string;
}

export type EditResult = { draw: Draw; msg: string } | { error: string };

const BENCH_COST = 1e6;
export const BENCH = -1;
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** מחולל פסאודו־אקראי קטן (mulberry32) — אותו seed, אותו רצף. לבדיקות. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EngineOptions {
  players: Player[]; // כל מי שעשוי להופיע בחלוקה, כולל המורה
  catalog: Catalog;
  rules: Rules;
  history: History;
  rnd?: () => number;
}

export function createEngine(opts: EngineOptions) {
  const { catalog, rules, history } = opts;
  const rnd = opts.rnd ?? Math.random;
  const byId = new Map(opts.players.map((p) => [p.id, p]));
  const P = (id: string): Player =>
    byId.get(id) ?? { id, name: "?", instruments: [], backup: [] };
  const name = (id: string) => P(id).name;
  const roleOf = catalog.role;
  const REQUIRED = rules.required;
  const MIN_GROUP = Math.max(REQUIRED.length, 2);

  const uniq = <T,>(a: T[]) => [...new Set(a)];
  const rolesOf = (s: Player) => uniq(s.instruments.map(roleOf));
  const backupRolesOf = (s: Player) => uniq(s.backup.map(roleOf));
  const debt = (id: string) => history.plays[id] || 0;
  const pairN = (a: string, b: string) => history.pairs[pairKey(a, b)] || 0;
  const byOrder = (a: Seat, b: Seat) => catalog.order(a.inst) - catalog.order(b.inst);

  const shuffle = <T,>(a0: T[]) => {
    const a = [...a0];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* כלי משני הוא רזרבה: נכנס רק כשאין אף נוכח שזה כליו הראשי. */
  const forRole = (pool: Player[], role: Role) => {
    const primary = pool.filter((s) => rolesOf(s).includes(role));
    return primary.length ? primary : pool.filter((s) => backupRolesOf(s).includes(role));
  };
  const instFor = (s: Player, role: Role) =>
    [...s.instruments, ...s.backup].find((i) => roleOf(i) === role) as string;

  /** תפקידים חיוניים שאין להם אף נגן נוכח — הדבר היחיד שחוסם חלוקה לגמרי */
  const emptyRoles = (pool: Player[]) => REQUIRED.filter((r) => !forRole(pool, r).length);

  const missingRoles = (g: Seat[]) => REQUIRED.filter((r) => !g.some((m) => roleOf(m.inst) === r));
  const gapText = (miss: Role[]) => miss.map((r) => ROLE_NAME[r]).join(" ובלי ");

  /* ============================ החלוקה ============================ */

  /**
   * חלוקה אחת. במצב רגיל מחזירה null כשתפקיד חיוני לא מתמלא באחד ההרכבים;
   * ב-`lenient` (המורה בחר מספר הרכבים שאי אפשר לספק) משאירה את החור
   * פתוח — `issues` יגיד אותו במפורש.
   */
  function makeGroups(pool: Player[], k: number, lenient = false): Draw | null {
    const groups: Seat[][] = Array.from({ length: k }, () => []);
    const load: Record<string, number> = {};
    const place = (s: Player, inst: string, slot: Seat["slot"], g: number) => {
      groups[g].push({ id: s.id, inst, slot });
      load[s.id] = (load[s.id] || 0) + 1;
    };
    const inGroup = (s: Player, g: number) => groups[g].some((m) => m.id === s.id);
    const free = (g: number, inst: string) =>
      !catalog.unique(inst) || !groups[g].some((m) => m.inst === inst);

    // 1. התפקידים שחובה בכל הרכב — מהדל ביותר בנגנים, כי הוא הקשה לסיפוק.
    const roles = [...REQUIRED].sort((a, b) => forRole(pool, a).length - forRole(pool, b).length);
    for (const role of roles) {
      const cands = forRole(pool, role);
      for (const g of shuffle([...Array(k).keys()])) {
        const fits = (s: Player) => !inGroup(s, g) && free(g, instFor(s, role));
        // המורה נכנס להרכב אחד; תלמיד — עד maxLoad
        let ok = cands.filter((s) => (load[s.id] || 0) < (s.teacher ? 1 : rules.maxLoad) && fits(s));
        // אין מי שפנוי במכסה? התפקיד חייב להתמלא, ולכן חורגים ממנה
        if (!ok.length) ok = cands.filter(fits);
        if (!ok.length) {
          if (lenient) continue;
          return null;
        }
        // סדר: מי שעוד לא מנגן היום → המורה → מי שיכפיל הרכב
        const rank = (s: Player) => (s.teacher ? 0.5 : load[s.id] || 0);
        const key = (s: Player) => [rank(s), debt(s.id), rolesOf(s).length];
        ok.sort((a, b) => {
          const [ka, kb] = [key(a), key(b)];
          return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
        });
        const head = key(ok[0]);
        const top = ok.filter((s) => key(s).every((v, i) => v === head[i]));
        const pick = shuffle(top)[0];
        place(pick, instFor(pick, role), role, g);
      }
    }

    /* 2. כל השאר — מי שעוד לא מנגן היום. מקבצים לפי כלי ומשרשרים בסבב כדי
       לפזר כלים זהים, ואז ממיינים את התור כולו לפי הפנקס (מיון יציב): מי
       שנשאר בסוף התור הוא מי שיישב, וזה חייב להיות מי שצבר הכי הרבה. */
    const rest = pool.filter((s) => !load[s.id] && !s.teacher && s.instruments.length);
    const buckets = new Map<string, Player[]>();
    rest.forEach((s) => buckets.set(s.instruments[0], [...(buckets.get(s.instruments[0]) || []), s]));
    const lists = shuffle([...buckets.values()].map((b) => shuffle(b).sort((x, y) => debt(x.id) - debt(y.id))));
    const queue: Player[] = [];
    for (let more = true; more; ) {
      more = false;
      for (const b of lists) {
        const s = b.shift();
        if (s) (queue.push(s), (more = true));
      }
    }
    queue.sort((x, y) => debt(x.id) - debt(y.id));

    const bench: string[] = [];
    const filled = (g: number) => groups[g].filter((m) => m.slot === "fill").length;
    const seat = (s: Player, oversize: boolean) => {
      let best = -1;
      let bestInst = "";
      let bestScore = Infinity;
      for (let g = 0; g < k; g++) {
        // תקרת הגודל נאכפת כאן, במקום שמגדיל הרכבים
        if (!oversize && groups[g].length >= rules.maxGroup) continue;
        const fam = groups[g].reduce((a, m) => a + pairN(s.id, m.id), 0);
        s.instruments.forEach((inst, ord) => {
          if (!free(g, inst) || inGroup(s, g)) return;
          // שני כלים מלודיים זהים בהרכב הם מפגש לגיטימי — עונש קל, לא חסימה
          const same = groups[g].filter((m) => m.inst === inst).length;
          const score = filled(g) * 100 + groups[g].length * 25 + same * 12 + fam * 6 + ord * 8 + rnd() * 4;
          if (score < bestScore) (bestScore = score), (best = g), (bestInst = inst);
        });
      }
      return best < 0 ? null : { g: best, inst: bestInst };
    };
    /* כולם מנגנים: מי שאין לו כיסא מתחת לתקרה נכנס להרכב הקטן שיש בו מקום
       לכלי שלו, גם מעל התקרה — כשהמורה בחר מעט הרכבים, זה מה שהוא רוצה.
       ההמלצה (`capacity`) עדיין מחפשת מספר שבו אף הרכב לא עובר את התקרה. */
    for (const s of queue) {
      const spot = seat(s, false) ?? seat(s, true);
      if (!spot) bench.push(s.id);
      else place(s, spot.inst, "fill", spot.g);
    }

    /* המורה, אם לא נדרש לאף כיסא, מצטרף להרכב הקטן ביותר שיש בו מקום לכלי שלו. */
    const teacher = pool.find((s) => s.teacher);
    if (teacher && !load[teacher.id] && teacher.instruments.length) {
      const inst = teacher.instruments[0];
      const open = shuffle([...Array(k).keys()])
        .filter((g) => free(g, inst) && groups[g].length < rules.maxGroup)
        .sort((a, b) => groups[a].length - groups[b].length);
      if (open.length) place(teacher, inst, roleOf(inst), open[0]);
    }

    return { groups: groups.map((g) => [...g].sort(byOrder)), load, bench };
  }

  /**
   * כלי הרמוני שני בהרכב (פסנתר וגיטרה יחד). מכפיל נגן שכבר מנגן, ולכן
   * מותר רק כשהספסל ריק — אחרת זה קיפוח של מי שיושב. לעולם לא חורג
   * מ-maxLoad ומ-maxGroup, והמורה אינו מועמד.
   */
  function enrichHarmony(res: Draw, pool: Player[]): Draw {
    if (!rules.enrich || res.bench.length) return res;
    const groups = res.groups.map((g) => [...g]);
    const load = { ...res.load };
    const order = groups.map((_, i) => i).sort((a, b) => groups[a].length - groups[b].length);
    order.forEach((i) => {
      const g = groups[i];
      if (g.length >= rules.maxGroup) return;
      if (g.filter((m) => roleOf(m.inst) === "harmony").length !== 1) return;
      const cands = pool.filter(
        (s) =>
          !s.teacher &&
          rolesOf(s).includes("harmony") &&
          (load[s.id] || 0) < rules.maxLoad &&
          !g.some((m) => m.id === s.id) &&
          !g.some((m) => m.inst === instFor(s, "harmony"))
      );
      if (!cands.length) return;
      const fam = (s: Player) => g.reduce((a, m) => a + pairN(s.id, m.id), 0);
      const tie = new Map(cands.map((s) => [s.id, rnd()]));
      cands.sort(
        (a, b) =>
          (load[a.id] || 0) - (load[b.id] || 0) ||
          debt(a.id) - debt(b.id) ||
          fam(a) - fam(b) ||
          tie.get(a.id)! - tie.get(b.id)!
      );
      const pick = cands[0];
      g.push({ id: pick.id, inst: instFor(pick, "harmony"), slot: "harmony" });
      g.sort(byOrder);
      load[pick.id] = (load[pick.id] || 0) + 1;
    });
    return { ...res, groups, load };
  }

  const gapCount = (res: Draw) => res.groups.reduce((a, g) => a + missingRoles(g).length, 0);

  /** ניסיונות חלוקה. אם אף אחד לא מספק את החוקים — ניסיונות שמשאירים חורים. */
  const attempt = (pool: Player[], k: number, tries: number) => {
    const out: Draw[] = [];
    for (let t = 0; t < tries; t++) {
      const r = makeGroups(pool, k);
      if (r) out.push(r);
    }
    if (!out.length && pool.length)
      for (let t = 0; t < tries; t++) out.push(makeGroups(pool, k, true)!);
    return out;
  };

  /* ציון: קודם כולם מנגנים, אחר כך צדק (כפל הרכבים למי שצבר מעט), אחר כך גיוון. */
  function cost(res: Draw) {
    let fairness = 0;
    Object.entries(res.load).forEach(([id, n]) => {
      if (n > 1) fairness += debt(id) * 3;
    });
    // יושב אחד יקר מכל שיקול אחר; הצבירה רק שוברת שוויון בין היושבים
    res.bench.forEach((id) => (fairness += BENCH_COST - debt(id) * 3));
    let variety = 0;
    res.groups.forEach((g) => g.forEach((a, i) => g.slice(i + 1).forEach((b) => (variety += pairN(a.id, b.id)))));
    // הרכב בלי תפקיד חיוני קורה רק בחלוקה מקלה — ושם הוא הדבר הראשון למזער
    return gapCount(res) * BENCH_COST * 100 + fairness * 4 + variety + rnd() * 0.5;
  }

  function bestDraw(pool: Player[], k: number, tries = 160): Draw | null {
    const all = attempt(pool, k, tries);
    if (!all.length) return null;
    let best = all[0];
    let bestCost = cost(best);
    for (const r of all.slice(1)) {
      const c = cost(r);
      if (c < bestCost) (best = r), (bestCost = c);
    }
    return enrichHarmony(best, pool);
  }

  /**
   * לכל מספר הרכבים — מה הוא אומר בפועל: גדלים, כפילויות, יושבים, חורים.
   * המורה יכול לבחור כל מספר עד מספר התלמידים; כאן רק מתארים את המחיר.
   */
  function options(pool: Player[], tries = 30): Option[] {
    const top = Math.max(1, pool.filter((s) => !s.teacher).length);
    const out: Option[] = [];
    for (let k = 1; k <= top; k++) {
      let best: Option | null = null;
      // מספרים גדולים הם תיאור בלבד — פחות ניסיונות, כדי שהמסך יגיב מהר בטלפון
      for (const r of attempt(pool, k, k <= 8 ? tries : Math.ceil(tries / 4))) {
        const sizes = r.groups.map((g) => g.length);
        const cand: Option = {
          k,
          bench: r.bench.length,
          biggest: Math.max(...sizes),
          smallest: Math.min(...sizes),
          doubling: Object.values(r.load).filter((n) => n > 1).length,
          gaps: gapCount(r),
          busiest: Math.max(0, ...Object.entries(r.load).filter(([id]) => !P(id).teacher).map(([, n]) => n)),
          fits: false,
        };
        cand.fits = !cand.gaps && !cand.bench && cand.biggest <= rules.maxGroup;
        const better = (a: Option, b: Option) =>
          a.gaps - b.gaps || a.bench - b.bench || a.busiest - b.busiest || a.biggest - b.biggest;
        if (!best || better(cand, best) < 0) best = cand;
      }
      if (best) out.push(best);
    }
    return out;
  }

  /**
   * כמה הרכבים מומלץ: הכי מעט הרכבים שבהם כל ההרכבים שלמים, אף אחד לא
   * יושב בחוץ ואף הרכב לא עובר את התקרה. כל המספרים ב-`options` מותרים;
   * `max` הוא הכי הרבה הרכבים שלמים.
   */
  function capacity(pool: Player[]) {
    const opts = options(pool);
    if (!opts.length) return { max: 1, rec: 1, options: [] as Option[] };
    const whole = opts.filter((o) => !o.gaps);
    const max = whole.length ? Math.max(...whole.map((o) => o.k)) : 1;
    const fit = opts.filter((o) => o.fits);
    const rec = fit.length
      ? Math.min(...fit.map((o) => o.k))
      : opts.reduce((b, o) =>
          o.gaps < b.gaps || (o.gaps === b.gaps && (o.bench < b.bench || (o.bench === b.bench && o.biggest < b.biggest))) ? o : b
        ).k;
    return { max, rec, options: opts };
  }

  /* ==================== נוכחות שמשתנה באמצע השיעור ==================== */

  const seatOf = (id: string, inst: string): Seat => ({ id, inst, slot: roleOf(inst) });

  /**
   * מכניס מאחר לחלוקה קיימת בלי לפרק אותה: כיסא פנוי → כיסא של מי שמנגן
   * בכמה הרכבים → הרכב גדול בנגן אחד. null רק כשבאמת אין שום מקום.
   */
  function addToDraw(res: Draw, id: string) {
    if (res.groups.some((g) => g.some((m) => m.id === id))) return null;
    const student = P(id);
    const load = res.load;
    const famWith = (members: Seat[]) => members.reduce((a, m) => a + pairN(id, m.id), 0);

    const freeSeat = (room: boolean) => {
      let best = -1;
      let bestInst = "";
      let bestScore = Infinity;
      res.groups.forEach((g, i) => {
        if (room !== g.length < rules.maxGroup) return;
        const fam = famWith(g);
        const gaps = missingRoles(g);
        student.instruments.forEach((inst, ord) => {
          if (catalog.unique(inst) && g.some((m) => m.inst === inst)) return;
          const fills = gaps.includes(roleOf(inst)) ? -1000 : 0;
          const same = g.filter((m) => m.inst === inst).length;
          const score = fills + g.length * 25 + same * 12 + fam * 6 + ord * 8;
          if (score < bestScore) (bestScore = score), (best = i), (bestInst = inst);
        });
      });
      return best < 0 ? null : { group: best, inst: bestInst };
    };
    const join = (pick: { group: number; inst: string }, oversize = false) => ({
      draw: {
        ...res,
        groups: res.groups.map((g, i) => (i === pick.group ? [...g, seatOf(id, pick.inst)].sort(byOrder) : g)),
        load: { ...load, [id]: (load[id] || 0) + 1 },
        bench: res.bench.filter((b) => b !== id),
      } as Draw,
      joined: pick.group,
      oversize,
      replaced: null as null | { id: string; was: number; now: number },
    });

    const room = freeSeat(true);
    if (room) return join(room);

    // פינוי כיסא ממי שמנגן ביותר מהרכב אחד — ההרכב נבדק אחרי ההחלפה
    const swaps: { group: number; inst: string; ord: number; out: Seat; busy: number; fam: number; tie: number }[] = [];
    res.groups.forEach((g, i) => {
      g.forEach((m) => {
        if (P(m.id).teacher || (load[m.id] || 0) < 2) return;
        const rest = g.filter((x) => x !== m);
        student.instruments.forEach((inst, ord) => {
          if (catalog.unique(inst) && rest.some((x) => x.inst === inst)) return;
          if (missingRoles([...rest, seatOf(id, inst)]).length) return;
          swaps.push({ group: i, inst, ord, out: m, busy: load[m.id], fam: famWith(rest), tie: rnd() });
        });
      });
    });
    if (swaps.length) {
      swaps.sort((a, b) => b.busy - a.busy || a.fam - b.fam || a.ord - b.ord || a.tie - b.tie);
      const pick = swaps[0];
      const nextLoad = { ...load, [id]: (load[id] || 0) + 1, [pick.out.id]: pick.busy - 1 };
      return {
        draw: {
          ...res,
          groups: res.groups.map((g, i) =>
            i === pick.group ? [...g.filter((x) => x !== pick.out), seatOf(id, pick.inst)].sort(byOrder) : g
          ),
          load: nextLoad,
          bench: res.bench.filter((b) => b !== id),
        } as Draw,
        joined: pick.group,
        oversize: false,
        replaced: { id: pick.out.id, was: pick.busy, now: pick.busy - 1 },
      };
    }

    const over = freeSeat(false);
    return over ? join(over, true) : null;
  }

  function removeFromDraw(res: Draw, id: string): Draw {
    const load = { ...res.load };
    delete load[id];
    return {
      ...res,
      groups: res.groups.map((g) => g.filter((m) => m.id !== id)),
      load,
      bench: res.bench.filter((b) => b !== id),
    };
  }

  const broken = (res: Draw) =>
    res.groups.map((g, i) => ({ group: i, missing: missingRoles(g) })).filter((b) => b.missing.length);

  /** משלים תפקידים חיוניים שנפערו, בלי להזיז אף אחד ממקומו. */
  function repairDraw(res: Draw, pool: Player[]) {
    const groups = res.groups.map((g) => [...g]);
    const load = { ...res.load };
    const filled: { group: number; id: string; inst: string }[] = [];
    groups.forEach((g, i) => {
      for (const role of missingRoles(g)) {
        const able = forRole(pool, role);
        const fits = (s: Player) =>
          able.includes(s) &&
          !g.some((m) => m.id === s.id) &&
          !(catalog.unique(instFor(s, role)) && g.some((m) => m.inst === instFor(s, role))) &&
          !(s.teacher && load[s.id]);
        let cands = pool.filter((s) => fits(s) && (load[s.id] || 0) < rules.maxLoad);
        if (!cands.length) cands = pool.filter(fits); // התפקיד גובר על המכסה
        if (!cands.length) continue;
        const rank = (s: Player) => (s.teacher ? 0.5 : load[s.id] || 0);
        cands.sort((a, b) => rank(a) - rank(b) || debt(a.id) - debt(b.id) || rolesOf(a).length - rolesOf(b).length);
        const pick = cands[0];
        const inst = instFor(pick, role);
        g.push({ id: pick.id, inst, slot: role });
        g.sort(byOrder);
        load[pick.id] = (load[pick.id] || 0) + 1;
        filled.push({ group: i, id: pick.id, inst });
      }
    });
    const draw: Draw = { ...res, groups, load, bench: res.bench.filter((b) => !filled.some((f) => f.id === b)) };
    return { draw, filled, unfixable: broken(draw) };
  }

  /** מי שסומן חסר/נוכח אחרי שכבר יש חלוקה: מעדכנים אותה ואומרים מה קרה. */
  function presenceChanged(res: Draw, id: string, leaving: boolean, poolAfter: Player[]): { draw: Draw; msg: string } {
    const brokenText = (list: { group: number; missing: Role[] }[]) =>
      list.map((b) => `הרכב ${b.group + 1} נשאר בלי ${gapText(b.missing)}`).join(", ");
    if (leaving) {
      const wasIn = res.groups.some((g) => g.some((m) => m.id === id)) || res.bench.includes(id);
      if (!wasIn) return { draw: res, msg: "" };
      const out = repairDraw(removeFromDraw(res, id), poolAfter);
      const fixes = out.filled.map((f) => `${name(f.id)} נכנס ב${f.inst} להרכב ${f.group + 1}`).join(", ");
      return {
        draw: out.draw,
        msg: [
          `${name(id)} יצא מהחלוקה.`,
          fixes && `${fixes} — כדי שההרכב יישאר שלם.`,
          out.unfixable.length &&
            `${brokenText(out.unfixable)}, ואין מי שימלא — עם ${poolAfter.filter((s) => !s.teacher).length} הנוכחים אפשר עד ${capacity(poolAfter).max} הרכבים.`,
        ]
          .filter(Boolean)
          .join(" "),
      };
    }
    const added = addToDraw(res, id);
    if (!added) {
      if (res.groups.some((g) => g.some((m) => m.id === id))) return { draw: res, msg: "" };
      return {
        draw: { ...res, bench: [...res.bench.filter((b) => b !== id), id] },
        msg: `אין כיסא פנוי ל${name(id)} באף הרכב. הוא על הספסל — אפשר להחליף אותו ידנית, או לחלק מחדש.`,
      };
    }
    const rep = added.replaced;
    return {
      draw: added.draw,
      msg:
        `${name(id)} הצטרף להרכב ${added.joined + 1}` +
        (rep ? ` במקום ${name(rep.id)}, שניגן ב-${rep.was} הרכבים ועכשיו ב${rep.now === 1 ? "אחד" : `-${rep.now}`}.` : ".") +
        (added.oversize ? " ההרכב גדול בנגן אחד מהרגיל, כדי שלא יישב בחוץ." : ""),
    };
  }

  /* ============================ עריכה ידנית ============================ */

  /* העריכה הידנית חופשית: המורה מחליט. היא מסרבת רק למה שאין לו משמעות
     (אותו נגן פעמיים באותו הרכב, כלי שהנגן לא מנגן), ואומרת במפורש כל
     בעיה שהעריכה יצרה — הרכב בלי בס, הרכב מעל התקרה, שני מתופפים. */

  /** כל מה שלא תקין בחלוקה, הרכב אחר הרכב. ריק = הכל לפי החוקים. */
  function issues(res: Draw): Issue[] {
    const out: Issue[] = [];
    res.groups.forEach((g, i) => {
      const n = i + 1;
      if (!g.length) return out.push({ group: i, kind: "empty", text: `הרכב ${n} ריק` });
      const miss = missingRoles(g);
      if (miss.length) out.push({ group: i, kind: "missing", text: `הרכב ${n} בלי ${gapText(miss)}` });
      if (g.length > rules.maxGroup)
        out.push({ group: i, kind: "oversize", text: `הרכב ${n}: ${g.length} נגנים, מעל התקרה (${rules.maxGroup})` });
      uniq(g.map((m) => m.inst))
        .filter((inst) => catalog.unique(inst) && g.filter((m) => m.inst === inst).length > 1)
        .forEach((inst) => out.push({ group: i, kind: "double", text: `הרכב ${n}: ${inst} × ${g.filter((m) => m.inst === inst).length}` }));
    });
    const teacherIn = res.groups.filter((g) => g.some((m) => P(m.id).teacher)).length;
    if (teacherIn > 1) out.push({ group: BENCH, kind: "teacher", text: `המורה מופיע ב-${teacherIn} הרכבים` });
    return out;
  }

  /** מה שהעריכה קלקלה — הבעיות שלא היו לפניה */
  const after = (before: Draw, draw: Draw, msg: string): EditResult => {
    const had = new Set(issues(before).map((x) => x.text));
    const fresh = issues(draw).filter((x) => !had.has(x.text) && x.kind !== "empty");
    return { draw, msg: fresh.length ? `${msg} שים לב: ${fresh.map((x) => x.text).join("; ")}.` : msg };
  };

  type At = { g: number; id: string };
  const seatAt = (res: Draw, at: At) => (at.g === BENCH ? undefined : (res.groups[at.g] || []).find((m) => m.id === at.id));
  const present = (res: Draw, id: string) => res.bench.includes(id) || res.groups.some((g) => g.some((m) => m.id === id));

  /**
   * הכלי של נגן שנכנס להרכב: קודם כלי שממלא תפקיד חסר, אחר כך כלי שאין
   * כמותו בהרכב, ובשוויון — הכלי שניגן עד עכשיו ואז לפי סדר הכלים שלו.
   */
  const pickInst = (id: string, current: string | undefined, group: Seat[]) => {
    const p = P(id);
    const list = uniq([current, ...p.instruments, ...(p.instruments.length ? [] : p.backup)].filter((i): i is string => !!i));
    if (!list.length) return undefined;
    const gaps = missingRoles(group);
    const clash = (i: string) => (catalog.unique(i) && group.some((m) => m.inst === i) ? 1 : 0);
    const fills = (i: string) => (gaps.includes(roleOf(i)) ? 0 : 1);
    return list.map((inst, ord) => ({ inst, ord })).sort((a, b) => fills(a.inst) - fills(b.inst) || clash(a.inst) - clash(b.inst) || a.ord - b.ord)[0].inst;
  };

  function swapPlayers(res: Draw, a: At, b: At): EditResult {
    if (a.g === b.g) return { error: "שני הנגנים באותו מקום" };
    if (a.id === b.id) return { error: "זה אותו תלמיד" };
    const inA = a.g === BENCH ? res.bench.includes(a.id) : !!seatAt(res, a);
    const inB = b.g === BENCH ? res.bench.includes(b.id) : !!seatAt(res, b);
    if (!inA || !inB) return { error: "אחד הנגנים כבר לא בחלוקה" };
    const rest = (sel: At) => (sel.g === BENCH ? [] : res.groups[sel.g].filter((m) => m.id !== sel.id));
    const restA = rest(a);
    const restB = rest(b);
    if (b.g !== BENCH && restB.some((m) => m.id === a.id)) return { error: `${name(a.id)} כבר מנגן בהרכב ${b.g + 1}` };
    if (a.g !== BENCH && restA.some((m) => m.id === b.id)) return { error: `${name(b.id)} כבר מנגן בהרכב ${a.g + 1}` };
    const instA = b.g === BENCH ? null : pickInst(a.id, seatAt(res, a)?.inst, restB);
    const instB = a.g === BENCH ? null : pickInst(b.id, seatAt(res, b)?.inst, restA);
    if (b.g !== BENCH && !instA) return { error: `ל${name(a.id)} אין כלי רשום` };
    if (a.g !== BENCH && !instB) return { error: `ל${name(b.id)} אין כלי רשום` };
    const groups = res.groups.map((g, i) => {
      if (i === a.g) return [...restA, seatOf(b.id, instB!)].sort(byOrder);
      if (i === b.g) return [...restB, seatOf(a.id, instA!)].sort(byOrder);
      return g;
    });
    const load = { ...res.load };
    let bench = res.bench;
    const toBench = (into: string, out: string) => {
      load[into] = (load[into] || 0) + 1;
      load[out] = (load[out] || 0) - 1;
      if (!load[out]) delete load[out];
      // מי שעדיין מנגן בהרכב אחר רק מפנה כיסא — הוא לא עולה לספסל
      bench = res.bench.filter((s) => s !== into);
      if (!load[out] && !P(out).teacher) bench = [...bench, out];
    };
    if (a.g === BENCH) toBench(a.id, b.id);
    if (b.g === BENCH) toBench(b.id, a.id);
    return after(res, { ...res, groups, load, bench }, `${name(a.id)} ו${name(b.id)} הוחלפו.`);
  }

  function addPlayer(res: Draw, id: string, to: number): EditResult {
    if (!present(res, id)) return { error: "הנגן כבר לא בחלוקה" };
    if (!res.groups[to]) return { error: "אין הרכב כזה" };
    if (res.groups[to].some((m) => m.id === id)) return { error: `${name(id)} כבר מנגן בהרכב ${to + 1}` };
    const n = res.load[id] || 0;
    const current = res.groups.flat().find((m) => m.id === id)?.inst;
    const inst = pickInst(id, current, res.groups[to]);
    if (!inst) return { error: `ל${name(id)} אין כלי רשום` };
    return after(
      res,
      {
        ...res,
        groups: res.groups.map((g, i) => (i === to ? [...g, seatOf(id, inst)].sort(byOrder) : g)),
        load: { ...res.load, [id]: n + 1 },
        bench: res.bench.filter((x) => x !== id),
      },
      n ? `${name(id)} מנגן עכשיו גם בהרכב ${to + 1} (${inst}) — ×${n + 1}.` : `${name(id)} הצטרף להרכב ${to + 1} (${inst}).`
    );
  }

  function movePlayer(res: Draw, from: At, to: number): EditResult {
    if (from.g === BENCH) return addPlayer(res, from.id, to);
    if (from.g === to) return { error: "הוא כבר בהרכב הזה" };
    const s = seatAt(res, from);
    if (!s) return { error: "הנגן כבר לא בחלוקה" };
    if (!res.groups[to]) return { error: "אין הרכב כזה" };
    if (res.groups[to].some((m) => m.id === s.id)) return { error: `${name(s.id)} כבר מנגן בהרכב ${to + 1}` };
    const inst = pickInst(s.id, s.inst, res.groups[to])!;
    return after(
      res,
      {
        ...res,
        groups: res.groups.map((g, i) =>
          i === from.g ? g.filter((m) => m.id !== s.id) : i === to ? [...g, seatOf(s.id, inst)].sort(byOrder) : g
        ),
      },
      `${name(s.id)} עבר מהרכב ${from.g + 1} להרכב ${to + 1} (${inst}).`
    );
  }

  function removePlayer(res: Draw, at: At): EditResult {
    if (at.g === BENCH) return { error: "הוא כבר על הספסל" };
    const s = seatAt(res, at);
    if (!s) return { error: "הנגן כבר לא בחלוקה" };
    const n = (res.load[at.id] || 1) - 1;
    const load = { ...res.load };
    if (n > 0) load[at.id] = n;
    else delete load[at.id];
    return after(
      res,
      {
        ...res,
        groups: res.groups.map((g, i) => (i === at.g ? g.filter((m) => m.id !== at.id) : g)),
        load,
        bench: n > 0 || P(at.id).teacher ? res.bench : [...res.bench, at.id],
      },
      `${name(at.id)} יצא מהרכב ${at.g + 1}` + (n > 0 ? " ונשאר בהרכב אחר." : P(at.id).teacher ? "." : " ועבר לספסל.")
    );
  }

  /** החלפת כלי בהרכב. כלי משני מותר כאן — זו החלטת מורה, לא הגרלה. */
  function changeInstrument(res: Draw, at: At, inst: string): EditResult {
    const s = seatAt(res, at);
    if (!s) return { error: "הנגן כבר לא בהרכב" };
    if (inst === s.inst) return { error: `${name(s.id)} כבר מנגן ב${inst}` };
    const p = P(s.id);
    if (![...p.instruments, ...p.backup].includes(inst)) return { error: `${p.name} לא מנגן ב${inst}` };
    const rest = res.groups[at.g].filter((m) => m.id !== at.id);
    const next = [...rest, seatOf(s.id, inst)].sort(byOrder);
    return after(
      res,
      { ...res, groups: res.groups.map((g, i) => (i === at.g ? next : g)) },
      `${p.name} עבר מ${s.inst} ל${inst} בהרכב ${at.g + 1}.`
    );
  }

  /** הרכב ריק נוסף בסוף — ממלאים אותו בהעברות */
  function addGroup(res: Draw): EditResult {
    return {
      draw: { ...res, groups: [...res.groups, []], leaders: res.leaders ? [...res.leaders, null] : undefined },
      msg: `נוסף הרכב ${res.groups.length + 1}. העבר אליו נגנים, או הוסף מהספסל.`,
    };
  }

  /** מחיקת הרכב: מי שלא מנגן בהרכב אחר יורד לספסל. */
  function removeGroup(res: Draw, g: number): EditResult {
    if (!res.groups[g]) return { error: "אין הרכב כזה" };
    if (res.groups.length === 1) return { error: "זה ההרכב היחיד — אפשר לנקות את החלוקה" };
    const load = { ...res.load };
    const benched: string[] = [];
    res.groups[g].forEach((m) => {
      load[m.id] = (load[m.id] || 1) - 1;
      if (load[m.id] > 0) return;
      delete load[m.id];
      if (!P(m.id).teacher) benched.push(m.id);
    });
    const draw: Draw = {
      ...res,
      groups: res.groups.filter((_, i) => i !== g),
      load,
      bench: [...res.bench, ...benched.filter((id) => !res.bench.includes(id))],
      leaders: res.leaders?.filter((_, i) => i !== g),
    };
    return {
      draw,
      msg:
        `הרכב ${g + 1} נמחק` +
        (benched.length ? ` — ${benched.map(name).join(", ")} ${benched.length > 1 ? "עברו" : "עבר"} לספסל.` : ".") +
        (g < res.groups.length - 1 ? " ההרכבים שאחריו מוספרו מחדש." : ""),
    };
  }

  /* ============================ תלמיד מוביל ============================ */

  /**
   * מוביל לכל הרכב. נבחר מי שהוביל הכי מעט עד היום (הגרלה בין השווים),
   * ולכן אף אחד לא מוביל שוב לפני שכל האחרים הובילו. מוביל קיים שעדיין
   * בהרכב נשאר; `reroll` מגריל את כולם מחדש.
   */
  function pickLeaders(res: Draw, reroll = false): (string | null)[] {
    const taken = new Set<string>();
    const out: (string | null)[] = res.groups.map((g, i) => {
      const cur = !reroll && res.leaders?.[i];
      if (cur && g.some((m) => m.id === cur) && !taken.has(cur)) return taken.add(cur), cur;
      return null;
    });
    // הרכבים קטנים קודם: יש להם הכי מעט מועמדים
    const order = res.groups.map((_, i) => i).sort((a, b) => res.groups[a].length - res.groups[b].length);
    for (const i of order) {
      if (out[i]) continue;
      const cands = uniq(res.groups[i].map((m) => m.id)).filter((id) => !P(id).teacher && !taken.has(id));
      if (!cands.length) continue;
      const leads = (id: string) => history.leads[id] || 0;
      const min = Math.min(...cands.map(leads));
      const pick = shuffle(cands.filter((id) => leads(id) === min))[0];
      out[i] = pick;
      taken.add(pick);
    }
    return out;
  }

  return {
    forRole,
    instFor,
    emptyRoles,
    missingRoles,
    makeGroups,
    enrichHarmony,
    cost,
    bestDraw,
    options,
    capacity,
    addToDraw,
    removeFromDraw,
    repairDraw,
    presenceChanged,
    swapPlayers,
    addPlayer,
    movePlayer,
    removePlayer,
    changeInstrument,
    addGroup,
    removeGroup,
    issues,
    pickLeaders,
    name,
    player: P,
    MIN_GROUP,
  };
}

export type Engine = ReturnType<typeof createEngine>;

/** החלוקה כטקסט פשוט — לשיתוף או להדבקה */
export function drawText(res: Draw, title: string, name: (id: string) => string) {
  const lines = [title];
  res.groups.forEach((g, i) => {
    lines.push("", `הרכב ${i + 1}`);
    g.forEach((m) => lines.push(`${name(m.id)} — ${m.inst}${res.leaders?.[i] === m.id ? " ★ מוביל" : ""}`));
  });
  if (res.bench.length) lines.push("", `יושבים: ${res.bench.map(name).join(", ")}`);
  return lines.join("\n");
}
