import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./data/supabase";
import { clearLocal, dismissError, refresh, useStore } from "./data/store";
import { setLoginHint } from "./data/google";
import { useRoute } from "./data/hooks";
import Login from "./screens/Login";
import Home from "./screens/Home";
import ProjectScreen from "./screens/ProjectScreen";
import Banks from "./screens/Banks";
import Settings from "./screens/Settings";

const OWNER_OK = "sa-owner-ok";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // האם המייל מורשה. נשמר במכשיר כדי שהאפליקציה תיפתח גם בלי רשת.
  const [allowed, setAllowed] = useState<boolean | null>(() => (localStorage.getItem(OWNER_OK) === "1" ? true : null));
  const store = useStore();
  const route = useRoute();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    setLoginHint(session?.user.email || "");
    let alive = true;
    supabase.rpc("is_owner").then(({ data, error }) => {
      if (!alive || error) return; // בלי רשת: נשארים עם מה שידוע
      setAllowed(!!data);
      localStorage.setItem(OWNER_OK, data ? "1" : "0");
      if (data) void refresh();
    });
    return () => {
      alive = false;
    };
    // session.user.email קבוע לכל אורך החיבור
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(OWNER_OK);
    setAllowed(null);
    clearLocal();
  };

  if (session === undefined) return <div className="app center muted">טוען…</div>;
  if (!session) return <Login />;
  if (allowed === false)
    return (
      <div className="app stack">
        <h1>אין הרשאה</h1>
        <p>החשבון {session.user.email} אינו מורשה לראות את הנתונים.</p>
        <button className="btn" onClick={signOut}>
          יציאה
        </button>
      </div>
    );
  if (!store.loaded)
    return (
      <div className="app stack center">
        <p className="brand">שיעור אלתור</p>
        <p className="muted">{store.error ? `לא הצלחתי לטעון: ${store.error}` : "טוען את המחברת…"}</p>
        {store.error && (
          <button className="btn" onClick={() => void refresh()}>
            נסה שוב
          </button>
        )}
      </div>
    );

  const [head, a, b, c] = route;
  return (
    <>
      {store.error && (
        <div className="app" style={{ paddingBottom: 0 }}>
          <div className="banner warn row spread" role="alert">
            <span className="grow">{store.error}</span>
            <button className="btn sm" onClick={dismissError}>
              הבנתי
            </button>
          </div>
        </div>
      )}
      {head === "p" && a ? (
        <ProjectScreen key={a} projectId={a} tab={b} date={c} />
      ) : head === "banks" ? (
        <Banks />
      ) : head === "settings" ? (
        <Settings email={session.user.email || ""} onSignOut={signOut} />
      ) : (
        <Home />
      )}
    </>
  );
}
