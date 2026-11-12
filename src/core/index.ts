export * from './types';
export * from './settings';
export * from './parse';
export * from './calc';
export * from './format';

import { parseRows } from './parse';
import { aggregateDays, buildEmployees, filePeriod, identityWarnings } from './calc';
import { IMPORT_RULES } from './settings';
import type { ImportResult, ImportRules } from './types';

/** Строки Excel → сотрудники + факты дней + отчёт о проблемах. */
export function importRows(rows: unknown[][], rules: ImportRules = IMPORT_RULES): ImportResult {
  const parsed = parseRows(rows);
  const { days, duplicatesRemoved } = aggregateDays(parsed.events, rules);
  return {
    warnings: identityWarnings(parsed.events),
    employees: buildEmployees(parsed.events),
    days,
    issues: parsed.issues,
    totalRows: parsed.totalRows,
    duplicatesRemoved,
    period: filePeriod(parsed.events),
  };
}
