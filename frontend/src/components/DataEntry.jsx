import React, { useMemo, useRef, useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  apiFetch, currentMonth, formatNumber, toNumber 
} from '../api.js'
import { thaiMonthLabel, moduleLabels } from '../lib/report-builder.js'
import MonthPicker from './MonthPicker.jsx'
import { validateNumericInput, dateBelongsToMonth } from '../lib/validation.js'
import { exportEntriesCsv, downloadCsv, parseEntriesCsv } from '../lib/csv-engine.js'
import { 
  Flame, Bone, Utensils, Droplets, RefreshCw, FileText, ShoppingBag, Package,
  Calendar as CalendarIcon, Info, Plus, Trash2, Edit3, X 
} from 'lucide-react'
const moduleOptions = [
  { value: 'rdf', label: 'RDF / ขยะเชื้อเพลิง', icon: Flame },
  { value: 'dog_food', label: 'อาหารหมา', icon: Bone },
  { value: 'pig_feed', label: 'อาหารหมู', icon: Utensils },
  { value: 'wet_waste', label: 'ขยะเปียก', icon: Droplets },
  { value: 'recycle', label: 'รีไซเคิล', icon: RefreshCw },
  { value: 'tissue', label: 'กระดาษทิชชู่', icon: FileText },
  { value: 'black_bag', label: 'ถุงดำ', icon: ShoppingBag },
  { value: 'consumable', label: 'ของใช้สิ้นเปลือง', icon: Package }
]

export const dbModuleMap = {
  rdf: 'rdf',
  dog_food: 'dog_food',
  pig_feed: 'pig_feed',
  wet_waste: 'wet_waste',
  recycle: 'recycle',
  tissue: 'tissue',
  black_bag: 'black_bag',
  consumable: 'cleaning_liquid'
}

export default function DataEntry({ permissions = [] }) {
  const can = (p) => permissions.includes(p)
  const [module, setModule] = useState('rdf')
  const [month, setMonth] = useState(currentMonth())
  const [entryMode, setEntryMode] = useState('daily') // 'daily' or 'monthly'

  const getHybridTitle = () => {
    if (module === 'tissue') return 'บันทึกยอดกระดาษทิชชู่'
    if (module === 'black_bag') return 'บันทึกยอดถุงดำ'
    return 'บันทึกยอดของใช้สิ้นเปลือง'
  }

  const getHybridUnitLabel = () => {
    if (module === 'tissue') return 'แพ็ค'
    if (module === 'black_bag') return 'ใบ'
    return 'แกลลอน'
  }
  
  const handleModuleChange = (newModule) => {
    setModule(newModule)
    setSelectedCategoryFilter('all')
    if (newModule === 'black_bag' || newModule === 'consumable') {
      setEntryMode('monthly')
    } else if (newModule === 'tissue') {
      setEntryMode('daily')
    } else {
      setEntryMode('daily')
    }
  }
  
  // Recyclable & Tissue type filters
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all')

  // Selected date/item for modal
  const [selectedDate, setSelectedDate] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [csvPreview, setCsvPreview] = useState([])
  const csvInputRef = useRef(null)
  const [editingEntry, setEditingEntry] = useState(null)

  // Modal form states
  const [form, setForm] = useState({
    id: '',
    category_code: '',
    weight_kg: '',
    quantity: '',
    unit: 'kg',
    unit_price: '',
    amount: '',
    notes: ''
  })

  const queryClient = useQueryClient()

  // Queries
  const { data: categories = [] } = useQuery({
    queryKey: ['master-categories'],
    queryFn: () => apiFetch('/api/master-categories')
  })

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['entries', module, month],
    queryFn: () => apiFetch(`/api/entries?module=${module}&month=${month}`)
  })

  // Fetch Dog Food and Pig Feed for Wet Waste calculations
  const { data: dogFoodRows = [] } = useQuery({
    queryKey: ['entries', 'dog_food', month],
    queryFn: () => apiFetch(`/api/entries?module=dog_food&month=${month}`),
    enabled: module === 'wet_waste'
  })

  const { data: pigFeedRows = [] } = useQuery({
    queryKey: ['entries', 'pig_feed', month],
    queryFn: () => apiFetch(`/api/entries?module=pig_feed&month=${month}`),
    enabled: module === 'wet_waste'
  })

  // Filter categories by current module
  const moduleCategories = useMemo(() => {
    const dbModule = dbModuleMap[module] || module
    let filtered = categories.filter(c => c.module === dbModule)
    if (module === 'dog_food') {
      filtered = filtered.filter(c => c.code === 'DOG_FOOD')
    } else if (module === 'pig_feed') {
      filtered = filtered.filter(c => c.code === 'PIG_FEED')
    } else if (module === 'rdf') {
      filtered = filtered.filter(c => c.code === 'RDF')
    }
    return filtered
  }, [categories, module])

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (payload) => payload.id
      ? apiFetch(`/api/entries/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : apiFetch('/api/entries', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries', module, month] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      resetModalForm()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => apiFetch(`/api/entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries', module, month] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    }
  })

  // State for daily calendar values (batch edit)
  const [dayValues, setDayValues] = useState({})
  const [monthlyValues, setMonthlyValues] = useState({})
  const [isSavingBatch, setIsSavingBatch] = useState(false)

  const totalDays = useMemo(() => {
    if (!month) return 0
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m, 0).getDate()
  }, [month])

  // Initialize dayValues whenever rows, month, module, or moduleCategories changes
  useEffect(() => {
    if (!month || !totalDays) return
    
    const newValues = {}
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`
      newValues[d] = {}
      
      const isSingleCategoryModule = module === 'rdf' || module === 'dog_food'
      if (moduleCategories.length > 0 && !isSingleCategoryModule) {
        moduleCategories.forEach(cat => {
          const entry = rows.find(r => r.entry_date === dateStr && r.category_code === cat.code && r.metadata?.entry_mode !== 'monthly')
          newValues[d][cat.code] = entry 
            ? (entry.weight_kg !== null ? String(entry.weight_kg) : String(entry.quantity))
            : ''
        })
      } else {
        // For no categories or single category modules like rdf and dog_food, use .value
        const entry = rows.find(r => {
          if (isSingleCategoryModule && moduleCategories.length > 0) {
            // Find by category code if categories exist
            return r.entry_date === dateStr && r.category_code === moduleCategories[0].code && r.metadata?.entry_mode !== 'monthly'
          }
          return r.entry_date === dateStr && r.metadata?.entry_mode !== 'monthly'
        })
        newValues[d].value = entry 
          ? (entry.weight_kg !== null ? String(entry.weight_kg) : String(entry.quantity))
          : ''
      }
    }
    setDayValues(newValues)
  }, [rows, month, totalDays, module, moduleCategories])

  // Initialize monthlyValues for sub-categories
  useEffect(() => {
    const newVals = {}
    moduleCategories.forEach(cat => {
      const existing = rows.find(r => r.category_code === cat.code && r.metadata?.entry_mode === 'monthly')
      newVals[cat.code] = {
        quantity: existing ? String(existing.quantity || existing.weight_kg || '') : '',
        amount: existing ? String(existing.amount || '') : ''
      }
    })
    setMonthlyValues(newVals)
  }, [rows, moduleCategories])

  const handleDayValueChange = (day, categoryCode, value) => {
    const result = validateNumericInput(value, { integer: module === 'black_bag' || module === 'consumable', label: 'จำนวน' })
    setValidationError(result.error)
    setDayValues(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [categoryCode]: result.value
      }
    }))
  }

  const handleSingleDayValueChange = (day, value) => {
    const result = validateNumericInput(value, { label: 'น้ำหนัก' })
    setValidationError(result.error)
    setDayValues(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        value: result.value
      }
    }))
  }

  const handleMonthlyValueChange = (categoryCode, field, value) => {
    const result = validateNumericInput(value, { integer: field === 'quantity' && (module === 'black_bag' || module === 'consumable'), label: field === 'amount' ? 'ยอดเงิน' : 'จำนวน' })
    setValidationError(result.error)
    setMonthlyValues(prev => ({
      ...prev,
      [categoryCode]: {
        ...prev[categoryCode],
        [field]: result.value
      }
    }))
  }

  // Batch Save Mutation
  const batchSaveMutation = useMutation({
    mutationFn: (payloads) => apiFetch('/api/entries/batch', { method: 'POST', body: JSON.stringify(payloads) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries', module, month] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setIsSavingBatch(false)
      window.alert('บันทึกข้อมูลสำเร็จแล้ว')
    },
    onError: (err) => {
      setIsSavingBatch(false)
      window.alert('บันทึกข้อมูลไม่สำเร็จ: ' + err.message)
    }
  })

  const handleSaveCalendar = () => {
    if (!can('entries.create')) return
    for (const [day, values] of Object.entries(dayValues)) {
      for (const value of Object.values(values || {})) {
        const result = validateNumericInput(value, { integer: module === 'black_bag' || module === 'consumable', label: `ข้อมูลวันที่ ${day}` })
        if (result.error) { setValidationError(result.error); return window.alert(result.error) }
      }
    }
    setValidationError('')
    setIsSavingBatch(true)
    
    const payloads = []
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`
      
      if (moduleCategories.length > 0) {
        moduleCategories.forEach(cat => {
          const existing = rows.find(r => r.entry_date === dateStr && r.category_code === cat.code && r.metadata?.entry_mode !== 'monthly')
          const isSingleCategoryModule = module === 'rdf' || module === 'dog_food'
          const valStr = isSingleCategoryModule ? dayValues[d]?.value : dayValues[d]?.[cat.code]
          if ((valStr === '' || valStr === undefined) && !existing) return
          const val = valStr !== '' && valStr !== undefined ? toNumber(valStr) : 0
          
          payloads.push({
            id: existing?.id || null,
            module,
            category_code: cat.code,
            entry_date: dateStr,
            period_month: `${month}-01`,
            material_name: cat.name_th,
            weight_kg: (module === 'tissue' || module === 'black_bag' || module === 'consumable') ? null : val,
            quantity: (module === 'tissue' || module === 'black_bag' || module === 'consumable') ? val : null,
            unit: cat.unit,
            unit_price: existing?.unit_price || null,
            amount: existing?.unit_price ? val * toNumber(existing.unit_price) : (existing?.amount || null),
            notes: existing?.notes || '',
            metadata: { entry_mode: 'daily' }
          })
        })
      } else {
        const existing = rows.find(r => r.entry_date === dateStr && r.metadata?.entry_mode !== 'monthly')
        const valStr = dayValues[d]?.value
        if ((valStr === '' || valStr === undefined) && !existing) continue
        const val = valStr !== '' && valStr !== undefined ? toNumber(valStr) : 0
        
        payloads.push({
          id: existing?.id || null,
          module,
          category_code: null,
          entry_date: dateStr,
          period_month: `${month}-01`,
          material_name: moduleLabels[module] || module,
          weight_kg: val,
          quantity: null,
          unit: 'kg',
          unit_price: null,
          amount: null,
          notes: existing?.notes || '',
          metadata: {}
        })
      }
    }

    if (payloads.length === 0) {
      setIsSavingBatch(false)
      window.alert('ไม่มีข้อมูลที่มีการเปลี่ยนแปลงหรือกรอกเพิ่มเพื่อบันทึก')
      return
    }
    batchSaveMutation.mutate(payloads)
  }

  const handleSaveMonthlyAll = () => {
    if (!can('entries.create')) return
    for (const values of Object.values(monthlyValues)) {
      for (const [field, value] of Object.entries(values || {})) {
        const result = validateNumericInput(value, { integer: field === 'quantity' && (module === 'black_bag' || module === 'consumable'), label: field === 'amount' ? 'ยอดเงิน' : 'จำนวน' })
        if (result.error) { setValidationError(result.error); return window.alert(result.error) }
      }
    }
    setValidationError('')
    setIsSavingBatch(true)
    
    const payloads = []
    moduleCategories.forEach(cat => {
      const existing = rows.find(r => r.category_code === cat.code && r.metadata?.entry_mode === 'monthly')
      const vals = monthlyValues[cat.code] || { quantity: '', amount: '' }
      
      const val = vals.quantity !== '' && vals.quantity !== undefined ? toNumber(vals.quantity) : 0
      const amt = vals.amount !== '' && vals.amount !== undefined ? toNumber(vals.amount) : null
      
      if (val > 0 || amt > 0 || existing) {
        payloads.push({
          id: existing?.id || null,
          module,
          category_code: cat.code,
          entry_date: `${month}-01`,
          period_month: `${month}-01`,
          material_name: cat.name_th,
          weight_kg: (module === 'tissue' || module === 'black_bag' || module === 'consumable') ? null : val,
          quantity: (module === 'tissue' || module === 'black_bag' || module === 'consumable') ? val : null,
          unit: cat.unit,
          unit_price: null,
          amount: amt,
          notes: existing?.notes || '',
          metadata: { entry_mode: 'monthly' }
        })
      }
    })

    if (payloads.length === 0) {
      setIsSavingBatch(false)
      window.alert('ไม่มีข้อมูลที่มีการเปลี่ยนแปลงหรือกรอกเพิ่มเพื่อบันทึก')
      return
    }
    batchSaveMutation.mutate(payloads)
  }

  // Reset modal form
  const resetModalForm = () => {
    setValidationError('')
    setEditingEntry(null)
    setForm({
      id: '',
      category_code: moduleCategories[0]?.code || '',
      weight_kg: '',
      quantity: '',
      unit: moduleCategories[0]?.unit || 'kg',
      unit_price: '',
      amount: '',
      notes: ''
    })
  }

  // Handle open modal for a specific day
  const handleOpenDayModal = (dateStr) => {
    setSelectedDate(dateStr)
    resetModalForm()
    
    // For single-entry modules (RDF, Dog Food), preload if it exists
    if (module === 'rdf' || module === 'dog_food') {
      const existing = rows.find(r => r.entry_date === dateStr)
      if (existing) {
        setForm({
          id: existing.id,
          category_code: existing.category_code || '',
          weight_kg: existing.weight_kg ?? '',
          quantity: existing.quantity ?? '',
          unit: existing.unit || 'kg',
          unit_price: existing.unit_price ?? '',
          amount: existing.amount ?? '',
          notes: existing.notes || ''
        })
        setEditingEntry(existing)
      }
    }
    setIsModalOpen(true)
  }

  const handleEditEntry = (entry) => {
    setSelectedDate(entry.entry_date)
    setValidationError('')
    setEditingEntry(entry)
    setForm({ id: entry.id, category_code: entry.category_code || '', weight_kg: entry.weight_kg ?? '', quantity: entry.quantity ?? '', unit: entry.unit || 'kg', unit_price: entry.unit_price ?? '', amount: entry.amount ?? '', notes: entry.notes || '' })
    setIsModalOpen(true)
  }

  // Handle open modal for monthly modules (Pig Feed, Black Bag, Tissue monthly)
  const handleOpenMonthlyModal = (categoryCode = '') => {
    setSelectedDate(`${month}-01`)
    resetModalForm()
    
    // Find existing entry
    const existing = module === 'pig_feed'
      ? rows.find(r => r.module === 'pig_feed')
      : rows.find(r => r.category_code === categoryCode && r.metadata?.entry_mode === 'monthly')
      
    if (existing) {
      setForm({
        id: existing.id,
        category_code: existing.category_code || '',
        weight_kg: existing.weight_kg ?? '',
        quantity: existing.quantity ?? '',
        unit: existing.unit || 'kg',
        unit_price: existing.unit_price ?? '',
        amount: existing.amount ?? '',
        notes: existing.notes || ''
      })
      setEditingEntry(existing)
    } else if (categoryCode) {
      const cat = categories.find(c => c.code === categoryCode)
      setForm(prev => ({
        ...prev,
        category_code: categoryCode,
        unit: cat ? cat.unit : 'kg'
      }))
    }
    setIsModalOpen(true)
  }

  // Submit Modal Form
  const handleFormSubmit = (e) => {
    e.preventDefault()
    if (!can(form.id ? 'entries.edit' : 'entries.create')) return
    if (!dateBelongsToMonth(selectedDate, month)) return setValidationError('วันที่บันทึกไม่ตรงกับเดือนที่เลือก')
    const numericRules = [
      ['weight_kg', 'น้ำหนัก', false], ['unit_price', 'ราคา/กก.', false],
      ['quantity', 'จำนวน', module === 'black_bag' || module === 'consumable'], ['amount', 'ยอดเงิน', false]
    ]
    const normalizedForm = { ...form }
    for (const [field, label, integer] of numericRules) {
      const result = validateNumericInput(form[field], { integer, label })
      if (result.error) return setValidationError(result.error)
      normalizedForm[field] = result.value
    }
    setValidationError('')

    const cat = categories.find(c => c.code === form.category_code)
    const categoryName = cat ? cat.name_th : moduleLabels[module] || module
    const finalUnit = cat ? cat.unit : form.unit

    const autoAmount = normalizedForm.weight_kg !== '' && normalizedForm.unit_price !== ''
      ? toNumber(normalizedForm.weight_kg) * toNumber(normalizedForm.unit_price)
      : normalizedForm.amount

    saveMutation.mutate({
      id: form.id,
      module,
      category_code: form.category_code || null,
      entry_date: selectedDate,
      period_month: `${month}-01`,
      material_name: categoryName,
      weight_kg: normalizedForm.weight_kg !== '' ? toNumber(normalizedForm.weight_kg) : null,
      quantity: normalizedForm.quantity !== '' ? toNumber(normalizedForm.quantity) : null,
      unit: finalUnit,
      unit_price: normalizedForm.unit_price !== '' ? toNumber(normalizedForm.unit_price) : null,
      amount: autoAmount !== '' ? toNumber(autoAmount) : null,
      notes: form.notes,
      metadata: module === 'pig_feed'
        ? { entry_mode: 'monthly', value_type: 'daily_average', days_in_month: totalDays }
        : ((module === 'tissue' || module === 'black_bag' || module === 'consumable') ? { entry_mode: entryMode } : { value_type: 'actual_daily' })
    })
  }

  // Delete transaction row
  const handleDeleteRow = (id) => {
    if (window.confirm('ยืนยันการลบรายการนี้หรือไม่?')) {
      deleteMutation.mutate(id)
    }
  }

  // Calendar structure calculations
  const calendarDays = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const firstDayIndex = new Date(y, m - 1, 1).getDay()
    const totalDays = new Date(y, m, 0).getDate()

    const days = []
    // Pad previous month days
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ day: null, dateStr: null })
    }
    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`
      // Filter rows based on category filter
      let dayEntries = rows.filter(r => r.entry_date === dateStr)
      if (module === 'tissue' || module === 'black_bag' || module === 'consumable') {
        dayEntries = dayEntries.filter(r => r.metadata?.entry_mode !== 'monthly')
      }
      if (selectedCategoryFilter !== 'all') {
        dayEntries = dayEntries.filter(r => r.category_code === selectedCategoryFilter)
      }
      
      days.push({
        day: d,
        dateStr,
        entries: dayEntries
      })
    }
    return days
  }, [month, rows, selectedCategoryFilter, module])

  // Summary indicators
  const totalWeight = useMemo(() => rows.reduce((s, r) => s + toNumber(r.weight_kg), 0), [rows])
  const totalAmount = useMemo(() => rows.reduce((s, r) => s + toNumber(r.amount), 0), [rows])

  // Wet Waste readonly calculation
  const wetWasteMetrics = useMemo(() => {
    const dogFoodSum = dogFoodRows.reduce((s, r) => s + toNumber(r.weight_kg), 0)
    const pigFeedDailyAverage = pigFeedRows.reduce((s, r) => s + toNumber(r.weight_kg), 0)
    const pigFeedSum = pigFeedDailyAverage * totalDays
    return {
      dogFood: dogFoodSum,
      pigFeed: pigFeedSum,
      pigFeedDailyAverage,
      total: dogFoodSum + pigFeedSum
    }
  }, [dogFoodRows, pigFeedRows])

  const exportRows = module === 'wet_waste' ? [...dogFoodRows, ...pigFeedRows] : rows
  const handleExportCsv = () => downloadCsv(exportEntriesCsv(exportRows, module, month), `${module.toUpperCase()}_${month}.csv`)
  const handleCsvFile = async event => {
    const file = event.target.files?.[0]; event.target.value=''; if(!file) return
    try {
      const parsed = parseEntriesCsv(await file.text(), module, month)
      const seen = new Set()
      for (const item of parsed) {
        const key = item.entry.id || `${item.entry.entry_date}|${item.entry.category_code || item.entry.material_name || ''}`
        if (seen.has(key)) item.errors.push('รายการซ้ำภายในไฟล์')
        seen.add(key)
        if (!item.entry.id && rows.some(row => row.entry_date === item.entry.entry_date && (row.category_code || row.material_name || '') === (item.entry.category_code || item.entry.material_name || ''))) item.errors.push('มีรายการนี้ในระบบแล้ว')
      }
      setCsvPreview(parsed)
    }
    catch(error){ window.alert(`อ่าน CSV ไม่สำเร็จ: ${error.message}`) }
  }
  const confirmCsvImport = () => {
    const invalid=csvPreview.filter(row=>row.errors.length); if(invalid.length) return
    const payloads = csvPreview.map(row=>row.entry)
    if (payloads.length === 0) {
      window.alert('ไม่มีข้อมูลในการนำเข้า')
      return
    }
    batchSaveMutation.mutate(payloads, { onSuccess:()=>setCsvPreview([]) })
  }

  return (
    <section className="page data-entry-page">
      <div className="page-header" style={{ marginBottom: '14px' }}>
        <div>
          <p className="eyebrow">Data Logs</p>
          <h2>บันทึกข้อมูลปริมาณขยะและทรัพยากร</h2>
          <p className="muted">รูปแบบฟอร์มจะปรับเปลี่ยนตามความเหมาะสมตามประเภทขยะจริง</p>
        </div>
      </div>

      {/* Filter Row containing Month Picker and Module Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', marginBottom: '18px', background: 'white', padding: '12px 16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
        <div className="field" style={{ marginBottom: 0, minWidth: '160px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '12px', display: 'block', marginBottom: '4px', color: '#64748b' }}>ประจำเดือน</span>
          <MonthPicker value={month} onChange={setMonth} />
        </div>
        <div style={{ borderLeft: '1px solid #e2e8f0', height: '36px', margin: '0 8px' }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 'bold', fontSize: '12px', display: 'block', marginBottom: '4px', color: '#64748b' }}>ประเภทขยะจริง</span>
          <div className="module-tabs" style={{ marginTop: 0, border: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {moduleOptions.map(item => {
              const Icon = item.icon
              const isActive = module === item.value
              return (
                <button 
                  key={item.value} 
                  type="button" 
                  className={isActive ? 'active' : ''} 
                  onClick={() => handleModuleChange(item.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    fontSize: '13px',
                    borderRadius: '10px',
                    border: isActive ? '1.5px solid #1d4ed8' : '1px solid #cbd5e1',
                    background: isActive ? '#eff6ff' : 'white',
                    color: isActive ? '#1d4ed8' : '#475569',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    transition: 'all 0.15s ease',
                    fontWeight: isActive ? 'bold' : 'normal',
                    cursor: 'pointer'
                  }}
                >
                  <Icon size={15} color={isActive ? '#1d4ed8' : '#64748b'} />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {error && <div className="alert error">โหลดข้อมูลไม่สำเร็จ: {error.message}</div>}
      {isLoading && <div className="alert">กำลังโหลดแบบฟอร์มบันทึกข้อมูล...</div>}

      <div className="card" style={{display:'flex',gap:'8px',justifyContent:'flex-end',flexWrap:'wrap'}}>
        <input ref={csvInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleCsvFile}/>
        {module !== 'wet_waste' && <button type="button" className="ghost" onClick={()=>csvInputRef.current?.click()} disabled={!can('entries.import')}>นำเข้า CSV</button>}
        <button type="button" className="ghost" onClick={handleExportCsv} disabled={!can('entries.export')}>ส่งออก CSV</button>
      </div>

      {csvPreview.length > 0 && <div className="card"><div className="section-title-row"><h3>ตรวจสอบก่อนนำเข้า CSV</h3><span className="muted">ถูกต้อง {csvPreview.filter(r=>!r.errors.length).length} · ผิด {csvPreview.filter(r=>r.errors.length).length}</span></div>
        <div className="table-wrap"><table><thead><tr><th>แถว</th><th>วันที่</th><th>รายการ</th><th>สถานะ</th></tr></thead><tbody>{csvPreview.map(row=><tr key={row.line}><td>{row.line}</td><td>{row.entry.entry_date}</td><td>{row.entry.material_name||row.entry.category_code||'-'}</td><td style={{color:row.errors.length?'#dc2626':'#15803d'}}>{row.errors.join(', ')||'พร้อมนำเข้า'}</td></tr>)}</tbody></table></div>
        <div className="form-actions bottom-actions"><button className="ghost" onClick={()=>setCsvPreview([])}>ยกเลิก</button><button className="primary" onClick={confirmCsvImport} disabled={csvPreview.some(r=>r.errors.length)||batchSaveMutation.isPending}>ยืนยันนำเข้า</button></div>
      </div>}

      {!isLoading && !error && (
        <div style={{ display: 'grid', gap: '18px' }}>
          
          {/* 1. DAILY CALENDAR FLOW (RDF, Dog Food) */}
          {(module === 'rdf' || module === 'dog_food') && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3>ปฏิทินบันทึกรายวันของ {thaiMonthLabel(month)}</h3>
                <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: 'bold' }}>น้ำหนักสะสม: {formatNumber(totalWeight)} kg</span>
              </div>
              <div className="alert module-help" style={{ marginBottom: '14px' }}>
                <Info size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                ยอดจริงรายวัน: กรอกน้ำหนักที่เกิดขึ้นจริงของแต่ละวัน ช่องว่างจะไม่ถูกสร้างเป็นข้อมูล 0
              </div>

              {/* Calendar Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>
                <div>อา.</div><div>จ.</div><div>อ.</div><div>พ.</div><div>พฤ.</div><div>ศ.</div><div>ส.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
                {calendarDays.map((cell, idx) => {
                  if (!cell.day) return <div key={`empty-${idx}`} style={{ minHeight: '90px', background: '#f8fafc', borderRadius: '12px', opacity: 0.4 }} />
                  
                  return (
                    <div
                      key={cell.dateStr}
                      style={{
                        minHeight: '90px',
                        background: 'white',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '800', fontSize: '12px', color: '#64748b' }}>{cell.day}</span>
                        <button 
                          type="button" 
                          className="ghost" 
                          onClick={() => handleOpenDayModal(cell.dateStr)}
                          style={{ minHeight: 'auto', padding: '2px 4px', fontSize: '10px', color: '#3b82f6', background: 'transparent', border: 0, cursor: 'pointer' }}
                        >
                          ขยาย
                        </button>
                      </div>

                      <div style={{ marginTop: '4px' }}>
                        <input 
                          type="text"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={dayValues[cell.day]?.value ?? ''}
                          onChange={e => handleSingleDayValueChange(cell.day, e.target.value)}
                          placeholder="0"
                          style={{
                            width: '100%',
                            padding: '4px 6px',
                            fontSize: '13px',
                            fontWeight: 'bold',
                            textAlign: 'right',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            background: '#f8fafc'
                          }}
                        />
                        <span style={{ display: 'block', fontSize: '10px', color: '#94a3b8', textAlign: 'right', marginTop: '2px' }}>
                          kg
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                <button 
                  type="button" 
                  className="primary" 
                  onClick={handleSaveCalendar} 
                  disabled={isSavingBatch}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '42px', borderRadius: '12px', padding: '0 24px', fontSize: '14.5px', fontWeight: 'bold' }}
                >
                  {isSavingBatch ? 'กำลังบันทึก...' : 'บันทึกยอดจริงรายวัน'}
                </button>
              </div>
            </div>
          )}

          {/* 2. PIG FEED MONTHLY FLOW */}
          {module === 'pig_feed' && (
            <div className="card" style={{ maxWidth: '600px' }}>
              <h3>ค่าเฉลี่ยอาหารหมูรายวันประจำเดือน</h3>
              <div className="alert module-help" style={{ margin: '12px 0' }}>
                <Info size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                กรอกค่าเฉลี่ยต่อวันของเดือนเพียงครั้งเดียว ระบบจะคำนวณยอดประมาณการทั้งเดือนเพื่อรวมในขยะเปียก
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>ค่าเฉลี่ยต่อวัน · {thaiMonthLabel(month)}</span>
                  <strong style={{ fontSize: '24px', color: '#1e293b' }}>
                    {rows.length > 0 ? `${formatNumber(rows[0].weight_kg)} kg/วัน` : 'ยังไม่มีข้อมูล'}
                  </strong>
                  {rows.length > 0 && <span className="muted" style={{display:'block'}}>ประมาณการทั้งเดือน {formatNumber(toNumber(rows[0].weight_kg) * totalDays)} kg</span>}
                </div>
                <button type="button" className="primary" onClick={() => handleOpenMonthlyModal()} style={{ borderRadius: '10px', minHeight: '38px' }}>
                  {rows.length > 0 ? 'แก้ไขค่าเฉลี่ย' : 'กรอกค่าเฉลี่ยรายวัน'}
                </button>
              </div>
            </div>
          )}

          {/* 3. WET WASTE READ-ONLY FLOW */}
          {module === 'wet_waste' && (
            <div className="card" style={{ maxWidth: '700px' }}>
              <h3>สรุปปริมาณขยะเปียกรวมรายเดือน ({thaiMonthLabel(month)})</h3>
              <div className="alert module-help" style={{ margin: '12px 0', borderColor: '#fed7aa', background: '#fffaf0', color: '#c2410c' }}>
                <Info size={16} stroke="#c2410c" style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                <strong>คำอธิบายสูตรคำนวณ</strong>: ขยะเปียกเป็นหน้ารวมประมวลผลเท่านั้น (ขยะเปียก = อาหารหมา + อาหารหมู) ห้ามแก้ไขข้อมูลเองโดยตรง
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginTop: '14px' }}>
                <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '800' }}>อาหารหมารวม (รายวันสะสม)</span>
                  <strong style={{ display: 'block', fontSize: '18px', marginTop: '4px', color: '#16a34a' }}>
                    {formatNumber(wetWasteMetrics.dogFood)} kg
                  </strong>
                </div>
                <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '800' }}>อาหารหมูประมาณการทั้งเดือน</span>
                  <strong style={{ display: 'block', fontSize: '18px', marginTop: '4px', color: '#2563eb' }}>
                    {formatNumber(wetWasteMetrics.pigFeed)} kg
                  </strong>
                </div>
                <div style={{ padding: '14px', background: '#eff6ff', borderRadius: '12px', border: '1.5px solid #bfdbfe' }}>
                  <span style={{ fontSize: '12px', color: '#1d4ed8', fontWeight: '900' }}>ขยะเปียกรวมทั้งสิ้น</span>
                  <strong style={{ display: 'block', fontSize: '20px', marginTop: '4px', color: '#1d4ed8' }}>
                    {formatNumber(wetWasteMetrics.total)} kg
                  </strong>
                </div>
              </div>
              <p className="muted" style={{marginTop:'10px'}}>ค่าเฉลี่ยอาหารหมู: {formatNumber(wetWasteMetrics.pigFeedDailyAverage)} kg/วัน × {totalDays} วัน</p>

              <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end' }}>
                <span className="muted" style={{ fontSize: '12px' }}>
                  *หากต้องการแก้ไขข้อมูล กรุณาคลิกเลือกแท็บ "อาหารหมา" หรือ "อาหารหมู" ด้านบน
                </span>
              </div>
            </div>
          )}

          {module === 'recycle' && (
            <div className="card">
              <div className="section-title-row"><div><h3>รายการขายรีไซเคิล ({thaiMonthLabel(month)})</h3><p className="muted">บันทึกตามรายการขายจริง พร้อมน้ำหนัก ราคา/กก. และยอดเงิน</p></div>
                <button type="button" className="primary" onClick={()=>handleOpenDayModal(`${month}-01`)}><Plus size={16}/> เพิ่มรายการขาย</button></div>
              <div className="table-wrap"><table><thead><tr><th>วันที่</th><th>วัสดุ</th><th>น้ำหนัก</th><th>ราคา/กก.</th><th>ยอดเงิน</th><th>จัดการ</th></tr></thead><tbody>
                {rows.map(item=><tr key={item.id}><td>{item.entry_date}</td><td>{item.material_name || item.category_code}</td><td>{formatNumber(item.weight_kg)} kg</td><td>{formatNumber(item.unit_price)} บาท</td><td>{formatNumber(item.amount)} บาท</td><td><button className="tiny" onClick={()=>handleEditEntry(item)}>แก้ไข</button></td></tr>)}
                {!rows.length && <tr><td colSpan="6" className="muted">ยังไม่มีรายการขายในเดือนนี้</td></tr>}
              </tbody></table></div>
            </div>
          )}

          {/* 4. DAILY/MONTHLY USAGE FLOW */}
          {(module === 'tissue' || module === 'black_bag' || module === 'consumable') && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3>{getHybridTitle()} ({thaiMonthLabel(month)})</h3>
                  <span className="muted" style={{ fontSize: '12px' }}>
                    ยอดรวมสะสม: {formatNumber(rows.reduce((s, r) => s + toNumber(r.quantity || r.weight_kg), 0), 2)} {(module === 'tissue' || module === 'black_bag' || module === 'consumable') ? getHybridUnitLabel() : 'kg'} 
                  </span>
                </div>
                
                {/* Options toggle: Daily/Monthly */}
                {module === 'tissue' && <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div className="inline-toggle" style={{ marginBottom: 0 }}>
                    <button type="button" className={entryMode === 'daily' ? 'active' : ''} onClick={() => setEntryMode('daily')} style={{ padding: '6px 12px', fontSize: '12px' }}>รายวัน (Grid)</button>
                    <button type="button" className={entryMode === 'monthly' ? 'active' : ''} onClick={() => setEntryMode('monthly')} style={{ padding: '6px 12px', fontSize: '12px' }}>รายเดือน (ตารางรวม)</button>
                  </div>
                </div>}
              </div>

              {entryMode === 'daily' ? (
                <div>
                  <div className="alert module-help" style={{ marginBottom: '14px' }}>
                    <Info size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                    <strong>ระบบรายวันสเปรดชีต (Spreadsheet Grid)</strong>: ป้อนจำนวนหรือน้ำหนักของทุกประเภทขยะลงในแต่ละวันได้โดยตรง กดปุ่ม <strong>Tab</strong> เพื่อย้ายช่องกรอกได้อย่างรวดเร็ว เมื่อกรอกเสร็จแล้วกดปุ่ม "บันทึกข้อมูลรายวันทั้งหมด"
                  </div>

                  {/* Daily Batch Spreadsheet Grid */}
                  <div style={{ overflowX: 'auto', marginTop: '10px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', minWidth: '600px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ padding: '12px', textAlign: 'center', width: '80px', fontWeight: 'bold', fontSize: '13px', color: '#475569' }}>วันที่</th>
                          {moduleCategories.map(cat => (
                            <th key={cat.code} style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: '#475569' }}>
                              {cat.name_th} ({cat.unit})
                            </th>
                          ))}
                          <th style={{ padding: '12px', textAlign: 'center', width: '120px', fontWeight: 'bold', fontSize: '13px', color: '#475569' }}>การจัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: totalDays }).map((_, dIdx) => {
                          const day = dIdx + 1
                          const dateStr = `${month}-${String(day).padStart(2, '0')}`
                          return (
                            <tr key={dateStr} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#64748b', fontSize: '13px' }}>
                                {day}
                              </td>
                              {moduleCategories.map(cat => (
                                <td key={cat.code} style={{ padding: '4px 6px' }}>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    step="0.01"
                                    min="0"
                                    value={dayValues[day]?.[cat.code] ?? ''}
                                    onChange={e => handleDayValueChange(day, cat.code, e.target.value)}
                                    placeholder="0"
                                    style={{
                                      width: '100%',
                                      padding: '6px 10px',
                                      fontSize: '13px',
                                      fontWeight: 'bold',
                                      textAlign: 'right',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: '8px',
                                      background: '#f8fafc',
                                      outline: 'none'
                                    }}
                                  />
                                </td>
                              ))}
                              <td style={{ padding: '4px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() => handleOpenDayModal(dateStr)}
                                  style={{ minHeight: '28px', padding: '4px 8px', fontSize: '11px', color: '#3b82f6', background: 'transparent', border: 0, cursor: 'pointer' }}
                                >
                                  รายละเอียด
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                    <button 
                      type="button" 
                      className="primary" 
                      onClick={handleSaveCalendar} 
                      disabled={isSavingBatch}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '42px', borderRadius: '12px', padding: '0 24px', fontSize: '14.5px', fontWeight: 'bold' }}
                    >
                      {isSavingBatch ? 'กำลังบันทึก...' : 'บันทึกยอดใช้จริงรายวัน'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Monthly Batch Form */
                <div style={{ overflowX: 'auto', marginTop: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', fontSize: '13px', color: '#475569' }}>ชนิดย่อยขยะ/ทรัพยากร</th>
                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: '#475569', width: '220px' }}>จำนวน/น้ำหนัก</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moduleCategories.map(cat => (
                        <tr key={cat.code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px', fontSize: '13.5px', fontWeight: 'bold', color: '#1e293b' }}>
                            {cat.name_th}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                value={monthlyValues[cat.code]?.quantity ?? ''}
                                onChange={e => handleMonthlyValueChange(cat.code, 'quantity', e.target.value)}
                                placeholder="0"
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  fontSize: '13.5px',
                                  fontWeight: 'bold',
                                  textAlign: 'right',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '8px',
                                  background: '#f8fafc'
                                }}
                              />
                              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 'bold', width: '40px' }}>{cat.unit}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <button
                      type="button"
                      className="primary"
                      onClick={handleSaveMonthlyAll}
                      disabled={isSavingBatch}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '42px', borderRadius: '12px', padding: '0 24px', fontSize: '14.5px', fontWeight: 'bold' }}
                    >
                      {isSavingBatch ? 'กำลังบันทึก...' : 'บันทึกยอดรายเดือนทั้งหมด'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}



        </div>
      )}

      {/* Edit/Add Daily/Monthly Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'grid',
          placeItems: 'center',
          zIndex: 99999
        }}>
          <div className="card" style={{ width: 'min(500px, 92%)', border: '1px solid #e2e8f0', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', padding: '24px', position: 'relative' }}>
            <button 
              type="button" 
              onClick={() => setIsModalOpen(false)}
              style={{ position: 'absolute', right: '18px', top: '18px', border: 0, background: 'transparent', cursor: 'pointer', padding: '6px', color: '#64748b' }}
            >
              <X size={18} />
            </button>

            <h3 style={{ marginBottom: '18px' }}>
              {!editingEntry ? 'บันทึกข้อมูลใหม่' : 'แก้ไขรายการข้อมูล'} ({selectedDate})
            </h3>

            {/* If recyclable, tissue, or black bag, show a table of records for that day first! */}
            {(module === 'recycle' || ((module === 'tissue' || module === 'black_bag') && entryMode === 'daily')) && (
              <div style={{ marginBottom: '18px', maxHeight: '150px', overflowY: 'auto', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                <strong style={{ fontSize: '12.5px', color: '#475569' }}>รายการที่บันทึกแล้วของวันนี้:</strong>
                <div style={{ display: 'grid', gap: '6px', marginTop: '6px' }}>
                  {rows.filter(r => r.entry_date === selectedDate).map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                      <span><strong>{item.material_name || item.category_code}</strong>: {item.weight_kg ? `${item.weight_kg}kg` : `${item.quantity}${item.unit}`} ({item.amount || 0} บ.)</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button type="button" className="tiny" onClick={() => {
                          setEditingEntry(item)
                          setForm({
                            id: item.id,
                            category_code: item.category_code || '',
                            weight_kg: item.weight_kg ?? '',
                            quantity: item.quantity ?? '',
                            unit: item.unit || 'kg',
                            unit_price: item.unit_price ?? '',
                            amount: item.amount ?? '',
                            notes: item.notes || ''
                          })
                        }} style={{ padding: '3px 6px', minHeight: 'auto' }}>แก้ไข</button>
                        <button type="button" className="tiny danger" onClick={() => handleDeleteRow(item.id)} style={{ padding: '3px 6px', minHeight: 'auto' }}>ลบ</button>
                      </div>
                    </div>
                  ))}
                  {rows.filter(r => r.entry_date === selectedDate).length === 0 && (
                    <span className="muted" style={{ fontSize: '12px' }}>ยังไม่มีรายการบันทึกของวันนี้</span>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleFormSubmit} style={{ display: 'grid', gap: '14px' }}>
              
              {/* Category selector for modules with Master Data */}
              {moduleCategories.length > 0 && (
                <div className="field">
                  <span>ชนิดย่อยขยะ/ทรัพยากร (Master Data)</span>
                  <select 
                    value={form.category_code} 
                    onChange={e => {
                      const selectedCat = categories.find(c => c.code === e.target.value)
                      setForm({ ...form, category_code: e.target.value, unit: selectedCat ? selectedCat.unit : 'kg' })
                    }}
                    required
                  >
                    <option value="" disabled>--- กรุณาเลือก ---</option>
                    {moduleCategories.map(cat => (
                      <option key={cat.code} value={cat.code}>{cat.name_th}</option>
                    ))}
                  </select>
                </div>
              )}

              {validationError && <div className="alert error" role="alert">{validationError}</div>}

              {/* RDF, Dog Food, Pig Feed (Single entry input) */}
              {(module === 'rdf' || module === 'dog_food' || module === 'pig_feed' || module === 'recycle') && (
                <div className="field">
                  <span>น้ำหนัก (kg)</span>
                  <input 
                    type="text"
                    inputMode="decimal"
                    step="0.01" 
                    min="0" 
                    value={form.weight_kg} 
                    onChange={e => { const r = validateNumericInput(e.target.value, { label: 'น้ำหนัก' }); setValidationError(r.error); setForm({ ...form, weight_kg: r.value }) }}
                    required={module !== 'recycle'}
                  />
                </div>
              )}

              {/* Recycle specific price/kg */}
              {module === 'recycle' && (
                <div className="field">
                  <span>ราคา/กก. (บาท)</span>
                  <input 
                    type="text"
                    inputMode="decimal"
                    step="0.01" 
                    min="0" 
                    value={form.unit_price} 
                    onChange={e => { const r = validateNumericInput(e.target.value, { label: 'ราคา/กก.' }); setValidationError(r.error); setForm({ ...form, unit_price: r.value }) }}
                  />
                </div>
              )}

              {/* Quantity input for tissue and black bags */}
              {(module === 'tissue' || module === 'black_bag' || module === 'recycle' || module === 'consumable') && (
                <div className="field">
                  <span>จำนวน</span>
                  <input 
                    type="text"
                    inputMode="numeric"
                    step={module === 'black_bag' || module === 'consumable' ? '1' : '0.01'} 
                    min="0" 
                    value={form.quantity} 
                    onChange={e => { const r = validateNumericInput(e.target.value, { integer: module === 'black_bag' || module === 'consumable', label: 'จำนวน' }); setValidationError(r.error); setForm({ ...form, quantity: r.value }) }}
                  />
                </div>
              )}

              {/* Amount values for commercial categories */}
              {module === 'recycle' && (
                <div className="field">
                  <span>ยอดเงินสะสม (บาท)</span>
                  <input 
                    type="text"
                    inputMode="decimal"
                    step="0.01" 
                    min="0" 
                    value={form.amount} 
                    onChange={e => { const r = validateNumericInput(e.target.value, { label: 'ยอดเงิน' }); setValidationError(r.error); setForm({ ...form, amount: r.value }) }}
                    placeholder={form.weight_kg && form.unit_price ? String(toNumber(form.weight_kg) * toNumber(form.unit_price)) : ''}
                  />
                </div>
              )}

              <div className="field">
                <span>หมายเหตุ</span>
                <textarea 
                  rows="2" 
                  value={form.notes} 
                  onChange={e => setForm({ ...form, notes: e.target.value })} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="ghost" onClick={() => setIsModalOpen(false)} style={{ minHeight: '38px', borderRadius: '10px' }}>
                  ยกเลิก
                </button>
                <button type="submit" className="primary" disabled={saveMutation.isPending || Boolean(validationError)} style={{ minHeight: '38px', borderRadius: '10px' }}>
                  {saveMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
