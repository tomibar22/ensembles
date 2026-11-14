import { Icon } from "../components/Icon";
import { useMemo, useRef, useState } from "react";
import { Confirm, Field, Sheet } from "../components/ui";
import { ensureLesson, markDocDirty } from "../data/actions";
import { connect, ensureProjectFiles, uploadFile } from "../data/google";
import type { ProjectCtx } from "../data/hooks";
import { remove, uid, upsert, useTables } from "../data/store";
import type { Media } from "../data/types";
import { itemsOf, lessonIdOf, mediaFilename, shortDate } from "../engine/derive";

/**
 * סרטונים וקבצים של השיעור. הקובץ עולה ישר מהטלפון לתיקיית הפרויקט ב-Drive
 * בשם עקבי (תאריך · פרויקט · כותרת), ונרשם כאן עם קישור — ומשם גם למסמך
 * התיעוד. אפשר לקשר אותו לתרגיל או לקטע, ואז הוא מופיע גם בבנק.
 */
export default function MediaSection({ ctx, date }: { ctx: ProjectCtx; date: string }) {
  const t = useTables();
  const lessonId = lessonIdOf(ctx.project.id, date);
  const list = t.media.filter((m) => m.lesson_id === lessonId);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [linking, setLinking] = useState(false);
  const [removing, setRemoving] = useState<Media | null>(null);
  const bank = useMemo(() => new Map(t.bank_items.map((b) => [b.id, b])), [t.bank_items]);

  return (
    <section className="card">
      <div className="section-title">
        <h2>סרטונים</h2>
        <span className="count">{list.length || ""}</span>
      </div>
      {list.length > 0 && (
        <div className="list" style={{ marginBottom: 10 }}>
          {list.map((m) => (
            <div key={m.id} className="list-row">
              <Icon name={m.kind === "video" ? "video" : "clip"} />
              <a className="grow" href={m.url} target="_blank" rel="noreferrer">
                <span dir="auto">{m.title || m.filename}</span>
                {m.item_id && bank.get(m.item_id) && <span className="sub"> · {bank.get(m.item_id)!.title}</span>}
              </a>
              <button className="btn quiet sm" aria-label={`הסר את ${m.title}`} onClick={() => setRemoving(m)}>
                <Icon name="x" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="video/*,image/*"
        hidden
        onChange={(e) => {
          setFile(e.target.files?.[0] || null);
          e.target.value = "";
        }}
      />
      <div className="row">
        <button className="btn accent grow" onClick={() => input.current?.click()}>
          <Icon name="upload" /> העלה סרטון
        </button>
        <button className="btn" onClick={() => setLinking(true)}>
          <Icon name="link" size={18} /> קישור קיים
        </button>
      </div>
      {file && <UploadSheet ctx={ctx} date={date} file={file} onClose={() => setFile(null)} />}
      {linking && <LinkSheet ctx={ctx} date={date} onClose={() => setLinking(false)} />}
      {removing && (
        <Confirm
          title="להסיר מהשיעור?"
          body={`"${removing.title}" יוסר מהרשימה כאן ומהמסמך. הקובץ עצמו נשאר ב-Drive.`}
          action="הסר"
          onConfirm={() => {
            remove("media", { id: removing.id });
            markDocDirty(ctx.project.id);
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </section>
  );
}

function useLessonChoices(ctx: ProjectCtx, date: string) {
  const t = useTables();
  return useMemo(() => {
    const bank = new Map(t.bank_items.map((b) => [b.id, b]));
    const id = lessonIdOf(ctx.project.id, date);
    return [...itemsOf(id, "exercise", t.lesson_items, bank), ...itemsOf(id, "repertoire", t.lesson_items, bank)].map((x) => x.item);
  }, [t.bank_items, t.lesson_items, ctx.project.id, date]);
}

function UploadSheet({ ctx, date, file, onClose }: { ctx: ProjectCtx; date: string; file: File; onClose: () => void }) {
  const choices = useLessonChoices(ctx, date);
  const [itemId, setItemId] = useState(choices[0]?.id || "");
  const [title, setTitle] = useState(choices[0]?.title || file.name.replace(/\.[^.]+$/, ""));
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const name = mediaFilename(date, ctx.project.name, title, file.name);
  const mb = (file.size / 1048576).toFixed(0);

  const start = async () => {
    setErr("");
    setProgress(0);
    try {
      await connect(); // מתוך הלחיצה — הדפדפן מרשה חלון התחברות
      const refs = await ensureProjectFiles(ctx.project.id);
      const linked = choices.find((c) => c.id === itemId);
      const done = await uploadFile(
        file,
        {
          name,
          parent: refs.mediaFolderId!,
          description: [`שיעור אלתור · ${ctx.project.name} · ${shortDate(date)}`, linked && `תרגיל/קטע: ${linked.title}`].filter(Boolean).join("\n"),
        },
        setProgress
      );
      const lesson = ensureLesson(ctx.project.id, date);
      upsert("media", {
        id: uid(),
        project_id: ctx.project.id,
        lesson_id: lesson.id,
        item_id: itemId || null,
        kind: file.type.startsWith("image/") ? "image" : "video",
        title: title.trim() || file.name,
        filename: name,
        drive_file_id: done.id,
        url: done.url,
        size: file.size,
        created_at: new Date().toISOString(),
      });
      markDocDirty(ctx.project.id);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setProgress(null);
    }
  };

  return (
    <Sheet title="העלאה ל-Drive" onClose={progress === null ? onClose : () => {}}>
      <div className="stack">
        {choices.length > 0 && (
          <Field label="קשור ל…">
            <select
              className="field"
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value);
                const c = choices.find((x) => x.id === e.target.value);
                if (c) setTitle(c.title);
              }}
            >
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
              <option value="">בלי קישור</option>
            </select>
          </Field>
        )}
        <Field label="כותרת">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <p className="sub" dir="auto">
          יישמר בתיקיית “{ctx.project.name} / סרטונים” בשם:
          <br />
          <b>{name}</b> · {mb}MB
        </p>
        {progress !== null && (
          <>
            <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="sub center">{Math.round(progress * 100)}% · השאר את המסך פתוח עד שזה מסתיים</p>
          </>
        )}
        {err && (
          <p className="banner warn" role="alert">
            {err}
          </p>
        )}
        <button className="btn primary big" onClick={start} disabled={progress !== null}>
          {progress !== null ? "מעלה…" : "העלה"}
        </button>
      </div>
    </Sheet>
  );
}

/** קישור לקובץ שכבר נמצא ב-Drive (או בכל מקום אחר) */
function LinkSheet({ ctx, date, onClose }: { ctx: ProjectCtx; date: string; onClose: () => void }) {
  const choices = useLessonChoices(ctx, date);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [itemId, setItemId] = useState("");
  const ok = title.trim() && /^https?:\/\//.test(url.trim());
  const save = () => {
    const lesson = ensureLesson(ctx.project.id, date);
    upsert("media", {
      id: uid(),
      project_id: ctx.project.id,
      lesson_id: lesson.id,
      item_id: itemId || null,
      kind: "video",
      title: title.trim(),
      filename: "",
      drive_file_id: /\/d\/([\w-]+)/.exec(url)?.[1] || "",
      url: url.trim(),
      size: null,
      created_at: new Date().toISOString(),
    });
    markDocDirty(ctx.project.id);
    onClose();
  };
  return (
    <Sheet title="קישור לסרטון קיים" onClose={onClose}>
      <div className="stack">
        <Field label="כותרת">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="קישור">
          <input className="field" dir="ltr" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" />
        </Field>
        {choices.length > 0 && (
          <Field label="קשור ל…">
            <select className="field" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">בלי קישור</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button className="btn primary big" disabled={!ok} onClick={save}>
          הוסף
        </button>
      </div>
    </Sheet>
  );
}
