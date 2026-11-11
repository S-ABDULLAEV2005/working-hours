import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readSheet } from 'read-excel-file/node';
import { DEFAULT_SETTINGS, evaluateDays, importRows, summarize } from '../src/core';

// Реальная выгрузка НЕ хранится в репозитории (персональные данные).
// Чтобы запустить тест, положите файл в web/fixtures/real.xlsx.
const FILE = new URL('../fixtures/real.xlsx', import.meta.url).pathname;

describe.skipIf(!existsSync(FILE))('реальная выгрузка FaceID (та же библиотека, что в браузере)', () => {
  it('разбирается без потерь; октябрь совпадает со сверенным отчётом', async () => {
    const rows = (await readSheet(readFileSync(FILE))) as unknown[][];
    const r = importRows(rows);
    expect(r.totalRows).toBe(32993);
    expect(r.issues).toHaveLength(0);
    expect(r.employees).toHaveLength(218);
    expect(r.period).toMatchObject({ from: '2026-09-01', to: '2026-11-11' });

    const emps = new Map(r.employees.map((e) => [e.employeeId, e]));
    const daily = evaluateDays(r.days, emps, DEFAULT_SETTINGS);
    const oct = summarize(daily, '2026-10');
    expect(oct).toHaveLength(191);
    expect(oct.reduce((a, m) => a + m.lateCount, 0)).toBe(1297);

    // Сверено вручную с пользователем: Behruzjon Ibragimov, ID 313
    expect(oct.find((m) => m.employeeId === '313')).toMatchObject({
      daysPresent: 24,
      minutesPresent: 178 * 60 + 59,
      lateCount: 15,
      minutesLate: 24 * 60 + 28,
      singleEventDays: 1,
    });
    // Shuhrat Soliev, ID 299 — две одиночные отметки, опозданий нет
    expect(oct.find((m) => m.employeeId === '299')).toMatchObject({
      daysPresent: 2,
      minutesPresent: 0,
      lateCount: 0,
      singleEventDays: 2,
    });
  }, 60_000);
});

describe('смена графика пересчитывает без повторной загрузки', () => {
  it('начало смены 09:00 уменьшает опоздание', () => {
    const r = importRows([
      ['Время', 'Ид. польз.', 'Имя', 'Раздел', 'Имя устройства посещения'],
      ['2026-10-05 09:30:00', '1', 'А', 'Agency\\Main', 'Д'],
      ['2026-10-05 17:00:00', '1', 'А', 'Agency\\Main', 'Д'],
    ]);
    const emps = new Map(r.employees.map((e) => [e.employeeId, e]));
    expect(evaluateDays(r.days, emps, DEFAULT_SETTINGS)[0].minutesLate).toBe(90);
    expect(evaluateDays(r.days, emps, { ...DEFAULT_SETTINGS, shiftStartMinute: 540 })[0].minutesLate).toBe(30);
  });
});
