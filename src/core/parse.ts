import type { AccessEvent, ParseIssue, ParseResult } from './types';

/** Заголовки выгрузки FaceID. Ищем по названию, а не по позиции колонки. */
export const COLUMNS = {
  time: 'Время',
  id: 'Ид. польз.',
  name: 'Имя',
  department: 'Раздел',
  device: 'Имя устройства посещения',
} as const;

export class FileFormatError extends Error {}

const normalizeHeader = (h: unknown): string =>
  String(h ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const clean = (v: unknown): string =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const pad = (n: number): string => String(n).padStart(2, '0');

interface DateTimeParts {
  date: string;
  second: number;
}

/** Excel serial (дни с 1899-12-30) → дата/время. Целая часть — дата, дробная — время. */
function fromExcelSerial(serial: number): DateTimeParts | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const totalSeconds = Math.round(serial * 86400);
  const days = Math.floor(totalSeconds / 86400);
  const second = totalSeconds - days * 86400;
  const d = new Date(Date.UTC(1899, 11, 30) + days * 86400000);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    second,
  };
}

function isValidDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Разбирает значение ячейки «Время».
 * Поддерживает: строку "YYYY-MM-DD HH:MM[:SS]", "DD.MM.YYYY HH:MM[:SS]",
 * объект Date (библиотеки Excel отдают его как UTC-"настенное" время), Excel serial.
 * Никогда не использует локальный часовой пояс браузера.
 */
export function parseDateTime(value: unknown): DateTimeParts | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      date: `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`,
      second: value.getUTCHours() * 3600 + value.getUTCMinutes() * 60 + value.getUTCSeconds(),
    };
  }
  if (typeof value === 'number') return fromExcelSerial(value);

  const s = clean(value);
  if (!s) return null;

  let y: number, mo: number, d: number;
  let rest: string;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](.+)$/.exec(s);
  if (m) {
    [y, mo, d, rest] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4]];
  } else {
    m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})[ T](.+)$/.exec(s);
    if (!m) {
      // Число, сохранённое как текст
      if (/^\d+(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));
      return null;
    }
    [d, mo, y, rest] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4]];
  }
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(rest.trim());
  if (!t) return null;
  const hh = Number(t[1]);
  const mm = Number(t[2]);
  const ss = t[3] ? Number(t[3]) : 0;
  if (hh > 23 || mm > 59 || ss > 59 || !isValidDate(y, mo, d)) return null;
  return { date: `${y}-${pad(mo)}-${pad(d)}`, second: hh * 3600 + mm * 60 + ss };
}

/**
 * Превращает строки листа (первая строка — заголовки) в события.
 * rows[i] — массив значений ячеек. Строки с ошибками не роняют разбор, а попадают в issues.
 */
export function parseRows(rows: unknown[][]): ParseResult {
  if (rows.length === 0) throw new FileFormatError('Файл пустой.');

  const header = rows[0].map(normalizeHeader);
  const index = {} as Record<keyof typeof COLUMNS, number>;
  const missing: string[] = [];
  for (const [key, title] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
    const i = header.indexOf(normalizeHeader(title));
    if (i === -1) missing.push(`«${title}»`);
    index[key] = i;
  }
  if (missing.length > 0) {
    throw new FileFormatError(
      `Это не выгрузка FaceID: не найдены колонки ${missing.join(', ')}. ` +
        'Проверьте, что загружаете файл из системы контроля доступа без изменений.',
    );
  }

  const events: AccessEvent[] = [];
  const issues: ParseIssue[] = [];
  let totalRows = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const excelRow = r + 1;
    if (row.every((c) => clean(c) === '')) continue; // пустая строка
    totalRows++;

    const employeeId = clean(row[index.id]);
    if (!employeeId) {
      issues.push({ row: excelRow, message: 'Нет ID сотрудника — строка пропущена.' });
      continue;
    }
    const dt = parseDateTime(row[index.time]);
    if (!dt) {
      issues.push({
        row: excelRow,
        message: `Не удалось распознать время «${clean(row[index.time])}» — строка пропущена.`,
      });
      continue;
    }
    events.push({
      employeeId,
      name: clean(row[index.name]) || `ID ${employeeId}`,
      department: clean(row[index.department]),
      device: clean(row[index.device]),
      date: dt.date,
      second: dt.second,
      row: excelRow,
    });
  }

  if (events.length === 0) {
    throw new FileFormatError('В файле не найдено ни одного корректного события.');
  }
  return { events, issues, totalRows };
}
