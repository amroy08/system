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

// Sorts classes in natural numeric order:
// Grade 1 A → Grade 2 A → ... → Grade 9 B → Grade 10 A → Grade 10 B → Montessori I → II → III
export function sortClasses(classes = []) {
  return [...classes].sort((a, b) => {
    const nameA = String(a.name || '').toLowerCase();
    const nameB = String(b.name || '').toLowerCase();
    // Pre-primary / Montessori / Nursery go to the end
    const isPPA = isPrePrimaryClassName(nameA);
    const isPPB = isPrePrimaryClassName(nameB);
    if (isPPA && !isPPB) return 1;
    if (!isPPA && isPPB) return -1;
    // Both pre-primary → sort by name then section
    if (isPPA && isPPB) {
      const cmp = nameA.localeCompare(nameB);
      if (cmp !== 0) return cmp;
      return String(a.section || '').localeCompare(String(b.section || ''));
    }
    // Extract numeric grade number from name
    const numA = parseInt((a.name || '').match(/\d+/)?.[0], 10);
    const numB = parseInt((b.name || '').match(/\d+/)?.[0], 10);
    const hasNumA = !isNaN(numA);
    const hasNumB = !isNaN(numB);
    if (hasNumA && hasNumB && numA !== numB) return numA - numB;
    if (hasNumA && !hasNumB) return -1;
    if (!hasNumA && hasNumB) return 1;
    // Same grade number → sort by section (A, B, C...)
    return String(a.section || '').localeCompare(String(b.section || ''));
  });
}
