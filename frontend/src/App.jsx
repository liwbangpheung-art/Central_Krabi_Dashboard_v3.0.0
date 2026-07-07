import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { frontendEnvironment } from "./lib/config.js";
import { createSupabaseBrowserClient } from "./lib/supabase.js";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ConfigurationError } from "./components/ConfigurationError.jsx";
import { LoadingScreen } from "./components/LoadingScreen.jsx";
import { AppLayout } from "./components/AppLayout.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { MasterDataPage } from "./pages/MasterDataPage.jsx";
import { DailyEntryPage } from "./pages/DailyEntryPage.jsx";
import { ScrapSalesPage } from "./pages/ScrapSalesPage.jsx";
import { AnalyticsPage } from "./pages/AnalyticsPage.jsx";
import { ExportPage } from "./pages/ExportPage.jsx";
import { UserManagementPage } from "./pages/UserManagementPage.jsx";
import { DataQualityPage } from "./pages/DataQualityPage.jsx";
import { MonthlyCategoryEntryPage, RecycleMultiRowPage, WetWastePorkPage } from "./pages/TaskEntryPages.jsx";
import { AuditLogPage } from "./pages/AuditLogPage.jsx";
import { PermissionMatrixPage } from "./pages/PermissionMatrixPage.jsx";

function ProtectedApp({ config }) {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  return <AppLayout config={config} />;
}

function LoginRoute({ organizationName }) {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (session) return <Navigate to="/" replace />;
  return <LoginPage organizationName={organizationName} />;
}

export default function App() {
  if (frontendEnvironment.issues.length) return <ConfigurationError issues={frontendEnvironment.issues} />;
  const config = frontendEnvironment.config;
  const supabase = createSupabaseBrowserClient(config);

  return (
    <AuthProvider supabase={supabase}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute organizationName={config.organizationName} />} />
          <Route element={<ProtectedApp config={config} />}>
            <Route index element={<DashboardPage />} />
            <Route path="master-data" element={<MasterDataPage />} />
            <Route path="daily-entry" element={<DailyEntryPage />} />
            <Route path="entry/tissue" element={<MonthlyCategoryEntryPage module="tissue" title="กระดาษทิชชู่ (รายเดือน)" description="กรอกข้อมูลกระดาษทิชชู่แบบยอดรวมรายเดือน หรือเปิดโหมดรายวันเพื่อสะสมเป็นยอดรวม" dailyToggle monthlyButtonLabel="บันทึกข้อมูลกระดาษทิชชู่" />} />
            <Route path="entry/garbage-bag" element={<MonthlyCategoryEntryPage module="garbage_bag" title="ถุงดำ/ถุงขยะ (รายเดือน)" description="กรอกจำนวนถุงขยะแต่ละขนาดเป็นจำนวนเต็ม ระบบรวมยอดรายเดือนให้อัตโนมัติ" monthlyButtonLabel="บันทึกข้อมูลถุงขยะ" />} />
            <Route path="entry/rdf" element={<DailyEntryPage initialModule="waste" fixedModule fixedCategoryCode="RDF" headingTitle="ขยะ RDF (รายวัน)" headingDescription="กรอกปริมาณขยะ RDF รายวัน หน่วยกิโลกรัม สามารถใช้ทศนิยมได้" />} />
            <Route path="entry/dog-food" element={<DailyEntryPage initialModule="animal_feed" fixedModule fixedCategoryCode="DOG_FEED" headingTitle="อาหารหมา (รายวัน)" headingDescription="กรอกปริมาณอาหารหมารายวัน หน่วยกิโลกรัม สามารถใช้ทศนิยมได้" />} />
            <Route path="entry/wet-waste" element={<WetWastePorkPage />} />
            <Route path="entry/recycle" element={<RecycleMultiRowPage />} />
            <Route path="scrap-sales" element={<ScrapSalesPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="export" element={<ExportPage />} />
            <Route path="users" element={<UserManagementPage />} />
            <Route path="data-quality" element={<DataQualityPage />} />
            <Route path="audit-logs" element={<AuditLogPage />} />
            <Route path="permission-matrix" element={<PermissionMatrixPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
