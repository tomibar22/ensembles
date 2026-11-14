/* פעולות על הנתונים בשפה של התחום: שיעור, סימון, פריט בנק, חלוקה.
   המסכים קוראים לאלה, ולא כותבים לטבלאות ישירות. */
import { lessonIdOf, normTitle } from "../engine/derive";
import { getState, patch, remove, uid, upsert } from "./store";
import type { BankItem, BankKind, DrawData, Lesson, Mark, Participant, Project } from "./types";

const now = () => new Date().toISOString();
const T = () => getState().tables;

/** סימון שהתיעוד השתנה ועדיין לא נכתב למסמך ב-Google Docs */
export function markDocDirty(projectId: string) {
  const p = T().projects.find((x) => x.id === projectId);
  if (p && !p.drive.dirty) patch("projects", { id: projectId }, { drive: { ...p.drive, dirty: true } });
}

/** השיעור של התאריך — נוצר ברגע שיש מה לרשום בו */
export function ensureLesson(projectId: string, date: string): Lesson {
  const id = lessonIdOf(projectId, date);
  const found = T().lessons.find((l) => l.id === id);
  if (found) return found;
  const lesson: Lesson = { id, project_id: projectId, date, description: "", created_at: now(), updated_at: now() };
  upsert("lessons", lesson);
  return lesson;
}

export function setDescription(projectId: string, date: string, description: string) {
  const l = ensureLesson(projectId, date);
  upsert("lessons", { ...l, description, updated_at: now() });
  markDocDirty(projectId);
}

export function deleteLesson(lesson: Lesson) {
  remove("lessons", { id: lesson.id });
  markDocDirty(lesson.project_id);
}

/* ---- משמעת ---- */

const blank = (lessonId: string, participantId: string, projectId: string): Mark => ({
  lesson_id: lessonId,
  participant_id: participantId,
  project_id: projectId,
  status: null,
  justified: false,
  no_homework: false,
});

export function getMark(lessonId: string, participantId: string) {
  return T().marks.find((m) => m.lesson_id === lessonId && m.participant_id === participantId);
}

/** שורה נשמרת רק כשיש בה מה לרשום; סימון שחזר ל"רגיל" נמחק. */
export function writeMark(projectId: string, date: string, participantId: string, change: Partial<Mark>) {
  const lesson = ensureLesson(projectId, date);
  const cur = getMark(lesson.id, participantId) || blank(lesson.id, participantId, projectId);
  const next = { ...cur, ...change };
  if (!next.status) next.justified = false;
  if (!next.status && !next.no_homework) remove("marks", { lesson_id: lesson.id, participant_id: participantId });
  else upsert("marks", next);
  return next;
}

/* ---- בנקים ---- */

export function findBankItem(kind: BankKind, title: string) {
  const n = normTitle(title);
  return T().bank_items.find((b) => b.kind === kind && normTitle(b.title) === n);
}

export function addLessonItem(projectId: string, date: string, kind: BankKind, ref: { id: string } | { title: string }) {
  const lesson = ensureLesson(projectId, date);
  let item: BankItem | undefined;
  if ("id" in ref) item = T().bank_items.find((b) => b.id === ref.id);
  else {
    const title = ref.title.replace(/\s+/g, " ").trim();
    if (!title) return;
    item = findBankItem(kind, title);
    if (!item) {
      item = { id: uid(), kind, title, notes: "", tags: [], archived: false, created_at: now() };
      upsert("bank_items", item);
    } else if (item.archived) upsert("bank_items", { ...item, archived: false });
  }
  if (!item) return;
  const mine = T().lesson_items.filter((li) => li.lesson_id === lesson.id && li.kind === kind);
  if (mine.some((li) => li.item_id === item!.id)) return;
  upsert("lesson_items", {
    id: uid(),
    lesson_id: lesson.id,
    project_id: projectId,
    item_id: item.id,
    kind,
    position: mine.reduce((a, li) => Math.max(a, li.position + 1), 0),
  });
  markDocDirty(projectId);
}

export function removeLessonItem(id: string, projectId: string) {
  remove("lesson_items", { id });
  markDocDirty(projectId);
}

/** ממזג פריט בנק לתוך אחר: כל השימושים עוברים ליעד, והמקור נמחק. */
export function mergeBankItems(fromId: string, intoId: string) {
  const t = T();
  t.lesson_items
    .filter((li) => li.item_id === fromId)
    .forEach((li) => {
      const dup = t.lesson_items.some((x) => x.lesson_id === li.lesson_id && x.item_id === intoId);
      if (dup) remove("lesson_items", { id: li.id });
      else upsert("lesson_items", { ...li, item_id: intoId });
    });
  t.media.filter((m) => m.item_id === fromId).forEach((m) => upsert("media", { ...m, item_id: intoId }));
  remove("bank_items", { id: fromId });
  new Set(t.lesson_items.filter((li) => li.item_id === fromId).map((li) => li.project_id)).forEach(markDocDirty);
}

export function renameBankItem(item: BankItem, title: string) {
  upsert("bank_items", { ...item, title });
  new Set(T().lesson_items.filter((li) => li.item_id === item.id).map((li) => li.project_id)).forEach(markDocDirty);
}

/* ---- חלוקה ---- */

export function saveDraw(projectId: string, date: string, data: DrawData) {
  const lesson = ensureLesson(projectId, date);
  upsert("draws", { lesson_id: lesson.id, project_id: projectId, data, updated_at: now() });
}
export const clearDraw = (lessonId: string) => remove("draws", { lesson_id: lessonId });

/* ---- פרויקטים ומשתתפים ---- */

export function createProject(input: { name: string; type_id: string; grade: string | null; copyFrom?: string }): Project {
  const t = T();
  const project: Project = {
    id: uid(),
    name: input.name.trim(),
    type_id: input.type_id,
    grade: input.grade,
    active: true,
    features: {},
    settings: {},
    attrs: {},
    baseline: {},
    drive: {},
    notes: "",
    sort: t.projects.reduce((a, p) => Math.max(a, p.sort + 1), 0),
    created_at: now(),
  };
  upsert("projects", project);
  if (input.copyFrom) {
    const src = t.projects.find((p) => p.id === input.copyFrom);
    if (src) upsert("projects", { ...project, settings: src.settings, features: src.features });
    t.participants
      .filter((p) => p.project_id === input.copyFrom && p.active)
      .forEach((p) => upsert("participants", { ...p, id: uid(), project_id: project.id, joined_on: null, created_at: now() }));
  }
  return project;
}

export function newParticipant(projectId: string): Participant {
  const mine = T().participants.filter((p) => p.project_id === projectId);
  const hasLessons = T().lessons.some((l) => l.project_id === projectId);
  return {
    id: uid(),
    project_id: projectId,
    first_name: "",
    last_name: "",
    instrument: "",
    instrument2: "",
    notes: "",
    active: true,
    // מי שנוסף אחרי שכבר היו שיעורים — לא נספרים לו השיעורים שקדמו
    joined_on: hasLessons ? new Date().toISOString().slice(0, 10) : null,
    sort: mine.reduce((a, p) => Math.max(a, p.sort + 1), 0),
    created_at: now(),
  };
}
