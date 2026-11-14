/* המאגר המקומי: כל הנתונים בזיכרון, עותק במכשיר, ותור כתיבה ל-Supabase.
 *
 * האפליקציה משמשת בכיתה, שם הרשת לא תמיד יציבה. לכן כל שינוי חל מיד על
 * המסך ועל העותק שבמכשיר, ונכנס לתור; התור נשלח לפי הסדר ומנסה שוב עד
 * שהצליח. כל הכתיבות הן upsert לפי מפתח שנוצר בלקוח, ולכן שליחה חוזרת
 * אינה יוצרת כפילויות. המסד הוא מקור האמת: משיכה מחליפה את העותק המקומי,
 * אבל רק כשהתור ריק — כדי לא לדרוס שינוי שעוד לא עלה.
 */
import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { PK, TABLES } from "./types";
import type { Row, TableName, Tables } from "./types";

type Op =
  | { t: "upsert"; table: TableName; row: any }
  | { t: "delete"; table: TableName; key: Record<string, any> };

export interface State {
  tables: Tables;
  loaded: boolean; // יש נתונים להציג (מהמכשיר או מהמסד)
  fresh: boolean; // נמשכו מהמסד בביקור הזה
  pending: number;
  error: string;
}

const CACHE = "sa-cache-v1";
const OUTBOX = "sa-outbox-v1";
const empty = (): Tables => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Tables;

const read = <T,>(key: string): T | null => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* אחסון מלא או גלישה פרטית — ממשיכים בזיכרון */
  }
};

let outbox: Op[] = read<Op[]>(OUTBOX) || [];
const cached = read<Tables>(CACHE);
let state: State = {
  tables: cached ? { ...empty(), ...cached } : empty(),
  loaded: !!cached,
  fresh: false,
  pending: outbox.length,
  error: "",
};
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function set(patch: Partial<State>, persist = false) {
  state = { ...state, ...patch, pending: outbox.length };
  listeners.forEach((l) => l());
  if (persist) {
    // דחוי: הקלדה רצופה לא צריכה לסדר מחדש את כל העותק בכל אות
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => write(CACHE, state.tables), 250);
  }
}

export const getState = () => state;
export const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
export const useStore = () => useSyncExternalStore(subscribe, getState);
export const useTables = () => useStore().tables;

const keyOf = (table: TableName, row: any) => Object.fromEntries(PK[table].map((k) => [k, row[k]]));
const same = (table: TableName, a: any, b: any) => PK[table].every((k) => a[k] === b[k]);

function enqueue(op: Op) {
  /* שתי כתיבות רצופות לאותה שורה מתמזגות לאחת — חוץ מהראשונה בתור,
     שאולי כבר בדרך לשרת. */
  const last = outbox.length > 1 ? outbox[outbox.length - 1] : null;
  if (last && last.t === "upsert" && op.t === "upsert" && last.table === op.table && same(op.table, last.row, op.row))
    outbox[outbox.length - 1] = op;
  else outbox.push(op);
  write(OUTBOX, outbox);
}

export function upsert<T extends TableName>(table: T, row: Row<T>) {
  const list = state.tables[table] as any[];
  const i = list.findIndex((r) => same(table, r, row));
  const next = i < 0 ? [...list, row] : list.map((r, j) => (j === i ? row : r));
  enqueue({ t: "upsert", table, row });
  set({ tables: { ...state.tables, [table]: next } }, true);
  void flush();
}

/** עדכון חלקי של שורה קיימת */
export function patch<T extends TableName>(table: T, key: Partial<Row<T>>, changes: Partial<Row<T>>) {
  const row = (state.tables[table] as any[]).find((r) => PK[table].every((k) => r[k] === (key as any)[k]));
  if (row) upsert(table, { ...row, ...changes });
}

/* המסד מוחק בשרשרת (on delete cascade); העותק המקומי צריך לעשות אותו דבר. */
const CASCADE: Partial<Record<TableName, [TableName, string, "delete" | "null"][]>> = {
  projects: [
    ["participants", "project_id", "delete"],
    ["lessons", "project_id", "delete"],
    ["marks", "project_id", "delete"],
    ["draws", "project_id", "delete"],
    ["lesson_items", "project_id", "delete"],
    ["media", "project_id", "delete"],
  ],
  lessons: [
    ["marks", "lesson_id", "delete"],
    ["draws", "lesson_id", "delete"],
    ["lesson_items", "lesson_id", "delete"],
    ["media", "lesson_id", "null"],
  ],
  participants: [["marks", "participant_id", "delete"]],
  bank_items: [
    ["lesson_items", "item_id", "delete"],
    ["media", "item_id", "null"],
  ],
};

export function remove<T extends TableName>(table: T, key: Partial<Row<T>>) {
  const k = keyOf(table, key);
  const tables: any = { ...state.tables };
  tables[table] = (tables[table] as any[]).filter((r) => !same(table, r, k));
  const id = (key as any)[PK[table][0]];
  for (const [child, col, how] of CASCADE[table] || []) {
    tables[child] =
      how === "delete"
        ? tables[child].filter((r: any) => r[col] !== id)
        : tables[child].map((r: any) => (r[col] === id ? { ...r, [col]: null } : r));
  }
  enqueue({ t: "delete", table, key: k });
  set({ tables }, true);
  void flush();
}

let flushing = false;
async function send(op: Op) {
  if (op.t === "upsert") return supabase.from(op.table).upsert(op.row, { onConflict: PK[op.table].join(",") });
  return supabase.from(op.table).delete().match(op.key);
}

/** שולח את התור לפי הסדר. כשל רשת עוצר ומנסה שוב מאוחר יותר; דחייה של המסד מדווחת. */
export async function flush(): Promise<boolean> {
  if (flushing) return false;
  flushing = true;
  try {
    while (outbox.length) {
      const op = outbox[0];
      let res: { error: any; status: number };
      try {
        res = (await send(op)) as any;
      } catch {
        return false; // אין רשת
      }
      if (res.error) {
        const status = res.status || 0;
        if (!status || status >= 500 || status === 401 || status === 408 || status === 429) return false;
        // המסד דחה את השינוי (הרשאה, אילוץ). לא חוסמים את התור — מדווחים.
        set({ error: `שינוי ב-${op.table} נדחה: ${res.error.message || status}` });
      }
      outbox = outbox.slice(1);
      write(OUTBOX, outbox);
      set({});
    }
    return true;
  } finally {
    flushing = false;
  }
}

async function fetchAll(table: TableName) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

let refreshing = false;
/** מושך הכול מהמסד. מדלג כשיש שינויים שעוד לא עלו. */
export async function refresh(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    if (!(await flush()) && outbox.length) return;
    const lists = await Promise.all(TABLES.map(fetchAll));
    if (outbox.length) return; // נכתב משהו בזמן המשיכה — הוא חדש יותר
    const tables = Object.fromEntries(TABLES.map((t, i) => [t, lists[i]])) as unknown as Tables;
    set({ tables, loaded: true, fresh: true, error: "" }, true);
  } catch (e) {
    if (!state.loaded) set({ error: (e as Error).message });
  } finally {
    refreshing = false;
  }
}

export function clearLocal() {
  outbox = [];
  try {
    localStorage.removeItem(CACHE);
    localStorage.removeItem(OUTBOX);
  } catch {
    /* אין אחסון */
  }
  set({ tables: empty(), loaded: false, fresh: false, error: "" });
}

export const dismissError = () => set({ error: "" });

/* ניסיון חוזר: כשהרשת חוזרת, כשחוזרים למסך, וכל חצי דקה כשיש מה לשלוח. */
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void (outbox.length ? flush() : refresh());
  });
  setInterval(() => outbox.length && void flush(), 30000);
}

export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
