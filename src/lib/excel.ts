import { FileFormatError, importRows, type ImportResult } from '../core';
import { UserError } from './api';

const MAX_BYTES = 30 * 1024 * 1024;

/** Читает выгрузку FaceID в браузере (в Web Worker — страница не «зависает»). */
export async function readAttendanceFile(file: File): Promise<ImportResult> {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new UserError(
      /\.xls$/i.test(file.name)
        ? 'Старый формат .xls не поддерживается. Откройте файл в Excel и сохраните как .xlsx.'
        : 'Нужен файл Excel в формате .xlsx — выгрузка из системы FaceID.',
    );
  }
  if (file.size > MAX_BYTES) throw new UserError('Файл больше 30 МБ. Выгрузите период покороче, например один месяц.');
  if (file.size === 0) throw new UserError('Файл пустой.');

  let rows: unknown[][];
  try {
    const { readSheet } = await import('read-excel-file/browser');
    rows = (await readSheet(file)) as unknown[][];
  } catch {
    throw new UserError('Не удалось открыть файл. Убедитесь, что это настоящий .xlsx и он не защищён паролем.');
  }
  try {
    return importRows(rows);
  } catch (e) {
    if (e instanceof FileFormatError) throw new UserError(e.message);
    throw e;
  }
}
