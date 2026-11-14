import { Component, type ReactNode } from "react";

/* במקום מסך לבן. בכוונה בלי תלות בעיצוב או בנתונים — חייב לעבוד גם כשהכול נשבר. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div dir="rtl" style={{ padding: 24, fontFamily: "system-ui, sans-serif", lineHeight: 1.6, color: "#3d3424" }}>
        <h1 style={{ fontSize: 22 }}>משהו השתבש</h1>
        <p>הנתונים שמורים. נסה לרענן; אם זה חוזר, אפשר לאפס את העותק המקומי — הוא יימשך מחדש מהמסד.</p>
        <pre style={{ whiteSpace: "pre-wrap", direction: "ltr", fontSize: 13, background: "#fff", padding: 10 }}>
          {String(this.state.error.message)}
        </pre>
        <p style={{ display: "flex", gap: 10 }}>
          <button style={{ minHeight: 44, padding: "0 16px" }} onClick={() => location.reload()}>
            רענן
          </button>
          <button
            style={{ minHeight: 44, padding: "0 16px" }}
            onClick={() => {
              try {
                localStorage.removeItem("sa-cache-v1");
              } catch {
                /* אין אחסון */
              }
              location.hash = "";
              location.reload();
            }}
          >
            אפס עותק מקומי ורענן
          </button>
        </p>
      </div>
    );
  }
}
