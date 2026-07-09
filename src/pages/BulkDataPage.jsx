import { useCallback, useEffect, useState, useRef } from "react";
import { useOutletContext } from "react-router-dom";

const MODULE_LABELS = {
  waste: "ขยะ (Waste)",
  tissue: "กระดาษทิชชู่ (Tissue)",
  animal_feed: "อาหารสัตว์ (Animal Feed)",
  garbage_bag: "ถุงดำ/ถุงขยะ (Garbage Bag)",
  consumable: "วัสดุสิ้นเปลือง (Consumable)",
  scrap_material: "วัสดุรีไซเคิลเพื่อขาย (Scrap Material)",
};

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function parseExcelMonth(str) {
  str = String(str).trim().toLowerCase();
  if (!str) return null;
  
  // YYYY-MM or YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(str);
  if (isoMatch) {
    let y = parseInt(isoMatch[1], 10);
    if (y > 2500) y -= 543; // Thai year fallback
    return `${y}-${isoMatch[2]}-01`;
  }
  
  // DD/MM/YYYY or MM/YYYY
  const slashMatch = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(str);
  if (slashMatch) {
    let m = slashMatch[1];
    let yStr = slashMatch[2];
    if (slashMatch[3]) {
      m = slashMatch[2]; // it was DD/MM/YYYY
      yStr = slashMatch[3];
    }
    let y = parseInt(yStr, 10);
    if (y < 100) y += 2000; // rough guess
    if (y > 2500) y -= 543;
    return `${y}-${m.padStart(2, '0')}-01`;
  }

  // Format like "Nov 68", "Mar-69", "april69"
  const monthMatch = str.match(/([a-z]+)[\s-]*(\d{2,4})/);
  if (monthMatch) {
    let [_, mName, yStr] = monthMatch;
    let monthIdx = MONTH_NAMES.findIndex(m => mName.startsWith(m));
    if (monthIdx !== -1) {
      let y = parseInt(yStr, 10);
      if (y < 100) y += 2500;
      if (y > 2500) y -= 543;
      const mm = String(monthIdx + 1).padStart(2, '0');
      return `${y}-${mm}-01`;
    }
  }
  return null;
}

// Custom simple CSV splitter handling quotes properly
function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i+1] === '"') {
      current += '"';
      i++; // skip escaped quote
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(s => s.trim());
}

export function BulkDataPage() {
  const { api, profile } = useOutletContext();
  const isAuthorized = profile?.role === "owner" || profile?.role === "admin";

  const [categories, setCategories] = useState([]);
  const [exportYear, setExportYear] = useState(() => String(new Date().getFullYear()));
  const [exportModule, setExportModule] = useState("waste");
  const [exportState, setExportState] = useState({ loading: false, error: null });

  const [importFile, setImportFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [importNotice, setImportNotice] = useState(null);
  const [importState, setImportState] = useState({ loading: false, saving: false });
  const fileInputRef = useRef(null);

  const loadCategories = useCallback(async () => {
    try {
      const data = await api.request("/api/master-data?status=all");
      setCategories(data.items ?? []);
    } catch (err) {
      console.error("Failed to load categories for bulk page", err);
    }
  }, [api]);

  useEffect(() => {
    if (isAuthorized) {
      loadCategories();
    }
  }, [isAuthorized, loadCategories]);

  function downloadCsv(fileName, csvContent) {
    const blob = new Blob(["\ufeff", csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleExport() {
    setExportState({ loading: true, error: null });
    try {
      const targetCats = categories.filter(c => c.module === exportModule && c.active);
      if (!targetCats.length) throw new Error("ไม่พบข้อมูลประเภทวัสดุย่อยที่เปิดใช้งานในกลุ่มนี้");

      const params = new URLSearchParams({ year: exportYear });
      const data = await api.request(`/api/bulk-entries?${params.toString()}`);
      
      const moduleEntries = (data.items || []).filter(item => item.module === exportModule);
      
      const matrix = {};
      for (const item of moduleEntries) {
        const month = item.date.slice(0, 7); // 'YYYY-MM'
        if (!matrix[month]) matrix[month] = {};
        if (!matrix[month][item.categoryCode]) matrix[month][item.categoryCode] = 0;
        matrix[month][item.categoryCode] += item.quantity;
      }

      // Header row
      const headerRow = ["Month", ...targetCats.map(c => `"[${c.code}] ${c.name_th.replace(/"/g, '""')}"`), "Total"];
      const csvRows = [headerRow];

      // Generate 12 months for the year
      const allMonths = Array.from({length: 12}, (_, i) => `${exportYear}-${String(i+1).padStart(2, '0')}`);
      
      for (const month of allMonths) {
        const row = [month];
        let total = 0;
        for (const c of targetCats) {
          const val = matrix[month]?.[c.code] || 0;
          row.push(val > 0 ? val : "");
          total += val;
        }
        row.push(total > 0 ? total : "");
        csvRows.push(row);
      }

      const csvContent = csvRows.map(row => row.join(",")).join("\n");
      const fileName = `bulk_export_${exportModule}_${exportYear}.csv`;
      
      downloadCsv(fileName, csvContent);
      setExportState({ loading: false, error: null });
    } catch (err) {
      setExportState({ loading: false, error: err.message || "เกิดข้อผิดพลาดในการดาวน์โหลดข้อมูล" });
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportNotice(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        if (!text) throw new Error("ไฟล์ไม่มีข้อมูล");

        const lines = text.split(/\r?\n/);
        if (lines.length < 2) throw new Error("ไฟล์ CSV ต้องมีอย่างน้อย 2 บรรทัด (Header + Data)");

        const header = splitCsvLine(lines[0]);
        
        const codeRegex = /\[([A-Z0-9_]+)\]/;
        const colToCode = {};
        for (let c = 1; c < header.length; c++) {
           const h = header[c];
           if (!h || h.toLowerCase() === 'total') continue;
           
           const match = h.match(codeRegex);
           if (match) {
              colToCode[c] = match[1]; 
           } else {
              // Try to find matching category by name_th exactly if code isn't present
              const found = categories.find(cat => cat.name_th === h);
              if (found) {
                 colToCode[c] = found.code;
              }
           }
        }

        if (Object.keys(colToCode).length === 0) {
           throw new Error("ไม่พบข้อมูลคอลัมน์ หรือชื่อประเภทข้อมูลที่ตรงกันในหัวตาราง โปรดใช้แบบฟอร์มที่ส่งออกจากระบบ");
        }

        const rows = [];
        let skippedLines = 0;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) {
             skippedLines++;
             continue;
          }
          
          const cells = splitCsvLine(line);
          const monthStr = cells[0];
          if (!monthStr) {
             skippedLines++;
             continue;
          }

          const date = parseExcelMonth(monthStr);
          if (!date) {
             throw new Error(`บรรทัดที่ ${i+1}: รูปแบบเดือนไม่ถูกต้อง (${monthStr}) กรุณาระบุเป็น YYYY-MM (เช่น 2024-01) หรือรูปแบบเดือนภาษาอังกฤษ (เช่น Nov 68)`);
          }

          for (const [colIdx, code] of Object.entries(colToCode)) {
             let valStr = cells[colIdx];
             if (valStr && valStr !== "") {
                valStr = valStr.replace(/,/g, ''); // remove comma formatting
                const qty = Number(valStr);
                if (isNaN(qty)) throw new Error(`บรรทัดที่ ${i+1}: ค่าปริมาณของคอลัมน์ '${header[colIdx]}' ไม่ใช่ตัวเลข (${cells[colIdx]})`);
                if (qty > 0) {
                   rows.push({
                      date,
                      categoryCode: code,
                      quantity: qty,
                      note: ""
                   });
                }
             }
          }
        }

        if (!rows.length) throw new Error("ไม่พบข้อมูลปริมาณตัวเลขที่จะนำเข้า (พบแต่ค่าว่าง หรือ 0)");

        setParsedRows(rows);
        setPreviewRows(rows.slice(0, 15)); // Preview up to 15 entries
        setImportNotice({
          type: "info",
          message: `วิเคราะห์ไฟล์สำเร็จ: อ่านข้อมูลรวมได้ ${rows.length.toLocaleString("th-TH")} รายการ (ละทิ้งบรรทัดว่าง/ไม่มีวันที่ ${skippedLines} บรรทัด)`
        });
      } catch (err) {
        setImportFile(null);
        setParsedRows([]);
        setPreviewRows([]);
        setImportNotice({ type: "error", message: err.message });
      }
    };
    reader.onerror = () => {
      setImportNotice({ type: "error", message: "อ่านไฟล์ล้มเหลว" });
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleImportSubmit() {
    if (!parsedRows.length) return;
    setImportState({ loading: false, saving: true });
    setImportNotice(null);

    try {
      const res = await api.request("/api/bulk-entries/import", {
        method: "POST",
        body: { rows: parsedRows }
      });

      if (res.success) {
        setImportNotice({
          type: "success",
          message: `นำเข้าข้อมูลแบบกลุ่มสำเร็จเรียบร้อย! นำเข้าข้อมูลจำนวน ${res.importedRowsCount.toLocaleString("th-TH")} รายการ (กระทบงวดเดือน: ${res.monthsAffected.map(m => m.slice(0, 7)).join(", ")})`
        });
        setImportFile(null);
        setParsedRows([]);
        setPreviewRows([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch (err) {
      const serverErrors = err.data?.errors || [];
      setImportNotice({
        type: "error",
        message: err.message || "เกิดข้อผิดพลาดในการตรวจสอบหรือบันทึกข้อมูล",
        errors: serverErrors
      });
    } finally {
      setImportState({ loading: false, saving: false });
    }
  }

  function handleClearImport() {
    setImportFile(null);
    setParsedRows([]);
    setPreviewRows([]);
    setImportNotice(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (!isAuthorized) {
    return (
      <section className="connection-error page-error" role="alert">
        <div>
          <p className="eyebrow">สิทธิ์การเข้าถึงระบบ</p>
          <h1>เฉพาะผู้ดูแลระบบและเจ้าของเท่านั้น</h1>
          <p>คุณไม่มีสิทธิ์ใช้งานหน้าจอนี้ เนื่องจากส่วนควบคุมนำเข้า/ส่งออกข้อมูลแบบกลุ่ม (CSV Bulk) ถูกสงวนไว้ให้เฉพาะผู้ดูแลระบบระดับสูงเท่านั้น</p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">จัดการระบบ / ความปลอดภัย</p>
          <h1>นำเข้าและส่งออกข้อมูล (CSV Bulk)</h1>
          <p>ดาวน์โหลดแบบฟอร์มข้อมูลรายปี หรืออัปโหลดไฟล์ Excel/CSV เพื่อนำเข้าข้อมูลแบบกลุ่มรายเดือน (รูปแบบตารางแนวขวางแบบตารางสรุปข้อมูล)</p>
        </div>
      </section>

      <div className="bulk-grid-layout" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginTop: "24px" }}>
        
        {/* Panel 1: Bulk Export */}
        <section className="quality-list-card bulk-card" style={{ padding: "24px" }}>
          <div className="card-heading" style={{ marginBottom: "20px" }}>
            <div>
              <p className="eyebrow">Data Export</p>
              <h2>ดาวน์โหลดแบบฟอร์มตาราง / ส่งออก</h2>
            </div>
          </div>

          <div style={{ display: "grid", gap: "16px", marginBottom: "24px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "700" }}>
              ปีงบประมาณ (ค.ศ.)
              <select 
                value={exportYear} 
                onChange={(e) => setExportYear(e.target.value)}
                style={{ padding: "12px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--surface)" }}
              >
                <option value="2024">2567 (2024)</option>
                <option value="2025">2568 (2025)</option>
                <option value="2026">2569 (2026)</option>
                <option value="2027">2570 (2027)</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "700" }}>
              กลุ่มประเภทข้อมูล (Module)
              <select 
                value={exportModule} 
                onChange={(e) => setExportModule(e.target.value)}
                style={{ padding: "12px", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--surface)" }}
              >
                {Object.entries(MODULE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "16px", lineHeight: "1.5" }}>
            ระบบจะสร้างไฟล์ตารางสรุปให้แต่ละประเภทย่อยเป็น<b>คอลัมน์</b> และเรียงงวดเดือนเป็น<b>แถว</b> 
            (เพื่อความสะดวกในการแก้ไขหรือป้อนข้อมูลเพิ่มเติมแล้วนำกลับมาอัปโหลดใหม่)
          </p>

          {exportState.error && (
            <div style={{ padding: "12px", borderRadius: "12px", background: "#fff0f3", border: "1px solid #ffc5d1", color: "#a91f42", fontSize: "0.85rem", marginBottom: "16px" }}>
              ⚠ {exportState.error}
            </div>
          )}

          <button 
            className="primary-button" 
            onClick={handleExport}
            disabled={exportState.loading}
            style={{ width: "100%", padding: "14px", borderRadius: "14px", fontWeight: "bold" }}
          >
            {exportState.loading ? "กำลังสร้างไฟล์..." : "⬇ ดาวน์โหลดไฟล์ CSV"}
          </button>
        </section>

        {/* Panel 2: Bulk Import */}
        <section className="quality-list-card bulk-card" style={{ padding: "24px" }}>
          <div className="card-heading" style={{ marginBottom: "20px" }}>
            <div>
              <p className="eyebrow">Data Import</p>
              <h2>อัปโหลดข้อมูลรายปี (ตารางสรุปแนวนอน)</h2>
            </div>
          </div>

          {!importFile ? (
            <div 
              style={{
                border: "2px dashed var(--border)",
                borderRadius: "16px",
                padding: "40px 20px",
                textAlign: "center",
                background: "var(--surface-muted)",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <span style={{ fontSize: "2rem", display: "block", marginBottom: "12px" }}>📁</span>
              <strong style={{ display: "block", marginBottom: "6px", color: "var(--accent-strong)" }}>คลิกเพื่อเลือกไฟล์ CSV</strong>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: "1.5", display: "inline-block", maxWidth: "80%" }}>
                รองรับไฟล์ที่ Export ออกจากระบบ หรือสร้างหัวตารางเป็นชื่อประเภทข้อมูลตรงตัว เช่น "ขยะเปียก", "Recycle", "ขยะทั่วไป"
              </span>
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".csv,text/csv" 
                hidden 
                onChange={handleFileChange} 
              />
            </div>
          ) : (
            <div style={{ padding: "16px", borderRadius: "16px", border: "1px solid var(--border)", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyItems: "space-between", gap: "12px", marginBottom: "16px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {importFile.name}</strong>
                <small style={{ color: "var(--text-muted)" }}>ขนาด ${(importFile.size / 1024).toFixed(2)} KB — สกัดข้อมูลได้ {parsedRows.length} รายการ</small>
              </div>
              <button 
                type="button" 
                className="secondary-button compact" 
                onClick={handleClearImport}
                style={{ background: "white", padding: "8px 12px" }}
              >
                เปลี่ยนไฟล์
              </button>
            </div>
          )}

          {importNotice && (
            <div 
              style={{
                padding: "16px",
                borderRadius: "16px",
                marginTop: "16px",
                marginBottom: "16px",
                fontSize: "0.85rem",
                lineHeight: "1.5",
                background: importNotice.type === "success" ? "#e8f5e9" : importNotice.type === "error" ? "#fff0f3" : "#e0f2f1",
                border: `1px solid ${importNotice.type === "success" ? "#a5d6a7" : importNotice.type === "error" ? "#ffc5d1" : "#80cbc4"}`,
                color: importNotice.type === "success" ? "#2e7d32" : importNotice.type === "error" ? "#c73558" : "#004d40"
              }}
            >
              <strong>{importNotice.type === "success" ? "✓ นำเข้าสำเร็จ" : importNotice.type === "error" ? "⚠ เกิดข้อผิดพลาด" : "ℹ ข้อมูลเตรียมนำเข้า"}</strong>
              <p style={{ margin: "6px 0 0 0" }}>{importNotice.message}</p>
              
              {importNotice.errors && importNotice.errors.length > 0 && (
                <ul style={{ margin: "10px 0 0 0", paddingLeft: "20px", maxHeight: "150px", overflowY: "auto", fontSize: "0.8rem", listStyleType: "square" }}>
                  {importNotice.errors.map((errText, idx) => (
                    <li key={idx} style={{ marginBottom: "4px" }}>{errText}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {parsedRows.length > 0 && (
            <div style={{ marginTop: "20px" }}>
              <button 
                className="primary-button" 
                onClick={handleImportSubmit}
                disabled={importState.saving}
                style={{ width: "100%", padding: "14px", borderRadius: "14px", fontWeight: "bold" }}
              >
                {importState.saving ? "กำลังบันทึกข้อมูล..." : "⚡ ยืนยันการบันทึกฐานข้อมูล"}
              </button>
            </div>
          )}
        </section>
      </div>

      {previewRows.length > 0 && (
        <section className="quality-list-card" style={{ marginTop: "24px" }}>
          <div className="card-heading">
            <div>
              <p className="eyebrow">Parsed Data Preview</p>
              <h2>ตัวอย่างข้อมูลที่สกัดได้จากตาราง 15 รายการแรก (ระบบนำมาจำแนกให้อัตโนมัติ)</h2>
            </div>
          </div>
          <div className="table-scroll">
            <table className="v3-data-table">
              <thead>
                <tr>
                  <th>วันที่ของงวด (Date)</th>
                  <th>รหัสประเภท (Category)</th>
                  <th className="numeric-cell">ปริมาณ (Quantity)</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr key={idx}>
                    <td className="numeric-cell">{row.date}</td>
                    <td>
                      <code style={{ fontSize: "0.85rem", color: "var(--accent-strong)" }}>{row.categoryCode}</code>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginLeft: "8px" }}>
                        ({categories.find(c => c.code === row.categoryCode)?.name_th || 'ไม่ทราบ'})
                      </span>
                    </td>
                    <td className="numeric-cell"><strong>{row.quantity.toLocaleString("th-TH", { maximumFractionDigits: 4 })}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
