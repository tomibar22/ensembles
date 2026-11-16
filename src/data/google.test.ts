import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lesson, Project } from "./types";

/* מאגר מדומה: syncDoc קורא ממנו וכותב אליו דרך getState/patch/upsert בלבד. */
const state: { tables: any } = { tables: {} };
vi.mock("./store", () => ({
  getState: () => state,
  upsert: (table: string, row: any) => {
    const list = state.tables[table];
    const i = list.findIndex((r: any) => (r.id ?? r.key) === (row.id ?? row.key));
    state.tables[table] = i < 0 ? [...list, row] : list.map((r: any, j: number) => (j === i ? row : r));
  },
  patch: (table: string, key: any, changes: any) => {
    state.tables[table] = state.tables[table].map((r: any) => (r.id === key.id ? { ...r, ...changes } : r));
  },
}));

const { syncDoc } = await import("./google");

const lesson = (date: string, description: string): Lesson => ({
  id: `p:${date}`, project_id: "p", date, description, created_at: "", updated_at: "",
});
const project = (): Project => ({
  id: "p", name: "בדיקה", type_id: "t", grade: null, active: true, features: {}, settings: {}, attrs: {},
  baseline: {}, drive: { folderId: "f", mediaFolderId: "m", docId: "d", docUrl: "u", dirty: true }, notes: "", sort: 0, created_at: "",
});

/* Google מדומה: כל קובץ קיים, המסמך ריק. onWrite רץ בזמן שהכתיבה "בדרך". */
function fakeGoogle(onWrite: () => void) {
  vi.stubGlobal("fetch", async (url: string, opts: RequestInit = {}) => {
    let body: any = { id: "x", trashed: false };
    if (url.includes("docs.googleapis.com") && !url.includes(":batchUpdate")) body = { body: { content: [{ endIndex: 2 }] } };
    if (url.includes(":batchUpdate") && opts.method === "POST") {
      onWrite();
      body = {};
    }
    return { ok: true, status: 200, json: async () => body, text: async () => "" } as Response;
  });
}

const drive = () => state.tables.projects[0].drive;

describe("סנכרון מסמך התיעוד", () => {
  beforeEach(() => {
    state.tables = {
      projects: [project()],
      lessons: [lesson("2026-11-16", "סולמות")],
      lesson_items: [], bank_items: [], media: [], settings: [{ key: "drive", value: { rootId: "r" } }],
    };
  });

  it("כתיבה שלמה מסמנת את המסמך כמעודכן", async () => {
    fakeGoogle(() => {});
    await syncDoc("p");
    expect(drive().dirty).toBe(false);
    expect(drive().syncedAt).toBeTruthy();
  });

  it("שינוי שנרשם בזמן הכתיבה משאיר את המסמך ממתין", async () => {
    fakeGoogle(() => {
      state.tables.lessons = [lesson("2026-11-16", "סולמות ואלתור על בלוז")];
    });
    await syncDoc("p");
    expect(drive().dirty).toBe(true);
  });
});
