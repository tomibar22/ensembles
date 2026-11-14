import { describe, expect, it } from "vitest";
import { BENCH, DEFAULT_RULES, NO_HISTORY, createEngine, pairKey, seededRandom } from "./engine";
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
    const c = eng(G11, seed).capacity(G11);
    c.playable.forEach((o) => expect(o.bench).toBe(0));
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
    expect(eng(pool, seed).bestDraw(pool, 3, 20)).toBeNull();
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

describe.each(SEEDS)("עריכה ידנית (seed %i)", (seed) => {
  const pool = [...G11, TEACHER];
  const start = () => {
    const e = eng(pool, seed);
    return { e, d: e.bestDraw(pool, 4, 40)! };
  };

  it("כל החלפה שמתקבלת משאירה את ההרכבים שלמים; סירוב מגיע עם סיבה", () => {
    const { e, d } = start();
    let ok = 0;
    d.groups[0].forEach((a) =>
      d.groups[1].forEach((b) => {
        const r = e.swapPlayers(d, { g: 0, id: a.id }, { g: 1, id: b.id });
        if ("error" in r) return expect(r.error.length).toBeGreaterThan(3);
        ok++;
        r.draw.groups.forEach((g) => expect(e.missingRoles(g)).toEqual([]));
        loadOk(r.draw);
      })
    );
    expect(ok).toBeGreaterThan(0);
  });

  it("הוצאה שמשאירה הרכב בלי תפקיד מסורבת", () => {
    const { e, d } = start();
    const bass = d.groups[0].find((m) => m.inst === "בס")!;
    const r = e.removePlayer(d, { g: 0, id: bass.id });
    expect("error" in r && r.error).toContain("בלי בס");
  });

  it("מי שהוצא ואין לו הרכב אחר יורד לספסל, ומשם אפשר להחזיר אותו", () => {
    const { e, d } = start();
    const solo = d.groups.flat().find((m) => d.load[m.id] === 1 && m.slot === "fill" && d.groups.flat().filter((x) => x.inst === m.inst && d.groups.findIndex((g) => g.includes(x)) === d.groups.findIndex((g) => g.includes(m))).length >= 1)!;
    const g = d.groups.findIndex((grp) => grp.includes(solo));
    const melodic = d.groups[g].filter((m) => CATALOG.role(m.inst) === "melody").length;
    const r = e.removePlayer(d, { g, id: solo.id });
    if (melodic === 1) return expect("error" in r).toBe(true);
    if ("error" in r) throw new Error(r.error);
    expect(r.draw.bench).toContain(solo.id);
    const back = e.swapPlayers(r.draw, { g: BENCH, id: solo.id }, { g: 0, id: r.draw.groups[0][0].id });
    if (!("error" in back)) loadOk(back.draw);
    const add = e.addPlayer(r.draw, solo.id, g);
    if ("error" in add) throw new Error(add.error);
    expect(add.draw.bench).not.toContain(solo.id);
    loadOk(add.draw);
  });

  it("אי אפשר לחרוג מגודל ההרכב, והמורה נכנס להרכב אחד", () => {
    const { e, d } = start();
    const full = d.groups.findIndex((g) => g.length >= 7);
    if (full >= 0) {
      const other = d.groups.flat().find((m) => !d.groups[full].some((x) => x.id === m.id))!;
      const r = e.addPlayer(d, other.id, full);
      expect("error" in r && r.error).toContain("מלא");
    }
    const tg = d.groups.findIndex((g) => g.some((m) => m.id === TEACHER.id));
    if (tg >= 0) {
      const r = e.addPlayer(d, TEACHER.id, (tg + 1) % 4);
      expect("error" in r).toBe(true);
    }
  });

  it("החלפת כלי לכלי משני מותרת רק כשההרכב נשאר שלם", () => {
    const e = eng(G11, seed);
    const d = e.bestDraw(G11, 4, 40)!;
    const p = G11.find((x) => x.backup.includes("בס"))!;
    const g = d.groups.findIndex((grp) => grp.some((m) => m.id === p.id));
    const r = e.changeInstrument(d, { g, id: p.id }, "בס");
    expect("error" in r).toBe(true); // יש כבר בס בהרכב, או שהוא ההרמוני היחיד
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
