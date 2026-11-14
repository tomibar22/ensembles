import { useEffect, useRef, useState } from "react";
import { supabase } from "../data/supabase";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

/**
 * כניסה. שלוש דרכים, כי בטלפון לא כולן עובדות בכל מצב:
 *  - Google — לחיצה אחת, וזה אותו חשבון שמחזיק את ה-Drive.
 *  - מייל וסיסמה — עובד גם בתוך האפליקציה שהותקנה במסך הבית.
 *  - קישור למייל — לכניסה הראשונה, לפני שהוגדרה סיסמה (נפתח בדפדפן).
 * הרשמה סגורה: רק חשבון שהוגדר מראש יכול להיכנס.
 */
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const gbtn = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const render = () => {
      const id = (window as any).google?.accounts?.id;
      if (!alive || !id || !gbtn.current) return;
      id.initialize({
        client_id: CLIENT_ID,
        callback: async (r: { credential: string }) => {
          setBusy(true);
          const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: r.credential });
          setBusy(false);
          if (error) setMsg(/signups? not allowed|not found/i.test(error.message) ? "החשבון הזה אינו מורשה." : error.message);
        },
      });
      id.renderButton(gbtn.current, { theme: "outline", size: "large", shape: "pill", text: "signin_with", locale: "he", width: 280 });
    };
    if ((window as any).google?.accounts?.id) render();
    else {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = render;
      document.head.appendChild(s);
    }
    return () => {
      alive = false;
    };
  }, []);

  const withPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg(error.message === "Invalid login credentials" ? "מייל או סיסמה לא נכונים." : error.message);
  };

  const sendLink = async () => {
    if (!email.trim()) return setMsg("כתוב קודם את כתובת המייל.");
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    setMsg(
      error
        ? /not allowed|not found/i.test(error.message)
          ? "הכתובת הזאת אינה מורשית."
          : error.message
        : "נשלח קישור כניסה למייל. פתח אותו במכשיר הזה, ואחר כך הגדר סיסמה בהגדרות."
    );
  };

  return (
    <div className="app stack" style={{ paddingTop: "12vh", maxWidth: 420 }}>
      <div className="center">
        <p className="brand">שיעור אלתור</p>
        <p className="muted">המחברת של המורה</p>
      </div>
      <div className="card stack">
        <div ref={gbtn} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />
        <hr className="rule" />
        <form className="stack" onSubmit={withPassword}>
          <input
            className="field"
            type="email"
            dir="ltr"
            autoComplete="username"
            placeholder="מייל"
            aria-label="מייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="field"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            placeholder="סיסמה"
            aria-label="סיסמה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn primary big" disabled={busy || !email || !password}>
            {busy ? "רגע…" : "כניסה"}
          </button>
        </form>
        <button className="btn quiet" onClick={sendLink} disabled={busy}>
          אין לי סיסמה — שלח קישור כניסה למייל
        </button>
        {msg && (
          <p className="banner" role="status">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
