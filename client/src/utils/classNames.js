const CLASS_LABEL_REPLACEMENTS = [
  [/\bJunior\s+KG\b|\bJr\.?\s*KG\b/gi, 'Montessori - II'],
  [/\bSenior\s+KG\b|\bSr\.?\s*KG\b/gi, 'Montessori - III'],
  [/\bNursery\b/gi, 'Montessori - I'],
];

export function displayClassName(value = '') {
  return CLASS_LABEL_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    String(value ?? '')
  );
}

export function formatClass(klass, includeYear = true) {
  if (!klass) return 'N/A';
  const label = displayClassName(`${klass.name || ''} ${klass.section || ''}`.trim());
  return includeYear && klass.academicYear ? `${label} (${klass.academicYear})` : label;
}

export function isPrePrimaryClassName(value = '') {
  const name = String(value ?? '').toLowerCase();
  return name.includes('montessori')
    || name.includes('nursery')
    || name.includes('kg')
    || name.includes('pre-primary')
    || name.includes('pre primary');
}
