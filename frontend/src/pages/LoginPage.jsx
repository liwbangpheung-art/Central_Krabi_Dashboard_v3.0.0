import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

function readableLoginError(error) {
  const message = error?.message || "เข้าสู่ระบบไม่สำเร็จ";
  if (/invalid login credentials/iu.test(message)) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (/email not confirmed/iu.test(message)) return "บัญชียังไม่ได้ยืนยันอีเมล";
  return message;
}

export function LoginPage({ organizationName }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (nextError) {
      setError(readableLoginError(nextError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="brand-card">CENTRAL<br />KRABI</div>
        <div>
          <p className="eyebrow">Waste & Resource Management</p>
          <h1>ข้อมูลที่ชัดเจน<br />เริ่มจากระบบที่เชื่อถือได้</h1>
          <p>Phase 2 — Login, Role, Master Data และ Price History สำหรับ {organizationName}</p>
        </div>
        <small>Central Krabi Environmental Operations</small>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <p className="eyebrow">Secure Access</p>
          <h2>เข้าสู่ระบบ</h2>
          <p className="muted">สำหรับผู้ใช้งาน {organizationName}</p>

          {error && <div className="alert alert-error" role="alert">{error}</div>}

          <label>
            อีเมล
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            รหัสผ่าน
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="primary-button" disabled={submitting}>
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </section>
    </main>
  );
}
