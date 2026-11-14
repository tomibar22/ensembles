/* Google Drive ו-Docs, ישירות מהדפדפן.
 *
 * ההרשאה היא drive.file בלבד: האפליקציה רואה רק תיקיות וקבצים שהיא עצמה
 * יצרה — לא את שאר ה-Drive. הטוקן חי כשעה ונשמר בזיכרון בלבד; זה לא
 * מסוכן כאן, כי שום נתון אינו תלוי בו: התיעוד שמור במסד, והמסמך הוא תצוגה
 * שנכתבת מחדש בכל פעם שיש חיבור.
 *
 * סרטונים עולים ישר מהטלפון ל-Drive בהעלאה מתחדשת (resumable), בלי לעבור
 * דרך Vercel — ולכן אין מגבלת גודל של השרת.
 */
import { docBlocks, type DocBlock } from "../engine/derive";
import { docRequests } from "../engine/docrequests";
import { getState, patch, upsert } from "./store";
import type { DriveRefs, Project } from "./types";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE = "https://www.googleapis.com/drive/v3";
const ROOT_NAME = "שיעור אלתור";
const FOLDER = "application/vnd.google-apps.folder";

let token = "";
let expiry = 0;
let client: any = null;
let asking: Promise<void> | null = null;
let hint = "";

export const setLoginHint = (email: string) => (hint = email);
export const connected = () => !!token && Date.now() < expiry;

function loadGis(): Promise<void> {
  const w = window as any;
  if (w.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("הספרייה של Google לא נטענה — בדוק את החיבור לרשת"));
    document.head.appendChild(s);
  });
}

const POPUP: Record<string, string> = {
  popup_closed: "חלון ההתחברות ל-Google נסגר לפני שהסתיים",
  popup_failed_to_open: "הדפדפן חסם את חלון ההתחברות — אפשר חלונות קופצים לאתר ונסה שוב",
};

/** מבקש טוקן. תמיד מסתיים — בהצלחה או בשגיאה. חייב להיקרא מתוך לחיצה. */
export function connect(): Promise<void> {
  if (connected()) return Promise.resolve();
  if (asking) return asking;
  let timer: ReturnType<typeof setTimeout>;
  asking = loadGis()
    .then(
      () =>
        new Promise<void>((resolve, reject) => {
          const g = (window as any).google.accounts.oauth2;
          client = g.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPE,
            login_hint: hint || undefined,
            callback: (r: any) => {
              if (r.error) return reject(new Error(r.error_description || r.error));
              token = r.access_token;
              expiry = Date.now() + (Number(r.expires_in) - 60) * 1000;
              resolve();
            },
            error_callback: (e: any) => reject(new Error(POPUP[e?.type] || "ההתחברות ל-Google לא הושלמה")),
          });
          timer = setTimeout(() => reject(new Error("ההתחברות ל-Google לא הושלמה בזמן — נסה שוב")), 120000);
          client.requestAccessToken({ prompt: "" });
        })
    )
    .finally(() => {
      clearTimeout(timer);
      asking = null;
    });
  return asking;
}

async function gfetch(url: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (res.ok) return res.status === 204 ? null : res.json();
  const body = await res.text();
  if (res.status === 401) {
    token = "";
    throw new Error("החיבור ל-Google פג — התחבר שוב");
  }
  if (res.status === 403 && /has not been used|accessNotConfigured|is disabled/i.test(body))
    throw new Error("צריך להפעיל את Google Drive API ואת Google Docs API בפרויקט ב-Google Cloud (פעם אחת)");
  const err: any = new Error(`שגיאת Google ${res.status}: ${body.slice(0, 140)}`);
  err.status = res.status;
  throw err;
}

async function alive(id: string | undefined) {
  if (!id) return false;
  try {
    const f = await gfetch(`${DRIVE}/files/${id}?fields=id,trashed`);
    return !f.trashed;
  } catch (e: any) {
    if (e.status === 404) return false;
    throw e;
  }
}

async function createFile(name: string, mimeType: string, parent?: string) {
  return gfetch(`${DRIVE}/files?fields=id,webViewLink`, {
    method: "POST",
    body: JSON.stringify({ name, mimeType, ...(parent ? { parents: [parent] } : {}) }),
  }) as Promise<{ id: string; webViewLink: string }>;
}

const checked = new Set<string>(); // מה שכבר אומת בביקור הזה

/** מוודא שלפרויקט יש תיקייה, תיקיית סרטונים ומסמך תיעוד — ויוצר את מה שחסר. */
export async function ensureProjectFiles(projectId: string): Promise<DriveRefs> {
  const t = getState().tables;
  const project = t.projects.find((p) => p.id === projectId) as Project;
  const driveSetting = t.settings.find((s) => s.key === "drive")?.value || {};
  let rootId: string = driveSetting.rootId;
  if (!checked.has("root") && !(await alive(rootId))) {
    rootId = (await createFile(ROOT_NAME, FOLDER)).id;
    upsert("settings", { key: "drive", value: { ...driveSetting, rootId } });
  }
  checked.add("root");

  const refs: DriveRefs = { ...project.drive };
  const fresh = !checked.has(projectId);
  if (fresh && !(await alive(refs.folderId))) {
    refs.folderId = (await createFile(project.name, FOLDER, rootId)).id;
    refs.mediaFolderId = undefined;
    refs.docId = undefined;
  }
  if (fresh && !(await alive(refs.mediaFolderId))) refs.mediaFolderId = (await createFile("סרטונים", FOLDER, refs.folderId)).id;
  if (fresh && !(await alive(refs.docId))) {
    const doc = await createFile(`תיעוד שיעורים · ${project.name}`, "application/vnd.google-apps.document", refs.folderId);
    refs.docId = doc.id;
    refs.docUrl = doc.webViewLink;
    refs.dirty = true;
  }
  checked.add(projectId);
  if (JSON.stringify(refs) !== JSON.stringify(project.drive)) patch("projects", { id: projectId }, { drive: refs });
  return refs;
}

async function writeDoc(docId: string, blocks: DocBlock[]) {
  const base = `https://docs.googleapis.com/v1/documents/${docId}`;
  const doc = await gfetch(`${base}?fields=body(content(endIndex))`);
  const content = doc.body?.content || [];
  const end = content.length ? content[content.length - 1].endIndex : 2;
  const requests = docRequests(blocks, end);
  if (requests.length) await gfetch(`${base}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
}

/** כותב את מסמך התיעוד של הפרויקט מחדש, מתוך מה ששמור במסד. */
export async function syncDoc(projectId: string): Promise<void> {
  const refs = await ensureProjectFiles(projectId);
  const t = getState().tables;
  const project = t.projects.find((p) => p.id === projectId) as Project;
  await writeDoc(refs.docId!, docBlocks(project, t.lessons, t.lesson_items, t.bank_items, t.media));
  const now = getState().tables.projects.find((p) => p.id === projectId) as Project;
  patch("projects", { id: projectId }, { drive: { ...now.drive, dirty: false, syncedAt: new Date().toISOString() } });
}

const CHUNK = 8 * 1024 * 1024; // כפולה של 256KB, כנדרש

function putChunk(session: string, file: File, from: number, onProgress: (sent: number) => void) {
  return new Promise<{ status: number; body: string; range: string | null }>((resolve, reject) => {
    const to = Math.min(from + CHUNK, file.size);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", session);
    xhr.setRequestHeader("Content-Range", `bytes ${from}-${to - 1}/${file.size}`);
    xhr.upload.onprogress = (e) => onProgress(from + e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText, range: xhr.getResponseHeader("Range") });
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file.slice(from, to));
  });
}

/** מעלה קובץ ל-Drive בחלקים, עם ניסיון חוזר לכל חלק. מחזיר את מזהה הקובץ והקישור. */
export async function uploadFile(
  file: File,
  meta: { name: string; parent: string; description: string },
  onProgress: (fraction: number) => void
): Promise<{ id: string; url: string }> {
  const start = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": file.type || "application/octet-stream",
      "X-Upload-Content-Length": String(file.size),
    },
    body: JSON.stringify({ name: meta.name, parents: [meta.parent], description: meta.description }),
  });
  if (!start.ok) throw new Error(`ההעלאה לא התחילה (${start.status}) — ${(await start.text()).slice(0, 120)}`);
  const session = start.headers.get("Location");
  if (!session) throw new Error("Google לא החזיר כתובת העלאה");

  let from = 0;
  let failures = 0;
  while (from < file.size || file.size === 0) {
    try {
      const r = await putChunk(session, file, from, (sent) => onProgress(sent / file.size));
      if (r.status === 200 || r.status === 201) {
        const f = JSON.parse(r.body);
        onProgress(1);
        return { id: f.id, url: f.webViewLink };
      }
      if (r.status === 308) {
        // Google אומר עד איפה הגיע; ממשיכים משם
        const m = /bytes=0-(\d+)/.exec(r.range || "");
        from = m ? Number(m[1]) + 1 : from;
        failures = 0;
        continue;
      }
      throw new Error(`שגיאת העלאה ${r.status}`);
    } catch (e) {
      if (++failures > 5) throw new Error("ההעלאה נכשלה אחרי כמה ניסיונות — בדוק את הרשת ונסה שוב");
      await new Promise((ok) => setTimeout(ok, 1500 * failures));
    }
  }
  throw new Error("ההעלאה לא הסתיימה");
}
