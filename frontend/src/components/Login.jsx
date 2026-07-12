import React, { useState } from 'react'
import { apiFetch } from '../api.js'

function readableLoginError(error) {
  const message = error?.message || String(error);
  if (/invalid login credentials/iu.test(message) || /อีเมลหรือรหัสผ่านไม่ถูกต้อง/iu.test(message)) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  }
  return message;
}

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password })
      })
      if (res?.token) {
        localStorage.setItem('ckap_token', res.token)
        onLoginSuccess()
      } else {
        throw new Error("ไม่มี token ส่งกลับมาจากระบบ")
      }
    } catch (nextError) {
      setError(readableLoginError(nextError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual" aria-hidden="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
          <div className="brand-card">CENTRAL<br />KRABI</div>
          <img src="/mascot.png" alt="Central Mascot" style={{ width: '80px', height: '80px', objectFit: 'contain', background: 'rgba(255, 255, 255, 0.95)', padding: '6px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }} />
        </div>
        <div style={{ marginTop: '20px' }}>
          <p className="eyebrow">Waste & Resource Management</p>
          <h1>ข้อมูลที่ชัดเจน<br />เริ่มจากระบบที่เชื่อถือได้</h1>
          <p>ระบบจัดการขยะและทรัพยากรสำหรับ Central Krabi</p>
        </div>
        <small>Central Krabi Environmental Operations v3.0.9</small>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <p className="eyebrow">Secure Access</p>
          <h2>เข้าสู่ระบบ</h2>
          <p className="muted">สำหรับผู้ใช้งาน Central Krabi Analytics Platform</p>

          {error && <div className="alert error" role="alert">{error}</div>}

          <div className="field">
            <span>อีเมล</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <span>รหัสผ่าน</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button className="primary" style={{ width: '100%', marginTop: '14px', minHeight: '48px' }} disabled={submitting}>
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </section>
    </main>
  )
}
