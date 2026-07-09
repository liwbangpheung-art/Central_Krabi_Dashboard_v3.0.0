import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled frontend error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="center-screen">
          <section className="error-panel">
            <p className="eyebrow">Frontend Error Boundary</p>
            <h1>หน้าเว็บเกิดข้อผิดพลาด</h1>
            <p>{this.state.error.message}</p>
            <button className="primary-button" onClick={() => window.location.reload()}>โหลดหน้าใหม่</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
