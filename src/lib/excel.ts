import { FileFormatError, importRows, type ImportResult } from '../core';
import { UserError } from './api';

const MAX_BYTES = 30 * 1024 * 1024;

/** Читает выгрузку FaceID в браузере (в Web Worker — страница не «зависает»). */
export async function readAttendanceFile(file: File): Promise<ImportResult> {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new UserError(/\.xls$/i.test(file.name) ? 'err.xls' : 'err.notXlsx');
  }
  if (file.size > MAX_BYTES) throw new UserError('err.xlsxTooBig');
  if (file.size === 0) throw new UserError('err.emptyFile');

  let rows: unknown[][];
  try {
    const { readSheet } = await import('read-excel-file/browser');
    rows = (await readSheet(file)) as unknown[][];
  } catch {
    throw new UserError('err.cantOpen');
  }
  try {
    return importRows(rows);
  } catch (e) {
    if (e instanceof FileFormatError) throw new UserError(e.message);
    throw e;
  }
}
