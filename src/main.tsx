import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

/* נפתחת גם בלי רשת (public/sw.js). רק בבנייה לפרסום — בפיתוח מטמון רק מפריע. */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const loaded = performance.getEntriesByType("resource").map((r) => r.name);
      reg.active?.postMessage({ cache: loaded });
    } catch {
      /* בלי service worker האפליקציה עובדת כרגיל, רק לא בלי רשת */
    }
  });
}
