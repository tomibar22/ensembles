import { useEffect, useState } from "react";
import { TopBar } from "../components/ui";
import { connected, syncDoc } from "../data/google";
import { go, useProject } from "../data/hooks";
import { dayName, todayStamp } from "../engine/derive";
import { SyncDot } from "./Home";
import LessonTab from "./LessonTab";
import EnsemblesTab from "./EnsemblesTab";
import TrackTab from "./TrackTab";
import HistoryTab from "./HistoryTab";
import PeopleTab from "./PeopleTab";
import SetupTab from "./SetupTab";

const TABS: [string, string, string][] = [
  ["lesson", "שיעור", "✎"],
  ["ensembles", "הרכבים", "♫"],
  ["track", "מעקב", "☰"],
  ["history", "יומן", "❏"],
  ["people", "משתתפים", "☺"],
];

export default function ProjectScreen({ projectId, tab = "lesson", date }: { projectId: string; tab?: string; date?: string }) {
  const ctx = useProject(projectId);
  const [today, setToday] = useState(todayStamp);
  const [docErr, setDocErr] = useState("");

  // האפליקציה נשארת פתוחה בטלפון משיעור לשיעור — "היום" חייב להתעדכן
  useEffect(() => {
    const tick = () => setToday(todayStamp());
    const t = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  /* מסמך התיעוד מתעדכן לבד, כמה שניות אחרי השינוי האחרון — כל עוד יש חיבור
     ל-Google. בלי חיבור השינוי מסומן וממתין; שום דבר לא אובד, כי המסד הוא המקור. */
  const dirty = !!ctx?.project.drive.dirty;
  const journal = !!ctx?.features.journal;
  useEffect(() => {
    if (!dirty || !journal || !connected()) return;
    const t = setTimeout(() => {
      syncDoc(projectId).then(
        () => setDocErr(""),
        (e) => setDocErr(e.message)
      );
    }, 6000);
    return () => clearTimeout(t);
  }, [dirty, journal, projectId, ctx?.lessons]);

  if (!ctx)
    return (
      <div className="app stack">
        <TopBar title="הפרויקט לא נמצא" back={() => go()} />
      </div>
    );

  const d = date || today;
  const tabs = TABS.filter(([k]) => k !== "ensembles" || ctx.features.ensembles);
  const cur = tab === "setup" || tabs.some(([k]) => k === tab) ? tab : "lesson";
  const dated = cur === "lesson" || cur === "ensembles";

  return (
    <div className="app with-tabs stack">
      <TopBar title={ctx.project.name} back={() => go()}>
        <SyncDot />
        <button className="btn icon ghost" aria-label="הגדרות הפרויקט" aria-pressed={cur === "setup"} onClick={() => go("p", projectId, cur === "setup" ? "lesson" : "setup")}>
          ⚙
        </button>
      </TopBar>

      {!ctx.project.active && <p className="banner">הפרויקט לא פעיל — ההיסטוריה שמורה, ואפשר להפעיל אותו מחדש בהגדרות.</p>}

      {dated && (
        <div className="row nowrap">
          <span className="sub" style={{ whiteSpace: "nowrap" }}>
            {dayName(d)}
          </span>
          <input
            type="date"
            className="field date"
            aria-label="תאריך השיעור"
            value={d}
            onChange={(e) => e.target.value && go("p", projectId, cur, e.target.value)}
          />
          <span className="grow" />
          {d !== today && (
            <button className="btn sm accent" onClick={() => go("p", projectId, cur)}>
              חזרה להיום
            </button>
          )}
        </div>
      )}

      {cur === "lesson" && <LessonTab key={d} ctx={ctx} date={d} docErr={docErr} />}
      {cur === "ensembles" && <EnsemblesTab key={d} ctx={ctx} date={d} />}
      {cur === "track" && <TrackTab ctx={ctx} />}
      {cur === "history" && <HistoryTab ctx={ctx} today={today} />}
      {cur === "people" && <PeopleTab ctx={ctx} />}
      {cur === "setup" && <SetupTab ctx={ctx} />}

      <nav className="tabbar" aria-label="חלקי הפרויקט">
        <div className="inner">
          {tabs.map(([k, label, ico]) => (
            <button key={k} aria-current={cur === k ? "page" : undefined} onClick={() => go("p", projectId, k, ...(dated && date && (k === "lesson" || k === "ensembles") ? [date] : []))}>
              <span className="ico" aria-hidden>
                {ico}
              </span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
