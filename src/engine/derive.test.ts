import { describe, expect, it } from "vitest";
import { buildHistory, displayNames, docBlocks, effectiveFeatures, mediaFilename, normTitle, shortDate, trackRows } from "./derive";
import type { Lesson, Mark, Participant, Project, ProjectType } from "../data/types";

const part = (id: string, first: string, last = "", extra: Partial<Participant> = {}): Participant => ({
  id, project_id: "p", first_name: first, last_name: last, instrument: "אלט", instrument2: "", notes: "",
  active: true, joined_on: null, sort: 0, created_at: "", ...extra,
});
const lesson = (date: string, description = ""): Lesson => ({ id: `p:${date}`, project_id: "p", date, description, created_at: "", updated_at: "" });
const mark = (date: string, pid: string, m: Partial<Mark>): Mark => ({
  lesson_id: `p:${date}`, participant_id: pid, project_id: "p", status: null, justified: false, no_homework: false, ...m,
});
const project = (extra: Partial<Project> = {}): Project => ({
  id: "p", name: "יא 26-27", type_id: "school_class", grade: "יא", active: true, features: {}, settings: {}, attrs: {},
  baseline: {}, drive: {}, notes: "", sort: 0, created_at: "", ...extra,
});
const GRADING = { start: 100, absent: 5, late: 3, homework: 5 };

describe("ציון ומשמעת", () => {
  const parts = [part("a", "דנה"), part("b", "גיל"), part("c", "נוי", "", { joined_on: "2026-10-12" })];
  const lessons = [lesson("2026-09-07"), lesson("2026-09-14"), lesson("2026-10-12"), lesson("2026-10-19")];
  const marks = [
    mark("2026-09-07", "a", { status: "absent" }),
    mark("2026-09-14", "a", { status: "late" }),
    mark("2026-10-12", "a", { no_homework: true }),
    mark("2026-09-07", "b", { status: "absent", justified: true }),
    mark("2026-09-14", "b", { status: "late", justified: true }),
    mark("2026-09-07", "c", { status: "absent" }), // לפני שהצטרפה — לא נספר
  ];

  it("100 פחות 5 לחיסור, 3 לאיחור, 5 לשיעורי בית", () => {
    const [a] = trackRows(parts, lessons, marks, GRADING, {});
    expect(a).toMatchObject({ absent: 1, late: 1, homework: 1, grade: 87, lessons: 4, rate: 75 });
  });
  it("חיסור ואיחור מוצדקים אינם מורידים ציון, אבל נספרים בנפרד", () => {
    const b = trackRows(parts, lessons, marks, GRADING, {})[1];
    expect(b).toMatchObject({ absent: 0, absentJustified: 1, late: 0, lateJustified: 1, grade: 100 });
  });
  it("מי שהצטרף באמצע השנה נמדד רק מהשיעורים שלו", () => {
    const c = trackRows(parts, lessons, marks, GRADING, {})[2];
    expect(c).toMatchObject({ lessons: 2, absent: 0, grade: 100, rate: 100 });
  });
  it("ערכי הציון ניתנים להגדרה, והתקופה מסננת שיעורים", () => {
    const a = trackRows(parts, lessons, marks, { start: 90, absent: 10, late: 1, homework: 2 }, {}, { from: "2026-09-14" })[0];
    expect(a).toMatchObject({ absent: 0, late: 1, homework: 1, grade: 87, lessons: 3 });
  });
  it("בלי שיעורים אין אחוז נוכחות", () => {
    expect(trackRows(parts, [], [], GRADING, {})[0].rate).toBeNull();
  });
});

describe("היסטוריית חלוקות", () => {
  it("נבנית מעל הצבירה שהועברה, בלי השיעור הנוכחי ובלי המורה", () => {
    const p = project({ baseline: { plays: { a: 4 }, pairs: { "a|b": 2 }, lessons: 5 } });
    const draw = (lesson_id: string) => ({
      lesson_id, project_id: "p", updated_at: "",
      data: { k: 1, rules: {} as any, bench: [], load: {}, leaders: ["b"],
        groups: [[{ id: "a", inst: "אלט", slot: "fill" as const }, { id: "b", inst: "בס", slot: "bass" as const }, { id: "__teacher", inst: "פסנתר", slot: "harmony" as const }]] },
    });
    const h = buildHistory(p, [draw("p:1"), draw("p:2")], "p:2");
    expect(h).toEqual({ plays: { a: 5, b: 1 }, pairs: { "a|b": 3 }, leads: { b: 1 }, lessons: 6 });
  });
});

describe("עזרים", () => {
  it("שם משפחה מוצג רק כששניים חולקים שם פרטי", () => {
    const n = displayNames([part("1", "דן", "א"), part("2", "דן", "ב"), part("3", "גל", "ג")]);
    expect([n.get("1"), n.get("2"), n.get("3")]).toEqual(["דן א", "דן ב", "גל"]);
  });
  it("יכולת של פרויקט דורסת את ברירת המחדל של הסוג", () => {
    const type: ProjectType = { id: "t", name: "", has_grade: false, features: { ensembles: true, discipline: false }, fields: [], sort: 0, archived: false };
    expect(effectiveFeatures(project({ features: { discipline: true } }), type)).toEqual({ ensembles: true, discipline: true, journal: false, videos: false });
  });
  it("כותרות בבנק מושוות בלי רישיות, גרשיים ורווחים כפולים", () => {
    expect(normTitle("  Bag's   Groove ")).toBe(normTitle("bags groove"));
  });
  it("תאריך קצר ושם קובץ עקבי", () => {
    expect(shortDate("2026-11-02")).toBe("2.11.26");
    expect(mediaFilename("2026-11-02", "ט 26-27", "צלילי אקורד: בלוז", "IMG_0042.MOV")).toBe("2026-11-02 · ט 26-27 · צלילי אקורד בלוז.mov");
  });
  it("מסמך התיעוד: שיעורים לפי סדר, שדות, תבליטים וקישורים", () => {
    const blocks = docBlocks(
      project(),
      [lesson("2026-10-12", "חלוקה להרכבים\nאלתור חופשי"), lesson("2026-09-07", ""), lesson("2026-09-14", "היכרות")],
      [{ id: "1", lesson_id: "p:2026-10-12", project_id: "p", item_id: "r1", kind: "repertoire", position: 0 }],
      [{ id: "r1", kind: "repertoire", title: "Yesterdays", notes: "", tags: [], archived: false, created_at: "" }],
      [{ id: "m", project_id: "p", lesson_id: "p:2026-10-12", item_id: null, kind: "video", title: "צלילי אקורד", filename: "", drive_file_id: "x", url: "https://drive/x", size: 1, created_at: "" }]
    );
    expect(blocks.map((b) => b.type)).toEqual(["title", "h2", "bullet", "h2", "field", "bullet", "bullet", "link"]);
    expect(blocks[1]).toEqual({ type: "h2", text: "14.9.26" }); // שיעור ריק (7.9) לא נכתב
    expect(blocks[4]).toEqual({ type: "field", label: "רפרטואר", text: "Yesterdays" });
  });
});

import { docRequests } from "./docrequests";
describe("בקשות ל-Google Docs", () => {
  it("מוחקות את הקודם, כותבות טקסט אחד, ומסמנות כותרות, תבליטים וקישור באינדקסים הנכונים", () => {
    const reqs = docRequests(
      [
        { type: "title", text: "כותרת" },
        { type: "h2", text: "2.11.26" },
        { type: "field", label: "רפרטואר", text: "Yesterdays" },
        { type: "bullet", text: "א" },
        { type: "bullet", text: "ב" },
        { type: "link", label: "סרטון", text: "צלילים", url: "https://x" },
      ],
      40
    );
    expect(reqs[0]).toEqual({ deleteContentRange: { range: { startIndex: 1, endIndex: 39 } } });
    const text: string = reqs[1].insertText.text;
    expect(text).toBe("כותרת\n2.11.26\nרפרטואר: Yesterdays\nא\nב\nסרטון: צלילים\n");
    const bullets = reqs.filter((r: any) => r.createParagraphBullets);
    expect(bullets).toHaveLength(1);
    const { startIndex, endIndex } = bullets[0].createParagraphBullets.range;
    expect(text.slice(startIndex - 1, endIndex - 1)).toBe("א\nב\n");
    const link = reqs.find((r: any) => r.updateTextStyle?.textStyle.link).updateTextStyle.range;
    expect(text.slice(link.startIndex - 1, link.endIndex - 1)).toBe("צלילים");
    const h2 = reqs.find((r: any) => r.updateParagraphStyle?.paragraphStyle.namedStyleType === "HEADING_2").updateParagraphStyle.range;
    expect(text.slice(h2.startIndex - 1, h2.endIndex - 1)).toBe("2.11.26\n");
  });
  it("מסמך ריק לא נמחק, ובלי בלוקים לא נכתב דבר", () => {
    expect(docRequests([], 2)).toEqual([]);
  });
});
