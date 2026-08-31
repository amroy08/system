import { isPrePrimaryClassName } from './classNames.js';

export const ADMISSION_CATEGORY = Object.freeze({
  NEW: 'NEW_ADMISSION',
  EXISTING: 'EXISTING',
});

export function normalizeAdmissionCategory(value, medicalNotes = '') {
  if (value === ADMISSION_CATEGORY.NEW) return ADMISSION_CATEGORY.NEW;
  if (value === ADMISSION_CATEGORY.EXISTING || value === 'EXISTING_STUDENT') return ADMISSION_CATEGORY.EXISTING;
  if (String(medicalNotes).includes('Category: NEW_ADMISSION')) return ADMISSION_CATEGORY.NEW;
  if (String(medicalNotes).includes('Category: EXISTING')) return ADMISSION_CATEGORY.EXISTING;
  return ADMISSION_CATEGORY.EXISTING;
}

export function getFeeWing(className = '') {
  const name = String(className).toLowerCase();
  if (name.includes('old') || name.includes('alumni') || name.includes('passed-out')) return 'FORMER';
  if (isPrePrimaryClassName(name)) return 'PRE_PRIMARY';
  const grade = Number(name.match(/\d+/)?.[0]);
  if (grade >= 1 && grade <= 4) return 'PRIMARY';
  return 'SECONDARY';
}

export function getAnnualFeeBreakdown(className, category = ADMISSION_CATEGORY.EXISTING) {
  const wing = getFeeWing(className);
  const grade = Number(String(className).match(/\d+/)?.[0]);
  const hasAdmissionFee = category === ADMISSION_CATEGORY.NEW || grade === 1;
  if (wing === 'FORMER') return [];

  if (wing === 'PRE_PRIMARY') {
    return [
      { name: 'Admission Fee', frequency: 'one-time', rate: 2000, amount: 2000 },
      { name: 'Monthly Fee', frequency: 'monthly', rate: 1500, amount: 18000 },
      { name: 'Term Fee', frequency: 'annual', rate: 3000, amount: 3000 },
      { name: 'MS Fee', frequency: 'annual', rate: 2000, amount: 2000 },
      { name: 'School Kit', frequency: 'annual', rate: 4500, amount: 4500 },
    ];
  }

  if (wing === 'PRIMARY') {
    return [
      ...(hasAdmissionFee ? [{ name: 'Admission Fee', frequency: 'one-time', rate: 2000, amount: 2000 }] : []),
      { name: 'Monthly Fee', frequency: 'monthly', rate: 1500, amount: 18000 },
      { name: 'Term Fee', frequency: 'bi-annual', rate: 1500, amount: 3000 },
      { name: 'MS Fee', frequency: 'annual', rate: 2500, amount: 2500 },
    ];
  }

  return [
    ...(hasAdmissionFee ? [{ name: 'Admission Fee', frequency: 'one-time', rate: 2200, amount: 2200 }] : []),
    { name: 'Monthly Fee', frequency: 'monthly', rate: 1800, amount: 21600 },
    { name: 'Term Fee', frequency: 'bi-annual', rate: 1800, amount: 3600 },
    { name: 'MS Fee', frequency: 'annual', rate: 3600, amount: 3600 },
  ];
}

export function calculateAnnualFee(className, category) {
  return getAnnualFeeBreakdown(className, category).reduce((sum, item) => sum + item.amount, 0);
}

export const FEE_APPLIES_TO = Object.freeze({
  ALL: 'ALL',
  NEW: ADMISSION_CATEGORY.NEW,
  EXISTING: ADMISSION_CATEGORY.EXISTING,
});

export const FEE_FREQUENCY_MULTIPLIER = Object.freeze({
  monthly: 12,
  quarterly: 4,
  'bi-annual': 2,
  annual: 1,
  'one-time': 1,
});

export function annualizeFee(amount, frequency) {
  return Number(amount || 0) * (FEE_FREQUENCY_MULTIPLIER[frequency] || 1);
}

function legacyAppliesTo(structure) {
  return structure.appliesTo || (structure.category === 'one-time' ? FEE_APPLIES_TO.NEW : FEE_APPLIES_TO.ALL);
}

export function resolveFeeAssignment(structures, klass, admissionCategory = ADMISSION_CATEGORY.EXISTING) {
  if (!klass) return { annualFee: 0, components: [] };
  const normalizedCategory = normalizeAdmissionCategory(admissionCategory);
  const components = (structures || [])
    .filter((structure) => {
      if (structure.status !== 'active') return false;
      if (!(structure.classIds || []).includes(klass._id)) return false;
      if (structure.academicYear && structure.academicYear !== klass.academicYear) return false;
      const appliesTo = legacyAppliesTo(structure);
      return appliesTo === FEE_APPLIES_TO.ALL || appliesTo === normalizedCategory;
    })
    .map((structure) => ({
      structureId: structure._id,
      name: structure.name,
      category: structure.category,
      frequency: structure.frequency,
      rate: Number(structure.amount || 0),
      amount: annualizeFee(structure.amount, structure.frequency),
    }));

  return {
    annualFee: components.reduce((sum, component) => sum + component.amount, 0),
    components,
    academicYear: klass.academicYear,
    classId: klass._id,
    admissionCategory: normalizedCategory,
  };
}

export const OFFICIAL_FEE_RATES = Object.freeze([
  { _id: 'pre-primary', name: 'Pre-primary', category: 'all students', frequency: 'annual', amount: 29500, status: 'active' },
  { _id: 'primary-new', name: 'Primary', category: 'Grade 1 or new admission', frequency: 'annual', amount: 25500, status: 'active' },
  { _id: 'primary-existing', name: 'Primary', category: 'Grades 2–4 existing', frequency: 'annual', amount: 23500, status: 'active' },
  { _id: 'secondary-new', name: 'Secondary', category: 'Grade 5 new admission', frequency: 'annual', amount: 31000, status: 'active' },
  { _id: 'secondary-existing', name: 'Secondary', category: 'Grades 6–10 existing', frequency: 'annual', amount: 28800, status: 'active' },
]);
