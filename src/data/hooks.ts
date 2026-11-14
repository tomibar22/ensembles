import { useEffect, useMemo, useState } from "react";
import { createEngine } from "../engine/engine";
import {
  buildHistory,
  effectiveFeatures,
  effectiveGrading,
  effectiveRules,
  effectiveTeacher,
  lessonIdOf,
  makeCatalog,
  mergeDefaults,
  teacherPlayer,
  toPlayers,
} from "../engine/derive";
import { useTables } from "./store";
import type { Participant } from "./types";

/* ---- ניתוב לפי hash: עובד כקובץ סטטי, בלי הגדרות שרת ---- */
const parse = () => window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
export function useRoute() {
  const [parts, setParts] = useState(parse);
  useEffect(() => {
    const on = () => setParts(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}
export const go = (...parts: string[]) => {
  window.location.hash = "/" + parts.map(encodeURIComponent).join("/");
  window.scrollTo(0, 0);
};

export function useDefaults() {
  const { settings } = useTables();
  return useMemo(() => mergeDefaults(settings.find((s) => s.key === "defaults")?.value), [settings]);
}

/** כל מה שנגזר מפרויקט: סוג, יכולות, חוקים, משתתפים. */
export function useProject(projectId: string) {
  const t = useTables();
  const defaults = useDefaults();
  return useMemo(() => {
    const project = t.projects.find((p) => p.id === projectId);
    if (!project) return null;
    const type = t.project_types.find((x) => x.id === project.type_id);
    const all = t.participants
      .filter((p) => p.project_id === projectId)
      .sort((a, b) => a.sort - b.sort || a.first_name.localeCompare(b.first_name, "he"));
    return {
      project,
      type,
      defaults,
      features: effectiveFeatures(project, type),
      rules: effectiveRules(project, defaults),
      grading: effectiveGrading(project, defaults),
      teacher: effectiveTeacher(project, defaults),
      participants: all,
      active: all.filter((p) => p.active),
      catalog: makeCatalog(t.instruments),
      lessons: t.lessons.filter((l) => l.project_id === projectId).sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [t.projects, t.project_types, t.participants, t.instruments, t.lessons, projectId, defaults]);
}
export type ProjectCtx = NonNullable<ReturnType<typeof useProject>>;

/** המנוע של שיעור מסוים: מי נוכח, ההיסטוריה שלפניו, והחוקים של הפרויקט. */
export function useLessonEngine(ctx: ProjectCtx, date: string) {
  const t = useTables();
  const lessonId = lessonIdOf(ctx.project.id, date);
  return useMemo(() => {
    const marks = t.marks.filter((m) => m.lesson_id === lessonId);
    const absent = new Set(marks.filter((m) => m.status === "absent").map((m) => m.participant_id));
    const presentParts: Participant[] = ctx.active.filter((p) => !absent.has(p.id));
    const players = toPlayers(ctx.participants);
    const teacher = teacherPlayer(ctx.teacher);
    const history = buildHistory(ctx.project, t.draws, lessonId);
    const engine = createEngine({ players: [...players, teacher], catalog: ctx.catalog, rules: ctx.rules, history });
    const activeIds = new Set(presentParts.map((p) => p.id));
    const poolOf = (ids: Set<string>) => [
      ...players.filter((p) => ids.has(p.id)),
      ...(ctx.rules.teacher ? [teacher] : []),
    ];
    return {
      lessonId,
      engine,
      history,
      marks,
      absent,
      present: presentParts,
      pool: poolOf(activeIds),
      poolOf,
      draw: t.draws.find((d) => d.lesson_id === lessonId)?.data,
    };
  }, [t.marks, t.draws, ctx, lessonId]);
}
