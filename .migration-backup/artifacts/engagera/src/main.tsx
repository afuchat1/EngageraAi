import { createRoot } from "react-dom/client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import App from "./App";
import "./index.css";

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Engagera] Uncaught error:", error, info);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#0a0a0a", color: "#fff", fontFamily: "sans-serif",
          padding: "2rem", textAlign: "center",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⚠️</div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#888", fontSize: "0.875rem", maxWidth: 400 }}>
            {(error as Error).message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1.5rem", padding: "0.5rem 1.25rem",
              background: "#fff", color: "#000", border: "none",
              borderRadius: "0.375rem", cursor: "pointer", fontSize: "0.875rem",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.state.error ? null : this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>,
);
