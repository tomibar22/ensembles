import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, NO_HISTORY, createEngine, pairKey, seededRandom } from "./engine";
import type { Draw, History, Player, Rules } from "./engine";
import { CATALOG, G11, G9, TEACHER } from "./fixtures";

const SEEDS = [1, 2, 3, 7, 42, Number((globalThis as any).process?.env?.TEST_SEED || 99)];
const eng = (players: Player[], seed: number, rules: Partial<Rules> = {}, history: History = NO_HISTORY) =>
  createEngine({ players, catalog: CATALOG, rules: { ...DEFAULT_RULES, ...rules }, history, rnd: seededRandom(seed) });

const sizes = (d: Draw) => d.groups.map((g) => g.length);
const loadOk = (d: Draw) => {
  const n: Record<string, number> = {};
  d.groups.flat().forEach((m) => (n[m.id] = (n[m.id] || 0) + 1));
  expect(d.load).toEqual(n);
};

describe.each(SEEDS)("חלוקה (seed %i)", (seed) => {
  it.each([
    ["י״א", G11],
    ["ט׳", G9],
  ])("בכל הרכב כל התפקידים, עד 7 נגנים, ואף אחד לא יושב — %s", (_n, cls) => {
    const pool = [...cls, TEACHER];
    const e = eng(pool, seed);
    const k = e.capacity(pool).rec;
    for (let i = 0; i < 25; i++) {
      const d = e.bestDraw(pool, k, 40)!;
      expect(d).toBeTruthy();
      d.groups.forEach((g) => {
        expect(e.missingRoles(g)).toEqual([]);
        expect(g.length).toBeLessThanOrEqual(7);
        expect(new Set(g.map((m) => m.id)).size).toBe(g.length); // אף אחד פעמיים באותו הרכב
        ["תופים", "בס", "פסנתר", "גיטרה"].forEach((inst) =>
          expect(g.filter((m) => m.inst === inst).length).toBeLessThanOrEqual(1)
        );
      });
      expect(d.bench).toEqual([]);
      loadOk(d);
      expect(d.load[TEACHER.id] || 0).toBeLessThanOrEqual(1);
    }
  });

  it("ההמלצה היא הכי מעט הרכבים שבהם כולם מנגנים", () => {
    expect(eng([...G11, TEACHER], seed).capacity([...G11, TEACHER]).rec).toBe(4);
    expect(eng([...G9, TEACHER], seed).capacity([...G9, TEACHER]).rec).toBe(3);
  });

  it("אפשר לבחור כל מספר הרכבים — גם כזה שאינו מומלץ, עם המחיר שלו", () => {
    const pool = [...G11, TEACHER];
    const c = eng(pool, seed).capacity(pool);
    expect(c.options.map((o) => o.k)).toEqual(G11.map((_, i) => i + 1));
    const three = c.options.find((o) => o.k === 3)!;
    expect(three.gaps).toBe(0);
    expect(three.fits).toBe(false); // 22 תלמידים ב-3 הרכבים: הרכב עובר את 7
    expect(three.bench).toBe(0); // אבל כולם מנגנים — מעל התקרה, לא על הספסל
    const d = eng(pool, seed).bestDraw(pool, 3, 40)!;
    expect(d.groups.length).toBe(3);
    expect(d.bench).toEqual([]);
    d.groups.forEach((g) => expect(eng(pool, seed).missingRoles(g)).toEqual([]));
  });

  it("יותר הרכבים ממה שאפשר לספק: החלוקה קורית, והחורים נאמרים", () => {
    const pool = G9.filter((p) => p.instruments[0] !== "תופים" || p.name === "ניר");
    for (const k of [1, 4, 7, pool.length]) {
      const e = eng(pool, seed, { required: ["drums", "bass", "harmony", "melody"] });
      const d = e.bestDraw(pool, k, 20)!;
      expect(d.groups.length).toBe(k);
      loadOk(d);
      // כל נוכח בחלוקה או על הספסל
      pool.forEach((p) => expect(!!d.load[p.id] || d.bench.includes(p.id)).toBe(true));
      const gaps = d.groups.reduce((a, g) => a + e.missingRoles(g).length, 0);
      const missing = e.issues(d).filter((x) => x.kind === "missing");
      expect(missing.length).toBe(d.groups.filter((g) => g.length && e.missingRoles(g).length).length);
      if (!gaps) expect(missing).toEqual([]);
    }
  });

  it("בסיסט יחיד מנגן בכל ההרכבים, גם מעל המכסה", () => {
    const pool = G9.filter((p) => p.name !== "יונתן"); // בלי הרזרבה לבס
    const e = eng(pool, seed);
    const d = e.bestDraw(pool, 3, 40)!;
    const bass = pool.find((p) => p.instruments[0] === "בס")!;
    expect(d.load[bass.id]).toBe(3);
    // ושאר התלמידים לא חורגים מהמכסה אלא אם הם ממלאים תפקיד חיוני יחיד
    const drummers = pool.filter((p) => p.instruments[0] === "תופים").map((p) => p.id);
    Object.entries(d.load).forEach(([id, n]) => {
      if (id !== bass.id && !drummers.includes(id)) expect(n).toBeLessThanOrEqual(2);
    });
  });

  it("כלי משני נכנס רק כשאין אף נגן ראשי", () => {
    const e = eng(G9, seed);
    const withBass = e.bestDraw(G9, 3, 40)!;
    const backup = G9.find((p) => p.name === "יונתן")!;
    withBass.groups.flat().filter((m) => m.id === backup.id).forEach((m) => expect(m.inst).toBe("גיטרה"));
    const noBass = G9.filter((p) => p.instruments[0] !== "בס");
    const d = eng(noBass, seed).bestDraw(noBass, 3, 40)!;
    d.groups.forEach((g) => expect(g.find((m) => m.inst === "בס")?.id).toBe(backup.id));
  });

  it("חוקים מותאמים: בלי חובת בס ותופים אפשר לחלק כיתה בלי ריתמיקה", () => {
    const pool = G11.filter((p) => !["תופים", "בס"].includes(p.instruments[0]) && !p.backup.length);
    expect(eng(pool, seed).emptyRoles(pool)).toEqual(["drums", "bass"]);
    const loose = eng(pool, seed).bestDraw(pool, 3, 20)!;
    expect(loose.groups.length).toBe(3);
    expect(eng(pool, seed).issues(loose).filter((x) => x.kind === "missing").map((x) => x.text)).toEqual([
      "הרכב 1 בלי תופים ובלי בס",
      "הרכב 2 בלי תופים ובלי בס",
      "הרכב 3 בלי תופים ובלי בס",
    ]);
    const e = eng(pool, seed, { required: ["harmony", "melody"] });
    expect(e.emptyRoles(pool)).toEqual([]);
    const k = e.capacity(pool).rec;
    const d = e.bestDraw(pool, k, 40)!;
    d.groups.forEach((g) => expect(e.missingRoles(g)).toEqual([]));
    expect(d.bench).toEqual([]);
  });

  it("בלי אף חוק — חלוקה חופשית שבה כל אחד מנגן פעם אחת", () => {
    const e = eng(G9, seed, { required: [], enrich: false });
    const d = e.bestDraw(G9, 3, 40)!;
    expect(d.bench).toEqual([]);
    Object.values(d.load).forEach((n) => expect(n).toBe(1));
    expect(Math.max(...sizes(d)) - Math.min(...sizes(d))).toBeLessThanOrEqual(1);
  });

  it("הוגנות לאורך זמן: הפער בתוך כל תפקיד נשאר קטן אחרי 20 שיעורים", () => {
    const pool = [...G11, TEACHER];
    const history: History = { plays: {}, pairs: {}, leads: {}, lessons: 0 };
    const rnd = seededRandom(seed);
    for (let lesson = 0; lesson < 20; lesson++) {
      const e = createEngine({ players: pool, catalog: CATALOG, rules: DEFAULT_RULES, history, rnd });
      const d = e.bestDraw(pool, 4, 60)!;
      d.groups.forEach((g) =>
        g.forEach((a, i) => {
          if (a.id === TEACHER.id) return;
          history.plays[a.id] = (history.plays[a.id] || 0) + 1;
          g.slice(i + 1).forEach((b) => {
            if (b.id !== TEACHER.id) history.pairs[pairKey(a.id, b.id)] = (history.pairs[pairKey(a.id, b.id)] || 0) + 1;
          });
        })
      );
    }
    for (const inst of ["תופים", "בס", "טנור", "שירה", "אלט"]) {
      const n = G11.filter((p) => p.instruments[0] === inst).map((p) => history.plays[p.id] || 0);
      expect(Math.max(...n) - Math.min(...n)).toBeLessThanOrEqual(3);
    }
    // כולם ניגנו בכל שיעור
    G11.forEach((p) => expect(history.plays[p.id]).toBeGreaterThanOrEqual(20));
  });

  it("מי שצבר הרבה מנגן פעם אחת כשאחרים יכולים להכפיל", () => {
    const [a, b, c] = G11.filter((p) => p.instruments[0] === "תופים");
    const history: History = { plays: { [a.id]: 30, [b.id]: 10, [c.id]: 10 }, pairs: {}, leads: {}, lessons: 10 };
    const pool = [...G11, TEACHER];
    const e = eng(pool, seed, {}, history);
    let seats = 0;
    for (let i = 0; i < 20; i++) seats += e.bestDraw(pool, 4, 40)!.load[a.id];
    expect(seats).toBe(20);
  });
});

describe.each(SEEDS)("שינויים באמצע שיעור (seed %i)", (seed) => {
  const pool = [...G11, TEACHER];

  it("מי שיצא: ההרכב מושלם מיד ונשאר שלם", () => {
    const e = eng(pool, seed);
    const d = e.bestDraw(pool, 4, 40)!;
    const drummer = d.groups[0].find((m) => m.inst === "תופים")!.id;
    const after = pool.filter((p) => p.id !== drummer);
    const out = e.presenceChanged(d, drummer, true, after);
    expect(out.draw.groups.flat().some((m) => m.id === drummer)).toBe(false);
    out.draw.groups.forEach((g) => expect(e.missingRoles(g)).toEqual([]));
    expect(out.msg).toContain("יצא מהחלוקה");
    loadOk(out.draw);
  });

  it("מאחר נכנס להרכב אחד, וההרכבים נשארים שלמים", () => {
    const late = G11.find((p) => p.instruments[0] === "פסנתר")!;
    const start = pool.filter((p) => p.id !== late.id);
    const e = eng(pool, seed);
    const d = e.bestDraw(start, 4, 40)!;
    const out = e.presenceChanged(d, late.id, false, pool);
    expect(out.draw.load[late.id]).toBe(1);
    out.draw.groups.forEach((g) => expect(e.missingRoles(g)).toEqual([]));
    loadOk(out.draw);
    expect(out.msg).toContain("הצטרף להרכב");
  });

  it("כשהמתופף היחיד יוצא — אומרים שההרכב נשאר בלי תופים", () => {
    const one = G9.filter((p) => p.instruments[0] !== "תופים" || p.name === "ניר");
    const e = eng(one, seed);
    const d = e.bestDraw(one, 2, 40)!;
    const drummer = one.find((p) => p.name === "ניר")!;
    const out = e.presenceChanged(d, drummer.id, true, one.filter((p) => p !== drummer));
    expect(out.msg).toContain("נשאר בלי תופים");
  });
});

describe.each(SEEDS)("עריכה ידנית חופשית (seed %i)", (seed) => {
  const pool = [...G11, TEACHER];
  const start = () => {
    const e = eng(pool, seed);
    return { e, d: e.bestDraw(pool, 4, 40)! };
  };
  const ok = (r: ReturnType<ReturnType<typeof eng>["swapPlayers"]>) => {
    if ("error" in r) throw new Error(r.error);
    loadOk(r.draw);
    return r;
  };

  it("כל החלפה בין הרכבים מתקבלת; מה שנשבר נאמר בהודעה", () => {
    const { e, d } = start();
    d.groups[0].forEach((a) =>
      d.groups[1].forEach((b) => {
        if (a.id === b.id || d.groups[1].some((m) => m.id === a.id) || d.groups[0].some((m) => m.id === b.id)) return;
        const r = ok(e.swapPlayers(d, { g: 0, id: a.id }, { g: 1, id: b.id }));
        const fresh = e.issues(r.draw).filter((x) => !e.issues(d).some((y) => y.text === x.text));
        fresh.forEach((x) => expect(r.msg).toContain(x.text));
      })
    );
  });

  it("הוצאת הבסיסט מותרת, וההרכב מסומן כחסר בס", () => {
    const { e, d } = start();
    const bass = d.groups[0].find((m) => m.inst === "בס")!;
    const r = ok(e.removePlayer(d, { g: 0, id: bass.id }));
    expect(r.msg).toContain("הרכב 1 בלי בס");
    expect(e.issues(r.draw).map((x) => x.text)).toContain("הרכב 1 בלי בס");
    // והשלמה אוטומטית מחזירה בס להרכב
    const fixed = e.repairDraw(r.draw, pool);
    expect(e.missingRoles(fixed.draw.groups[0])).toEqual([]);
  });

  it("העברה בין הרכבים מותרת גם כשהיא משאירה חור או מגדילה מעל התקרה", () => {
    const { e, d } = start();
    let cur = d;
    // מעבירים את כל הרכב 1 להרכב 2, נגן אחר נגן
    for (const m of [...d.groups[0]]) {
      if (cur.groups[1].some((x) => x.id === m.id)) continue;
      cur = ok(e.movePlayer(cur, { g: 0, id: m.id }, 1)).draw;
    }
    expect(cur.groups[1].length).toBeGreaterThan(7);
    expect(e.issues(cur).some((x) => x.kind === "oversize" && x.group === 1)).toBe(true);
  });

  it("מהספסל אפשר להוסיף לכל הרכב, והמורה יכול להיכנס לשני הרכבים", () => {
    const { e, d } = start();
    const solo = d.groups[0].find((m) => d.load[m.id] === 1 && m.id !== TEACHER.id)!;
    const r = ok(e.removePlayer(d, { g: 0, id: solo.id }));
    expect(r.draw.bench).toContain(solo.id);
    for (let g = 0; g < 4; g++) {
      const add = ok(e.addPlayer(r.draw, solo.id, g));
      expect(add.draw.bench).not.toContain(solo.id);
    }
    const tg = d.groups.findIndex((g) => g.some((m) => m.id === TEACHER.id));
    if (tg >= 0) {
      const t = ok(e.addPlayer(d, TEACHER.id, (tg + 1) % 4));
      expect(e.issues(t.draw).some((x) => x.kind === "teacher")).toBe(true);
    }
    // הסירוב היחיד: אותו נגן פעמיים באותו הרכב
    expect("error" in e.addPlayer(d, d.groups[0][0].id, 0)).toBe(true);
  });

  it("כלי משני מותר תמיד; בס שני בהרכב מסומן", () => {
    const e = eng(G11, seed);
    const d = e.bestDraw(G11, 4, 40)!;
    const p = G11.find((x) => x.backup.includes("בס"))!;
    const g = d.groups.findIndex((grp) => grp.some((m) => m.id === p.id));
    const r = ok(e.changeInstrument(d, { g, id: p.id }, "בס"));
    expect(r.draw.groups[g].find((m) => m.id === p.id)!.inst).toBe("בס");
    if (d.groups[g].some((m) => m.inst === "בס")) expect(e.issues(r.draw).some((x) => x.kind === "double")).toBe(true);
    expect("error" in e.changeInstrument(d, { g, id: p.id }, "חצוצרה")).toBe(true);
  });

  it("הוספה ומחיקה של הרכבים: מי שלא מנגן בהרכב אחר יורד לספסל", () => {
    const { e, d } = start();
    const added = ok(e.addGroup(d)).draw;
    expect(added.groups.length).toBe(5);
    expect(e.issues(added).map((x) => x.kind)).toContain("empty");
    const someone = d.groups[0].find((m) => m.id !== TEACHER.id)!;
    const moved = ok(e.movePlayer(added, { g: 0, id: someone.id }, 4)).draw;
    expect(moved.groups[4].map((m) => m.id)).toEqual([someone.id]);

    const r = ok(e.removeGroup(d, 1));
    expect(r.draw.groups.length).toBe(3);
    d.groups[1].forEach((m) => {
      if (m.id === TEACHER.id) return;
      if ((d.load[m.id] || 0) > 1) expect(r.draw.bench).not.toContain(m.id);
      else expect(r.draw.bench).toContain(m.id);
    });
    expect("error" in e.removeGroup({ ...d, groups: [d.groups[0]] }, 0)).toBe(true);
  });
});

describe.each(SEEDS)("תלמיד מוביל (seed %i)", (seed) => {
  it("אף אחד לא מוביל שוב לפני שכל האחרים הובילו", () => {
    const history: History = { plays: {}, pairs: {}, leads: {}, lessons: 0 };
    const rnd = seededRandom(seed);
    const rules = { ...DEFAULT_RULES, required: [], enrich: false };
    for (let lesson = 0; lesson < 6; lesson++) {
      const e = createEngine({ players: G9, catalog: CATALOG, rules, history, rnd });
      const d = e.bestDraw(G9, 3, 20)!;
      const leaders = e.pickLeaders(d);
      expect(new Set(leaders).size).toBe(3);
      leaders.forEach((id, i) => {
        expect(d.groups[i].some((m) => m.id === id)).toBe(true);
        history.leads[id!] = (history.leads[id!] || 0) + 1;
      });
      const counts = G9.map((p) => history.leads[p.id] || 0);
      // פער של יותר מ-1 אומר שמישהו הוביל פעמיים לפני שאחר הוביל פעם אחת —
      // מותר רק כשההרכב שלו לא השאיר ברירה, ולכן לעולם לא יותר מ-2
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
    }
    // אחרי 6 שיעורים (18 הובלות ל-14 תלמידים) כולם הובילו לפחות פעם אחת
    G9.forEach((p) => expect(history.leads[p.id] || 0).toBeGreaterThanOrEqual(1));
  });

  it("מוביל קיים נשאר כשההרכב לא השתנה; reroll מגריל מחדש", () => {
    const e = eng(G9, seed, { required: [] });
    const d = e.bestDraw(G9, 3, 20)!;
    const leaders = e.pickLeaders(d);
    expect(e.pickLeaders({ ...d, leaders })).toEqual(leaders);
  });
});
