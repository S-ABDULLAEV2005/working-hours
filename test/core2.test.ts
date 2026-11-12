import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  evaluateDay,
  evaluateDays,
  identityWarnings,
  importRows,
  lowAttendanceThreshold,
  normalizeSettings,
  summarize,
  withHolidays,
  workdaysBetween,
} from '../src/core';
import type { Absence, DayFacts } from '../src/core';

const S = DEFAULT_SETTINGS;
const day = (date: string, inHM: string, outHM: string | null, employeeId = '1'): DayFacts => {
  const sec = (hm: string) => Number(hm.slice(0, 2)) * 3600 + Number(hm.slice(3)) * 60;
  return {
    employeeId,
    date,
    firstIn: sec(inHM),
    lastOut: outHM ? sec(outHM) : null,
    eventsCount: outHM ? 2 : 1,
    nightIgnored: false,
  };
};
const abs = (p: Partial<Absence>): Absence => ({
  id: 1,
  employeeId: '1',
  date: '2026-10-07',
  fromMinute: 480,
  toMinute: 720,
  reason: 'Налоговая',
  attachmentPath: null,
  status: 'new',
  reviewNote: '',
  reviewedByName: '',
  createdAt: '',
  ...p,
});

describe('отгулы', () => {
  it('отгул с 08:00 до 12:00, пришёл в 12:15 → опоздание 15 мин, а не 4 ч 15 мин', () => {
    const r = evaluateDay(day('2026-10-07', '12:15', '18:00'), 'Agency\\Main', S, [abs({ toMinute: 720 })]);
    expect(r.minutesLate).toBe(15);
    expect(r.flags).toContain('EXCUSED');
  });
  it('пришёл до окончания отгула → опоздания нет', () => {
    expect(evaluateDay(day('2026-10-07', '11:00', '18:00'), 'Agency\\Main', S, [abs({})]).minutesLate).toBe(0);
  });
  it('отклонённый отгул не засчитывается', () => {
    const r = evaluateDay(day('2026-10-07', '12:15', '18:00'), 'Agency\\Main', S, [abs({ status: 'rejected' })]);
    expect(r.minutesLate).toBe(255);
    expect(r.flags).not.toContain('EXCUSED');
  });
  it('отгул посреди дня (14:00–16:00) не влияет на утреннее опоздание', () => {
    expect(
      evaluateDay(day('2026-10-07', '08:30', '18:00'), 'Agency\\Main', S, [abs({ fromMinute: 840, toMinute: 960 })])
        .minutesLate,
    ).toBe(30);
  });
  it('два отгула подряд (08:00–10:00 и 10:00–12:00) складываются', () => {
    const r = evaluateDay(day('2026-10-07', '12:05', '18:00'), 'Agency\\Main', S, [
      abs({ id: 1, fromMinute: 480, toMinute: 600 }),
      abs({ id: 2, fromMinute: 600, toMinute: 720 }),
    ]);
    expect(r.minutesLate).toBe(5);
  });
  it('отгул на весь день → опоздания нет', () => {
    expect(
      evaluateDay(day('2026-10-07', '16:00', '18:00'), 'Agency\\Main', S, [abs({ toMinute: 1020 })]).minutesLate,
    ).toBe(0);
  });
  it('итоги месяца считают дни с отгулом (в том числе дни без отметок камеры), отклонённые — нет', () => {
    const daily = evaluateDays([day('2026-10-07', '12:15', '18:00')], new Map(), S, [abs({})]);
    const m = summarize(daily, '2026-10', [
      abs({}),
      abs({ id: 2, date: '2026-10-08' }),
      abs({ id: 3, date: '2026-10-09', status: 'rejected' }),
    ]);
    expect(m[0]).toMatchObject({ lateCount: 1, minutesLate: 15, absenceDays: 2 });
  });
});

describe('переработка', () => {
  it('ушёл в 19:30 → 2 ч 30 мин переработки', () => {
    expect(evaluateDay(day('2026-10-07', '08:00', '19:30'), 'Agency\\Main', S).minutesOvertime).toBe(150);
  });
  it('ушёл в 17:00 или раньше → 0', () => {
    expect(evaluateDay(day('2026-10-07', '08:00', '16:00'), 'Agency\\Main', S).minutesOvertime).toBe(0);
  });
  it('работа в субботу — всё время считается переработкой', () => {
    expect(evaluateDay(day('2026-10-10', '10:00', '14:00'), 'Agency\\Main', S).minutesOvertime).toBe(240);
  });
  it('пришёл вечером (после 17:00) — считается только время после прихода', () => {
    expect(evaluateDay(day('2026-10-07', '18:00', '19:00'), 'Agency\\Main', S).minutesOvertime).toBe(60);
  });
  it('одна отметка или уборщица — переработка 0', () => {
    expect(evaluateDay(day('2026-10-07', '08:00', null), 'Agency\\Main', S).minutesOvertime).toBe(0);
    expect(evaluateDay(day('2026-10-07', '06:00', '19:00'), 'Agency\\Cleaner', S).minutesOvertime).toBe(0);
  });
});

describe('праздники и сокращённые дни', () => {
  const s = withHolidays(S, [
    { date: '2026-12-31', kind: 'short', endMinute: 960, name: 'Канун', comment: '' },
    { date: '2026-11-06', kind: 'holiday', endMinute: null, name: 'Конституция', comment: '' },
  ]);
  it('сокращённый день: переработка считается после 16:00', () => {
    const r = evaluateDay(day('2026-12-31', '08:00', '17:00'), 'Agency\\Main', s);
    expect(r.minutesOvertime).toBe(60);
    expect(r.flags).toContain('SHORT_DAY');
  });
  it('праздник — опоздание не считается', () => {
    expect(evaluateDay(day('2026-11-06', '10:00', '12:00'), 'Agency\\Main', s).minutesLate).toBeNull();
  });
  it('праздники из таблицы заменяют список по умолчанию', () => {
    expect(s.holidays).toEqual(['2026-11-06']);
    expect(s.shortDays).toEqual({ '2026-12-31': 960 });
  });
});

describe('«мало посещений» — доля рабочих дней загруженного периода', () => {
  it('полный октябрь: 22 рабочих дня, порог 25% = 5,5 дня', () => {
    const dates = ['2026-10-01', '2026-10-31'];
    expect(workdaysBetween('2026-10-01', '2026-10-31', S)).toBe(22);
    expect(lowAttendanceThreshold(dates, '2026-10', S)).toEqual({ workdays: 22, minDays: 5.5 });
  });
  it('загружено 1–5 ноября (4 рабочих дня): сотрудник, бывший все 4 дня, — не «мало посещений»', () => {
    const t = lowAttendanceThreshold(['2026-11-02', '2026-11-05'], '2026-11', S);
    expect(t.workdays).toBe(4);
    expect(4 < t.minDays).toBe(false);
    expect(0 < t.minDays).toBe(true);
  });
  it('процент меняется в настройках, кривые значения не ломают', () => {
    expect(normalizeSettings({ lowAttendancePercent: 40 }).lowAttendancePercent).toBe(40);
    expect(normalizeSettings({ lowAttendancePercent: 500 }).lowAttendancePercent).toBe(100);
    expect(normalizeSettings({}).lowAttendancePercent).toBe(25);
  });
});

describe('предупреждения о совпадениях ID и ФИО', () => {
  const H = ['Время', 'Ид. польз.', 'Имя', 'Раздел', 'Имя устройства посещения'];
  it('одно ФИО под разными ID и разные ФИО под одним ID', () => {
    const r = importRows([
      H,
      ['2026-10-05 08:00:00', '276', 'Хаитова  Мадина', 'Agency\\A', 'Д'],
      ['2026-10-05 08:00:00', '318', 'хаитова мадина', 'Agency\\B', 'Д'],
      ['2026-10-05 08:00:00', '10', 'Иванов Иван', 'Agency\\A', 'Д'],
      ['2026-10-06 08:00:00', '10', 'Иванов Иван Иванович', 'Agency\\A', 'Д'],
      ['2026-10-05 08:00:00', '11', 'Петров', 'Agency\\A', 'Д'],
    ]);
    expect(r.warnings.sameNameDifferentIds).toEqual([{ name: 'Хаитова Мадина', employeeIds: ['276', '318'] }]);
    expect(r.warnings.sameIdDifferentNames).toEqual([
      { employeeId: '10', names: ['Иванов Иван', 'Иванов Иван Иванович'] },
    ]);
  });
  it('нет совпадений — пустые списки', () => {
    expect(identityWarnings([])).toEqual({ sameIdDifferentNames: [], sameNameDifferentIds: [] });
  });
});
