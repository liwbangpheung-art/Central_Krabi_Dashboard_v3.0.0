import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalizeThaiDigits, validateNumericInput, dateBelongsToMonth } from '../src/lib/validation.js'
import { exportEntriesCsv, parseEntriesCsv } from '../src/lib/csv-engine.js'
import { getModuleConfig, getGroupedConfig, getWeekIndex } from '../src/lib/ledger-config.js'
import { suggestUnit } from '../src/lib/unit-suggestions.js'

test('เลขไทยถูกแปลงและตรวจชนิดข้อมูล', () => {
  assert.equal(normalizeThaiDigits('๑๒.๕'), '12.5')
  assert.equal(validateNumericInput('กด', { label:'น้ำหนัก' }).error.includes('ลืมเปลี่ยนภาษา'), true)
  assert.equal(validateNumericInput('-1').error.length > 0, true)
  assert.equal(validateNumericInput('1.5', { integer:true }).error.length > 0, true)
  assert.equal(dateBelongsToMonth('2026-07-12','2026-07'), true)
})

test('CSV export แล้ว import กลับได้', () => {
  const source=[{id:'abc',module:'rdf',entry_date:'2026-07-01',period_month:'2026-07-01',material_name:'RDF',weight_kg:12.5,unit:'kg',notes:'ทดสอบ,ภาษาไทย',metadata:{value_type:'actual_daily'}}]
  const parsed=parseEntriesCsv(exportEntriesCsv(source,'rdf','2026-07'),'rdf','2026-07')
  assert.equal(parsed.length,1); assert.deepEqual(parsed[0].errors,[])
  assert.equal(parsed[0].entry.id,'abc'); assert.equal(parsed[0].entry.weight_kg,12.5)
  assert.equal(parsed[0].entry.notes,'ทดสอบ,ภาษาไทย')
})

test('CSV ปฏิเสธหมวดและเดือนผิด', () => {
  const csv=exportEntriesCsv([{module:'rdf',entry_date:'2026-06-01',period_month:'2026-06-01'}],'rdf','2026-06')
  const parsed=parseEntriesCsv(csv,'dog_food','2026-07')
  assert.equal(parsed[0].errors.length > 0,true)
})

test('Frontend permissions fail closed', () => {
  for (const file of ['Workspace.jsx','DataEntry.jsx','AnnualLedger.jsx']) {
    const source=fs.readFileSync(new URL(`../src/components/${file}`,import.meta.url),'utf8')
    assert.equal(source.includes('permissions.length === 0 ||'),false)
    assert.equal(source.includes('!permissions.length ||'),false)
  }
})

test('Ledger configuration remains module-specific', () => {
  assert.equal(getModuleConfig('recycle').type, 'sales')
  assert.equal(getModuleConfig('tissue').showAmount, false)
  assert.equal(getModuleConfig('rdf').type, 'weight')
  assert.deepEqual(getGroupedConfig('black_bag').cols, ['period','module','qty','count'])
  assert.equal(getWeekIndex(28), 4)
})

test('Master Data unit suggestions follow module and keywords', () => {
  assert.equal(suggestUnit('rdf','RDF').unit,'kg')
  assert.equal(suggestUnit('black_bag','ถุงดำใหญ่').unit,'ใบ')
  assert.equal(suggestUnit('tissue','ทิชชู่ม้วนใหญ่').unit,'ม้วน')
  assert.equal(suggestUnit('consumable','น้ำยาเช็ดพื้น').unit,'แกลลอน')
  assert.equal(suggestUnit('consumable','อุปกรณ์ไม่ระบุ').confidence,'unknown')
})
