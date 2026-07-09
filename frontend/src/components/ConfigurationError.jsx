export function ConfigurationError({ issues }) {
  return (
    <main className="center-screen">
      <section className="config-panel">
        <div className="brand-mark">CENTRAL<br />KRABI</div>
        <p className="eyebrow">Configuration Required</p>
        <h1>ระบบยังไม่ได้ตั้งค่าให้ครบ</h1>
        <p>แก้ Environment Variables ด้านล่าง แล้ว Build/Deploy Frontend ใหม่</p>
        <ul className="issue-list">
          {issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
        <div className="code-hint">
          <code>frontend/.env</code> สำหรับ Localhost หรือ Render Frontend Environment สำหรับ Production
        </div>
      </section>
    </main>
  );
}
