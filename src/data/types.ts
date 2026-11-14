import type { Draw, Role, Rules } from "../engine/engine";

export type FeatureKey = "ensembles" | "discipline" | "journal" | "videos";
export type Features = Record<FeatureKey, boolean>;
export const FEATURE_LABEL: Record<FeatureKey, string> = {
  ensembles: "חלוקה להרכבים",
  discipline: "משמעת וציון",
  journal: "תיעוד שיעורים",
  videos: "סרטונים",
};
export const FEATURE_KEYS = Object.keys(FEATURE_LABEL) as FeatureKey[];

export interface ProjectType {
  id: string;
  name: string;
  has_grade: boolean;
  features: Partial<Features>;
  fields: string[];
  sort: number;
  archived: boolean;
}

export interface Instrument {
  name: string;
  role: Role;
  is_unique: boolean;
  sort: number;
}

export interface Grading {
  start: number;
  absent: number;
  late: number;
  homework: number;
}

export interface RuleSettings extends Rules {
  teacher: boolean; // המורה משתתף בחלוקה
  leader: boolean; // מצב "תלמיד מוביל"
}

export interface ProjectSettings {
  rules?: Partial<RuleSettings>;
  grading?: Partial<Grading>;
  teacher?: { name?: string; instrument?: string };
}

export interface Baseline {
  plays?: Record<string, number>;
  pairs?: Record<string, number>;
  lessons?: number;
}

export interface DriveRefs {
  folderId?: string;
  mediaFolderId?: string;
  docId?: string;
  docUrl?: string;
  syncedAt?: string; // מתי המסמך נכתב לאחרונה
  dirty?: boolean; // יש שינוי בתיעוד שעוד לא נכתב למסמך
}

export interface Project {
  id: string;
  name: string;
  type_id: string;
  grade: string | null;
  active: boolean;
  features: Partial<Features>;
  settings: ProjectSettings;
  attrs: Record<string, string>;
  baseline: Baseline;
  drive: DriveRefs;
  notes: string;
  sort: number;
  created_at: string;
}

export interface Participant {
  id: string;
  project_id: string;
  first_name: string;
  last_name: string;
  instrument: string;
  instrument2: string;
  notes: string;
  active: boolean;
  joined_on: string | null;
  sort: number;
  created_at: string;
}

export interface Lesson {
  id: string;
  project_id: string;
  date: string; // YYYY-MM-DD
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Mark {
  lesson_id: string;
  participant_id: string;
  project_id: string;
  status: "absent" | "late" | null;
  justified: boolean;
  no_homework: boolean;
}

export interface DrawData extends Draw {
  k: number;
  rules: RuleSettings;
  /** מי היה חסר ברגע החלוקה — כדי לדעת מי הצטרף אחר כך */
  msg?: string;
}

export interface DrawRow {
  lesson_id: string;
  project_id: string;
  data: DrawData;
  updated_at: string;
}

export type BankKind = "repertoire" | "exercise" | "homework";
export const BANK_LABEL: Record<BankKind, string> = {
  repertoire: "רפרטואר",
  exercise: "תרגילים",
  homework: "שיעורי בית",
};
export const BANK_ONE: Record<BankKind, string> = { repertoire: "רפרטואר", exercise: "תרגיל", homework: "ש.ב." };
export const BANK_KINDS = Object.keys(BANK_LABEL) as BankKind[];

export interface BankItem {
  id: string;
  kind: BankKind;
  title: string;
  notes: string;
  tags: string[];
  archived: boolean;
  created_at: string;
}

export interface LessonItem {
  id: string;
  lesson_id: string;
  project_id: string;
  item_id: string;
  kind: BankKind;
  position: number;
}

export interface Media {
  id: string;
  project_id: string;
  lesson_id: string | null;
  item_id: string | null;
  kind: string;
  title: string;
  filename: string;
  drive_file_id: string;
  url: string;
  size: number | null;
  created_at: string;
}

export interface Setting {
  key: string;
  value: any;
}

export interface Defaults {
  grading: Grading;
  rules: RuleSettings;
  teacher: { name: string; instrument: string };
  grades: string[];
}

export interface Tables {
  project_types: ProjectType[];
  instruments: Instrument[];
  projects: Project[];
  participants: Participant[];
  lessons: Lesson[];
  marks: Mark[];
  draws: DrawRow[];
  bank_items: BankItem[];
  lesson_items: LessonItem[];
  media: Media[];
  settings: Setting[];
}
export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T][number];

export const PK: Record<TableName, string[]> = {
  project_types: ["id"],
  instruments: ["name"],
  projects: ["id"],
  participants: ["id"],
  lessons: ["id"],
  marks: ["lesson_id", "participant_id"],
  draws: ["lesson_id"],
  bank_items: ["id"],
  lesson_items: ["id"],
  media: ["id"],
  settings: ["key"],
};
export const TABLES = Object.keys(PK) as TableName[];
