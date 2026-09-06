import { Component } from "react";

/* מסך לבן באמצע שיעור הוא התרחיש הגרוע ביותר: אין מה לעשות מולו,
   וגם לא ברור אם הפנקס נפגע. הגבול הזה מבטיח שתמיד יישאר משהו על המסך
   שאומר מה קרה, ומזכיר שהפנקס עצמו שמור ולא הלך לאיבוד. */
export default class ErrorBoundary extends Component {
  state = { err: null };

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    console.error("שגיאה באפליקציה:", err, info);
  }

  render() {
    if (!this.state.err) return this.props.children;
    const box = {
      maxWidth: 560,
      margin: "40px auto",
      background: "#211D2E",
      border: "1px solid #3A3350",
      borderRadius: 14,
      padding: 20,
      color: "#F3EFE7",
      fontFamily: "'Heebo', system-ui, sans-serif",
      lineHeight: 1.7,
    };
    return (
      <div dir="rtl" style={{ background: "#161320", minHeight: "100vh", padding: "22px 16px" }}>
        <div style={box}>
          <h1 style={{ fontSize: 22, margin: "0 0 10px" }}>משהו נשבר</h1>
          <p style={{ color: "#A79FBD", margin: "0 0 6px" }}>
            הפנקס שמור — גם במכשיר וגם בגיליון, אם התחברת. רענון הדף בדרך כלל פותר.
          </p>
          <p style={{ color: "#A79FBD", margin: "0 0 16px", fontSize: 14 }}>
            אם זה חוזר, אפשר לחלק ידנית היום ולדווח על השגיאה למטה.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => location.reload()}
              style={{
                background: "#63B7A6",
                color: "#0C2320",
                border: "none",
                borderRadius: 10,
                padding: "11px 18px",
                fontSize: 16,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              רענן את הדף
            </button>
          </div>
          <pre
            dir="ltr"
            style={{
              marginTop: 16,
              padding: 10,
              background: "#161320",
              border: "1px solid #3A3350",
              borderRadius: 10,
              color: "#A79FBD",
              fontSize: 12,
              whiteSpace: "pre-wrap",
              overflowX: "auto",
            }}
          >
            {String(this.state.err && (this.state.err.stack || this.state.err.message || this.state.err))}
          </pre>
        </div>
      </div>
    );
  }
}
