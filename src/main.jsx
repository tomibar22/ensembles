import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

/* נפתחת גם בלי רשת (public/sw.js). רק בבנייה לפרסום — בפיתוח מטמון רק מפריע. */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      // הקבצים שהדף הזה כבר טען, כדי שגם הביקור הראשון יספיק לעבודה בלי רשת
      const loaded = performance.getEntriesByType("resource").map((r) => r.name);
      reg.active && reg.active.postMessage({ cache: loaded });
    } catch {
      // בלי service worker האפליקציה עובדת כרגיל, רק לא בלי רשת
    }
  });
}
