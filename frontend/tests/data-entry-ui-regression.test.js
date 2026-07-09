import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const srcRoot = path.resolve(process.cwd(), "src");
const dailyEntrySource = fs.readFileSync(path.join(srcRoot, "pages", "DailyEntryPage.jsx"), "utf8");
const taskEntrySource = fs.readFileSync(path.join(srcRoot, "pages", "TaskEntryPages.jsx"), "utf8");

describe("v3 data-entry UI regression guards", () => {
  it("keeps table toggle wording consistent across entry pages", () => {
    const combined = `${dailyEntrySource}\n${taskEntrySource}`;
    expect(combined).toContain("ดูข้อมูลแบบตาราง");
    expect(combined).toContain("ซ่อนตารางข้อมูล");
    expect(combined).not.toContain("ซ่อนตาราง\" : \"ดูข้อมูลแบบตาราง");
  });

  it("keeps daily save action in the form panel, not in the main tools panel", () => {
    const toolsStart = dailyEntrySource.indexOf("v3-entry-tools");
    const gridStart = dailyEntrySource.indexOf("daily-grid-card", toolsStart);
    const toolsBlock = dailyEntrySource.slice(toolsStart, gridStart);
    expect(toolsBlock).toContain("เครื่องมือหลัก");
    expect(toolsBlock).toContain("นำเข้า CSV");
    expect(toolsBlock).toContain("ส่งออก CSV");
    expect(toolsBlock).not.toContain("saveMonth");
    expect(toolsBlock).not.toContain("บันทึกข้อมูลรายวัน");

    const formSaveStart = dailyEntrySource.indexOf("v3-form-save", gridStart);
    const weeklyStart = dailyEntrySource.indexOf("weekly-summary-card", formSaveStart);
    const formSaveBlock = dailyEntrySource.slice(formSaveStart, weeklyStart);
    expect(formSaveBlock).toContain("saveMonth");
    expect(formSaveBlock).toContain("บันทึกข้อมูลรายวัน");
  });

  it("keeps recycle modal supporting add, edit, note, and delete actions", () => {
    expect(taskEntrySource).toContain("openAddRecycleModal");
    expect(taskEntrySource).toContain("openEditRecycleModal");
    expect(taskEntrySource).toContain("deleteRecycleItem");
    expect(taskEntrySource).toContain("บันทึกการแก้ไข");
    expect(taskEntrySource).toContain("บันทึกรายการ");
    expect(taskEntrySource).toContain("placeholder=\"หมายเหตุ\"");
  });

  it("keeps wet-waste modal explaining the calculation and saving pig food explicitly", () => {
    expect(taskEntrySource).toContain("ขยะเปียกรวม = อาหารหมา + อาหารหมู");
    expect(taskEntrySource).toContain("บันทึกอาหารหมู");
    expect(taskEntrySource).toContain("showWetTable");
  });
});
