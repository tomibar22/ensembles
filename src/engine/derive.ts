/* חישובים טהורים מעל הנתונים: שמות תצוגה, יכולות, היסטוריית חלוקות,
 * ציונים, ותוכן מסמך התיעוד. בלי React ובלי רשת — נבדק ישירות. */

import type { Catalog, History, Player, Role } from "./engine";
import { pairKey } from "./engine";
import type {
  BankItem,
  BankKind,
  Defaults,
  DrawRow,
  Features,
  Grading,
  Instrument,
  Lesson,
  LessonItem,
  Mark,
  Media,
  Participant,
  Project,
  ProjectType,
  RuleSettings,
} from "../data/types";
import { BANK_KINDS, BANK_LABEL, FEATURE_KEYS } from "../data/types";

export const TEACHER_ID = "__teacher";

export const FALLBACK_DEFAULTS: Defaults = {
  grading: { start: 100, absent: 5, late: 3, homework: 5 },
  rules: {
    required: ["drums", "bass", "harmony", "melody"],
    maxGroup: 7,
    maxLoad: 2,
    maxGroups: 5,
    enrich: true,
    teacher: true,
    leader: false,
  },
  teacher: { name: "המורה", instrument: "פסנתר" },
  grades: ["ט", "י", "יא", "יב"],
};

export function mergeDefaults(value: Partial<Defaults> | undefined): Defaults {
  const v = value || {};
  return {
    grading: { ...FALLBACK_DEFAULTS.grading, ...v.grading },
    rules: { ...FALLBACK_DEFAULTS.rules, ...v.rules },
    teacher: { ...FALLBACK_DEFAULTS.teacher, ...v.teacher },
    grades: v.grades?.length ? v.grades : FALLBACK_DEFAULTS.grades,
  };
}

export function effectiveFeatures(project: Project, type: ProjectType | undefined): Features {
  const out = {} as Features;
  FEATURE_KEYS.forEach((k) => (out[k] = project.features[k] ?? type?.features[k] ?? false));
  return out;
}

export const effectiveRules = (project: Project, d: Defaults): RuleSettings => ({
  ...d.rules,
  ...project.settings.rules,
});
export const effectiveGrading = (project: Project, d: Defaults): Grading => ({
  ...d.grading,
  ...project.settings.grading,
});
export const effectiveTeacher = (project: Project, d: Defaults) => ({ ...d.teacher, ...project.settings.teacher });

export function makeCatalog(instruments: Instrument[]): Catalog {
  const map = new Map(instruments.map((i) => [i.name, i]));
  return {
    role: (inst) => (map.get(inst)?.role ?? "melody") as Role,
    unique: (inst) => map.get(inst)?.is_unique ?? false,
    order: (inst) => map.get(inst)?.sort ?? 99,
  };
}

/** שם פרטי; שם משפחה מצטרף רק כששניים חולקים שם פרטי באותו פרויקט. */
export function displayNames(parts: Participant[]): Map<string, string> {
  const count = new Map<string, number>();
  parts.forEach((p) => count.set(p.first_name, (count.get(p.first_name) || 0) + 1));
  return new Map(
    parts.map((p) => [
      p.id,
      (count.get(p.first_name) || 0) > 1 && p.last_name ? `${p.first_name} ${p.last_name}` : p.first_name,
    ])
  );
}

export function toPlayers(parts: Participant[]): Player[] {
  const names = displayNames(parts);
  return parts.map((p) => ({
    id: p.id,
    name: names.get(p.id) || p.first_name,
    instruments: p.instrument ? [p.instrument] : [],
    backup: p.instrument2 && p.instrument2 !== p.instrument ? [p.instrument2] : [],
  }));
}

export const teacherPlayer = (t: { name: string; instrument: string }): Player => ({
  id: TEACHER_ID,
  name: t.name,
  instruments: [t.instrument],
  backup: [],
  teacher: true,
});

/**
 * ההיסטוריה שהחלוקה נשענת עליה: כמה הרכבים כל אחד ניגן, מי ניגן עם מי, ומי
 * כבר הוביל. נבנית מכל החלוקות השמורות של הפרויקט — חוץ מזו של השיעור
 * הנוכחי — מעל הצבירה שהועברה מהמערכת הקודמת. המורה אינו נספר.
 */
export function buildHistory(project: Project, draws: DrawRow[], exceptLessonId?: string): History {
  const plays: Record<string, number> = { ...(project.baseline.plays || {}) };
  const pairs: Record<string, number> = { ...(project.baseline.pairs || {}) };
  const leads: Record<string, number> = {};
  let lessons = project.baseline.lessons || 0;
  for (const d of draws) {
    if (d.project_id !== project.id || d.lesson_id === exceptLessonId) continue;
    lessons++;
    d.data.groups.forEach((g, gi) => {
      g.forEach((a, i) => {
        if (a.id === TEACHER_ID) return;
        plays[a.id] = (plays[a.id] || 0) + 1;
        g.slice(i + 1).forEach((b) => {
          if (b.id === TEACHER_ID || b.id === a.id) return;
          const key = pairKey(a.id, b.id);
          pairs[key] = (pairs[key] || 0) + 1;
        });
      });
      const lead = d.data.leaders?.[gi];
      if (lead) leads[lead] = (leads[lead] || 0) + 1;
    });
  }
  return { plays, pairs, leads, lessons };
}

/* ============================ תאריכים ============================ */

export function todayStamp(now = new Date()) {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}
export const lessonIdOf = (projectId: string, date: string) => `${projectId}:${date}`;
/** 2026-11-02 → 2.11.26 */
export function shortDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return `${d}.${m}.${String(y).slice(2)}`;
}
const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export function dayName(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return `יום ${DAYS[new Date(y, m - 1, d).getDay()]}`;
}

/* ============================ ציונים ============================ */

export interface TrackRow {
  id: string;
  name: string;
  instrument: string;
  active: boolean;
  lessons: number;
  absent: number;
  absentJustified: number;
  late: number;
  lateJustified: number;
  homework: number;
  rate: number | null;
  grade: number;
  plays: number;
}

/**
 * סיכום המשמעת לכל משתתף. חיסור ואיחור מוצדקים נספרים בנפרד ואינם מורידים
 * ציון. שיעורים שקדמו ל-joined_on אינם נספרים לתלמיד, ולכן מי שהצטרף באמצע
 * השנה אינו נראה נוכח בשיעורים שלא היה בהם.
 */
export function trackRows(
  parts: Participant[],
  lessons: Lesson[],
  marks: Mark[],
  grading: Grading,
  plays: Record<string, number>,
  range?: { from?: string; to?: string }
): TrackRow[] {
  const inRange = lessons.filter((l) => (!range?.from || l.date >= range.from) && (!range?.to || l.date <= range.to));
  const dateOf = new Map(inRange.map((l) => [l.id, l.date]));
  const names = displayNames(parts);
  const byPart = new Map<string, Mark[]>();
  marks.forEach((m) => {
    if (!dateOf.has(m.lesson_id)) return;
    byPart.set(m.participant_id, [...(byPart.get(m.participant_id) || []), m]);
  });
  return parts.map((p) => {
    const mine = (byPart.get(p.id) || []).filter((m) => !p.joined_on || dateOf.get(m.lesson_id)! >= p.joined_on);
    const count = (f: (m: Mark) => boolean) => mine.filter(f).length;
    const absent = count((m) => m.status === "absent" && !m.justified);
    const absentJustified = count((m) => m.status === "absent" && m.justified);
    const late = count((m) => m.status === "late" && !m.justified);
    const lateJustified = count((m) => m.status === "late" && m.justified);
    const homework = count((m) => m.no_homework);
    const n = inRange.filter((l) => !p.joined_on || l.date >= p.joined_on).length;
    const grade = Math.max(0, grading.start - absent * grading.absent - late * grading.late - homework * grading.homework);
    return {
      id: p.id,
      name: names.get(p.id) || p.first_name,
      instrument: p.instrument,
      active: p.active,
      lessons: n,
      absent,
      absentJustified,
      late,
      lateJustified,
      homework,
      rate: n ? Math.round(((n - absent - absentJustified) / n) * 100) : null,
      grade,
      plays: plays[p.id] || 0,
    };
  });
}

/* ============================ בנקים ============================ */

/** מפתח השוואה לכותרת בבנק: בלי רווחים כפולים, בלי גרשיים, בלי הבדלי רישיות */
export const normTitle = (t: string) =>
  t
    .toLowerCase()
    .replace(/[״"׳'`’]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function itemsOf(lessonId: string, kind: BankKind, lessonItems: LessonItem[], bank: Map<string, BankItem>) {
  return lessonItems
    .filter((li) => li.lesson_id === lessonId && li.kind === kind)
    .sort((a, b) => a.position - b.position)
    .map((li) => ({ link: li, item: bank.get(li.item_id) }))
    .filter((x): x is { link: LessonItem; item: BankItem } => !!x.item);
}

/* ============================ מסמך התיעוד ============================ */

export type DocBlock =
  | { type: "title" | "h2" | "bullet" | "text"; text: string }
  | { type: "field"; label: string; text: string }
  | { type: "link"; label: string; text: string; url: string };

/** תוכן מסמך התיעוד של פרויקט, מהשיעור הראשון לאחרון. */
export function docBlocks(
  project: Project,
  lessons: Lesson[],
  lessonItems: LessonItem[],
  bankItems: BankItem[],
  media: Media[]
): DocBlock[] {
  const bank = new Map(bankItems.map((b) => [b.id, b]));
  const out: DocBlock[] = [{ type: "title", text: `תיעוד שיעורים · ${project.name}` }];
  const mine = lessons.filter((l) => l.project_id === project.id).sort((a, b) => a.date.localeCompare(b.date));
  for (const l of mine) {
    const fields = BANK_KINDS.map((kind) => ({
      kind,
      titles: itemsOf(l.id, kind, lessonItems, bank).map((x) => x.item.title),
    })).filter((f) => f.titles.length);
    const lines = l.description
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const files = media.filter((m) => m.lesson_id === l.id && m.url);
    if (!fields.length && !lines.length && !files.length) continue;
    out.push({ type: "h2", text: shortDate(l.date) });
    fields.forEach((f) => out.push({ type: "field", label: BANK_LABEL[f.kind], text: f.titles.join(" · ") }));
    lines.forEach((text) => out.push({ type: "bullet", text }));
    files.forEach((m) =>
      out.push({ type: "link", label: m.kind === "video" ? "סרטון" : "קובץ", text: m.title || m.filename, url: m.url })
    );
  }
  return out;
}

/** שם קובץ עקבי למדיה: "2026-11-02 · יא 26-27 · צלילי אקורד.mov" */
export function mediaFilename(date: string, projectName: string, title: string, original: string) {
  const ext = /\.[A-Za-z0-9]{2,5}$/.exec(original)?.[0].toLowerCase() || "";
  const clean = (title || "ללא שם").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return `${date} · ${projectName} · ${clean}${ext}`;
}
