import { Icon } from "./Icon";
import { useEffect, type ReactNode } from "react";

/** גיליון תחתון — לעריכה ולפעולות, נוח לאגודל */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", on);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", on);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn quiet" onClick={onClose}>
            סגור
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** אישור לפעולה הרסנית — אומר מה יימחק */
export function Confirm({
  title,
  body,
  action,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  action: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack">
        <div className="banner warn">{body}</div>
        <div className="row">
          <button className="btn grow" onClick={onClose}>
            ביטול
          </button>
          <button
            className="btn danger grow"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {action}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  full,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  full?: boolean;
  label: string;
}) {
  return (
    <div className={"seg" + (full ? " full" : "")} role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grow" style={{ display: "block" }}>
      <span className="lbl" style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 4 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export function TopBar({ title, back, children }: { title: ReactNode; back?: () => void; children?: ReactNode }) {
  return (
    <header className="top">
      {back && (
        <button className="btn icon ghost" onClick={back} aria-label="חזרה">
          <Icon name="back" size={22} />
        </button>
      )}
      <h1>{title}</h1>
      {children}
    </header>
  );
}
