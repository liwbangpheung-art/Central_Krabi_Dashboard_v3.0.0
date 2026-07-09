export function LoadingScreen({ label = "กำลังตรวจสอบ Session..." }) {
  return (
    <main className="center-screen">
      <div className="loading-card">
        <span className="spinner" aria-hidden="true" />
        <p>{label}</p>
      </div>
    </main>
  );
}
