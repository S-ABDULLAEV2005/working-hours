import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  FileFormatError,
  clock,
  dedupe,
  duration,
  evaluateDays,
  importRows,
  isoWeekday,
  parseDateTime,
  summarize as summarizeMonth,
} from '../src/core';
import type { Settings } from '../src/core';

/** Полный конвейер как в приложении: импорт → применение графика. */
function processRows(rows: unknown[][], s: Settings) {
  const r = importRows(rows);
  const employees = new Map(r.employees.map((e) => [e.employeeId, e]));
  return { ...r, employees, daily: evaluateDays(r.days, employees, s) };
}

const HEADER = [
  'Время',
  'Ид. польз.',
  'Имя',
  'Раздел',
  'Имя устройства посещения',
  'Событие посещаемости',
  'Способ посещения',
  'Изображение',
];
const row = (time: unknown, id = '1', dept = 'Agency\\Main', name = 'Тест Тестов') => [
  time,
  id,
  name,
  dept,
  'Дверь',
  'Вход/выход[0]',
  'Лицо',
  'C:/x.jpg',
];
const run = (rows: unknown[][], s: Settings = DEFAULT_SETTINGS) => processRows([HEADER, ...rows], s);

describe('parseDateTime', () => {
  it('строка ISO с секундами', () => {
    expect(parseDateTime('2026-10-05 08:15:30')).toEqual({ date: '2026-10-05', second: 8 * 3600 + 15 * 60 + 30 });
  });
  it('строка без секунд и с лишними пробелами', () => {
    expect(parseDateTime('  2026-10-05   8:05 ')).toEqual({ date: '2026-10-05', second: 8 * 3600 + 5 * 60 });
  });
  it('формат ДД.ММ.ГГГГ', () => {
    expect(parseDateTime('05.10.2026 17:00:00')).toEqual({ date: '2026-10-05', second: 17 * 3600 });
  });
  it('объект Date читается в UTC, без сдвига часового пояса', () => {
    expect(parseDateTime(new Date(Date.UTC(2026, 9, 5, 8, 0, 0)))).toEqual({ date: '2026-10-05', second: 8 * 3600 });
  });
  it('Excel serial', () => {
    // 46300 = 2026-10-05; 0.5 = 12:00
    expect(parseDateTime(46300.5)).toEqual({ date: '2026-10-05', second: 12 * 3600 });
  });
  it('мусор и несуществующие даты → null', () => {
    expect(parseDateTime('вчера')).toBeNull();
    expect(parseDateTime('2026-02-30 08:00:00')).toBeNull();
    expect(parseDateTime('2026-10-05 25:00:00')).toBeNull();
    expect(parseDateTime(null)).toBeNull();
  });
});

describe('формат файла', () => {
  it('нет нужной колонки → понятная ошибка', () => {
    expect(() =>
      processRows(
        [
          ['Дата', 'Сотрудник'],
          ['x', 'y'],
        ],
        DEFAULT_SETTINGS,
      ),
    ).toThrow(FileFormatError);
    expect(() =>
      processRows(
        [
          ['Дата', 'Сотрудник'],
          ['x', 'y'],
        ],
        DEFAULT_SETTINGS,
      ),
    ).toThrow(/Ид\. польз\./);
  });
  it('колонки в другом порядке и заголовки с пробелами работают', () => {
    const header = ['Имя устройства посещения ', ' Ид. польз.', 'Раздел', 'Имя', 'Время'];
    const r = processRows(
      [
        header,
        ['Д', '7', 'Agency\\Main', 'А', '2026-10-05 08:00:00'],
        ['Д', '7', 'Agency\\Main', 'А', '2026-10-05 17:00:00'],
      ],
      DEFAULT_SETTINGS,
    );
    expect(r.daily[0].minutesPresent).toBe(540);
  });
  it('пустой файл / только заголовок', () => {
    expect(() => processRows([], DEFAULT_SETTINGS)).toThrow(FileFormatError);
    expect(() => processRows([HEADER], DEFAULT_SETTINGS)).toThrow(/ни одного/);
  });
  it('плохие строки пропускаются и попадают в отчёт с номером строки Excel', () => {
    const r = run([row('2026-10-05 08:00:00'), row('ерунда'), row('2026-10-05 17:00:00', '')]);
    expect(r.issues).toEqual([
      { row: 3, message: expect.stringMatching(/ерунда/) },
      { row: 4, message: expect.stringMatching(/Нет ID/) },
    ]);
    expect(r.daily).toHaveLength(1);
  });
  it('пустые строки игнорируются', () => {
    const r = run([row('2026-10-05 08:00:00'), [], ['', null, ''], row('2026-10-05 17:00:00')]);
    expect(r.totalRows).toBe(2);
    expect(r.issues).toHaveLength(0);
  });
});

describe('расчёт дня', () => {
  it('обычный день: приход 08:00, уход 17:00 → 9 ч, опоздания нет', () => {
    const [d] = run([row('2026-10-05 17:00:00'), row('2026-10-05 08:00:00')]).daily;
    expect(d).toMatchObject({ firstIn: 8 * 3600, lastOut: 17 * 3600, minutesPresent: 540, minutesLate: 0, flags: [] });
  });
  it('порядок строк не важен (в файле от новых к старым)', () => {
    const a = run([row('2026-10-05 12:00:00'), row('2026-10-05 08:30:00'), row('2026-10-05 17:10:00')]).daily[0];
    expect(a.firstIn).toBe(8 * 3600 + 30 * 60);
    expect(a.lastOut).toBe(17 * 3600 + 10 * 60);
  });
  it('опоздание: приход 09:20:59 → 80 мин (секунды не округляются вверх)', () => {
    const [d] = run([row('2026-10-05 09:20:59'), row('2026-10-05 17:00:00')]).daily;
    expect(d.minutesLate).toBe(80);
  });
  it('приход 08:00:59 — не опоздание', () => {
    const [d] = run([row('2026-10-05 08:00:59'), row('2026-10-05 17:00:00')]).daily;
    expect(d.minutesLate).toBe(0);
  });
  it('одна отметка: уход неизвестен, время 0, опоздание НЕ начисляется', () => {
    const [d] = run([row('2026-10-07 17:41:04')]).daily;
    expect(d).toMatchObject({ lastOut: null, minutesPresent: 0, minutesLate: null, eventsCount: 1 });
    expect(d.flags).toContain('SINGLE_EVENT');
  });
  it('случай ID 299: две отметки за 1 сек в 17:41 → одна отметка, без опоздания', () => {
    const r = run([row('2026-10-07 17:41:04', '299'), row('2026-10-07 17:41:05', '299')]);
    expect(r.daily[0]).toMatchObject({ eventsCount: 1, minutesLate: null, minutesPresent: 0 });
    const [m] = summarizeMonth(r.daily, '2026-10');
    expect(m).toMatchObject({ lateCount: 0, minutesLate: 0, singleEventDays: 1 });
  });
  it('дубли: отметки через 59 сек — одна, через 60 сек — две', () => {
    expect(run([row('2026-10-05 08:00:00'), row('2026-10-05 08:00:59')]).daily[0].eventsCount).toBe(1);
    expect(run([row('2026-10-05 08:00:00'), row('2026-10-05 08:01:00')]).daily[0].eventsCount).toBe(2);
  });
  it('дубли: серия 08:00:00, :30, :50 — одна отметка; разные сотрудники не схлопываются', () => {
    const r = run([
      row('2026-10-05 08:00:00'),
      row('2026-10-05 08:00:30'),
      row('2026-10-05 08:00:50'),
      row('2026-10-05 08:00:10', '2'),
    ]);
    expect(r.daily.map((d) => d.eventsCount)).toEqual([1, 1]);
  });
  it('дубли < 60 сек схлопываются; две отметки за 30 сек = одна отметка', () => {
    const [d] = run([row('2026-10-05 08:00:00'), row('2026-10-05 08:00:03'), row('2026-10-05 08:00:30')]).daily;
    expect(d.eventsCount).toBe(1);
    expect(d.flags).toContain('SINGLE_EVENT');
  });
  it('уборщицы: опоздание не считается', () => {
    const [d] = run([
      row('2026-10-05 10:30:00', '5', 'Agency\\Cleaner'),
      row('2026-10-05 15:00:00', '5', 'Agency\\Cleaner'),
    ]).daily;
    expect(d.minutesLate).toBeNull();
    expect(d.minutesPresent).toBe(270);
    expect(d.flags).toContain('NO_SCHEDULE');
  });
  it('суббота и праздник: время считается, опоздание — нет', () => {
    const r = run([
      row('2026-10-10 10:00:00'),
      row('2026-10-10 14:00:00'), // суббота
      row('2026-09-09 10:00:00'),
      row('2026-09-09 11:00:00'), // День независимости
    ]).daily;
    for (const d of r) {
      expect(d.minutesLate).toBeNull();
      expect(d.flags).toContain('NON_WORKDAY');
    }
    expect(r.map((d) => d.minutesPresent).sort()).toEqual([240, 60].sort());
  });
  it('ночные отметки 00:00–04:00 не учитываются в приходе', () => {
    const [d] = run([row('2026-10-16 00:33:00'), row('2026-10-16 08:05:00'), row('2026-10-16 17:00:00')]).daily;
    expect(d.firstIn).toBe(8 * 3600 + 5 * 60);
    expect(d.flags).toContain('NIGHT_EVENTS_IGNORED');
  });
  it('день только с ночными отметками не создаёт рабочий день', () => {
    expect(
      run([row('2026-10-16 00:33:00'), row('2026-10-16 08:00:00', '2'), row('2026-10-16 17:00:00', '2')]).daily,
    ).toHaveLength(1);
  });
  it('обед вычитается, только если человек был весь интервал', () => {
    const s = { ...DEFAULT_SETTINGS, lunch: { startMinute: 720, endMinute: 780 } };
    const full = run([row('2026-10-05 08:00:00'), row('2026-10-05 17:00:00')], s).daily[0];
    const morning = run([row('2026-10-05 08:00:00'), row('2026-10-05 12:30:00')], s).daily[0];
    expect(full.minutesPresent).toBe(480);
    expect(morning.minutesPresent).toBe(270);
  });
  it('разные ID с одинаковым ФИО — разные сотрудники', () => {
    const r = run([
      row('2026-10-05 08:00:00', '276', 'Agency\\Main', 'Хаитова Мадина'),
      row('2026-10-05 08:00:00', '318', 'Agency\\Main', 'Хаитова Мадина'),
    ]);
    expect(r.employees.size).toBe(2);
  });
  it('ФИО и отдел берутся из самого позднего события', () => {
    const r = run([
      row('2026-10-05 08:00:00', '1', 'Agency\\Old', 'Старое'),
      row('2026-10-06 08:00:00', '1', 'Agency\\New', 'Новое'),
    ]);
    expect(r.employees.get('1')).toEqual({ employeeId: '1', name: 'Новое', department: 'Agency\\New' });
  });
});

describe('итоги месяца', () => {
  it('суммирует только выбранный месяц', () => {
    const r = run([
      row('2026-09-30 09:00:00'),
      row('2026-09-30 17:00:00'),
      row('2026-10-01 08:30:00'),
      row('2026-10-01 17:00:00'),
      row('2026-10-02 08:00:00'),
      row('2026-10-02 17:00:00'),
      row('2026-10-05 09:00:00'),
    ]);
    const [m] = summarizeMonth(r.daily, '2026-10');
    expect(m).toEqual({
      employeeId: '1',
      month: '2026-10',
      daysPresent: 3,
      // 05.10 — одна отметка в 09:00: опоздание не начисляется
      minutesPresent: 510 + 540,
      lateCount: 1,
      minutesLate: 30,
      singleEventDays: 1,
    });
    expect(r.period).toEqual({ from: '2026-09-30', to: '2026-10-05', months: ['2026-09', '2026-10'] });
  });
});

describe('утилиты', () => {
  it('isoWeekday', () => {
    expect(isoWeekday('2026-11-09')).toBe(1); // понедельник
    expect(isoWeekday('2026-11-08')).toBe(7); // воскресенье
  });
  it('dedupe', () => expect(dedupe([0, 10, 59, 60, 200], 60)).toEqual([0, 60, 200]));
  it('форматирование', () => {
    expect(clock(8 * 3600 + 5 * 60 + 59)).toBe('08:05');
    expect(clock(null)).toBe('—');
    expect(duration(0)).toBe('0 мин');
    expect(duration(65)).toBe('1 ч 05 мин');
    expect(duration(120)).toBe('2 ч');
  });
});
