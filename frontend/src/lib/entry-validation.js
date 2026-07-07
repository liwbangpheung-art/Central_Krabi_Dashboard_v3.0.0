export const numericPolicies = Object.freeze({
  count: Object.freeze({
    type: "count",
    label: "จำนวนเต็ม",
    step: "1",
    inputMode: "numeric",
    maximumFractionDigits: 0,
    placeholder: "0",
    decimalPlaces: 0
  }),
  weight: Object.freeze({
    type: "weight",
    label: "น้ำหนัก/ปริมาณ",
    step: "0.01",
    inputMode: "decimal",
    maximumFractionDigits: 2,
    placeholder: "0.00",
    decimalPlaces: 2
  }),
  money: Object.freeze({
    type: "money",
    label: "จำนวนเงิน/ราคา",
    step: "0.01",
    inputMode: "decimal",
    maximumFractionDigits: 2,
    placeholder: "0.00",
    decimalPlaces: 2
  })
});

export const dataEntryFieldPolicies = Object.freeze({
  tissue_roll: numericPolicies.count,
  tissue_hand: numericPolicies.count,
  tissue_popup: numericPolicies.count,
  garbage_bag_30x40: numericPolicies.count,
  garbage_bag_28x36: numericPolicies.count,
  garbage_bag_18x20: numericPolicies.count,
  waste_rdf: numericPolicies.weight,
  animal_feed_dog: numericPolicies.weight,
  animal_feed_pig: numericPolicies.weight,
  wet_waste: numericPolicies.weight,
  scrap_weight: numericPolicies.weight,
  scrap_price: numericPolicies.money,
  scrap_amount: numericPolicies.money
});

export const integerDailyModules = Object.freeze(["tissue", "garbage_bag", "consumable"]);

export function policyForDailyModule(module) {
  return integerDailyModules.includes(module) ? numericPolicies.count : numericPolicies.weight;
}

export function normalizeNumberText(value) {
  return String(value ?? "").replace(/,/gu, "").trim();
}

export function decimalLength(value) {
  const normalized = normalizeNumberText(value);
  const decimal = normalized.split(".")[1];
  return decimal ? decimal.length : 0;
}

export function isBlankValue(value) {
  return value === "" || value === null || value === undefined;
}

export function validateNumberValue(value, policy, {
  label = "จำนวน",
  required = false,
  allowZero = true,
  positive = false
} = {}) {
  if (isBlankValue(value)) return required ? `${label}จำเป็นต้องกรอก` : null;

  const normalized = normalizeNumberText(value);
  const number = Number(normalized);
  if (!Number.isFinite(number)) return `${label}ต้องเป็นตัวเลข`;
  if (number < 0) return `${label}ห้ามติดลบ`;
  if (!allowZero && number === 0) return `${label}ต้องมากกว่า 0`;
  if (positive && number <= 0) return `${label}ต้องมากกว่า 0`;

  if (policy?.type === "count" && !Number.isInteger(number)) {
    return `${label}ต้องเป็นจำนวนเต็มเท่านั้น`;
  }

  if (Number.isFinite(Number(policy?.decimalPlaces)) && decimalLength(normalized) > Number(policy.decimalPlaces)) {
    return `${label}มีทศนิยมได้ไม่เกิน ${policy.decimalPlaces} ตำแหน่ง`;
  }

  return null;
}

export function parseNumberValue(value, fallback = 0) {
  if (isBlankValue(value)) return fallback;
  const number = Number(normalizeNumberText(value));
  return Number.isFinite(number) ? number : fallback;
}

export function integerInputProps() {
  return {
    min: "0",
    step: numericPolicies.count.step,
    inputMode: numericPolicies.count.inputMode,
    placeholder: numericPolicies.count.placeholder
  };
}

export function decimalInputProps(policy = numericPolicies.weight) {
  return {
    min: "0",
    step: policy.step,
    inputMode: policy.inputMode,
    placeholder: policy.placeholder
  };
}

export function unsavedChangesMessage() {
  return "คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่? ข้อมูลที่กรอกไว้จะไม่ถูกบันทึก";
}
