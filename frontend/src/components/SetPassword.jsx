import React, { useState } from 'react'
import { authClient } from '../lib/supabase.js'

export default function SetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setMessage('')
    if (password.length < 8) return setMessage('รหัสผ่านต้องมีอย่างน้อย 8 ตัว')
    if (password !== confirm) return setMessage('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
    if (!authClient) return setMessage('ยังไม่ได้ตั้งค่า Supabase สำหรับ Frontend')
    setBusy(true)
    const { error } = await authClient.auth.updateUser({ password })
    setBusy(false)
    setMessage(error ? error.message : 'ตั้งรหัสผ่านสำเร็จแล้ว กรุณาเข้าสู่ระบบ')
  }
  return <main className="login-page"><section className="login-form-wrap"><form className="login-form" onSubmit={submit}>
    <p className="eyebrow">First-time access</p><h2>ตั้งรหัสผ่าน</h2>
    {message && <div className="alert">{message}</div>}
    <label className="field"><span>รหัสผ่านใหม่</span><input type="password" minLength="8" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
    <label className="field"><span>ยืนยันรหัสผ่าน</span><input type="password" minLength="8" value={confirm} onChange={e=>setConfirm(e.target.value)} required /></label>
    <button className="primary" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่าน'}</button>
    <a href="/">กลับหน้าเข้าสู่ระบบ</a>
  </form></section></main>
}
