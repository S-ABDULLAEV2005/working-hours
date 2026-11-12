import type { Row, Worksheet } from 'exceljs';
import { isoWeekday } from '../core';
import type { DictKey, Fmt } from '../i18n';
import type { MonthData, MonthRow } from './data';
import { deptLabel, minuteClock } from './format';

const C = {
  navy: 'FF1A1D2B',
  stamp: 'FF3A3E9C',
  soft: 'FFE9EAF7',
  zebra: 'FFF7F8FB',
  border: 'FFDCE0EA',
  red: 'FFC2372E',
  redBg: 'FFFBE9E7',
  amberBg: 'FFFDF3DC',
  grey: 'FF646A80',
  white: 'FFFFFFFF',
  green: 'FF2F7D55',
};
const DUR = '[h]:mm';
const thin = { style: 'thin' as const, color: { argb: C.border } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

type T = (k: DictKey, v?: Record<string, string | number>) => string;

/** Excel-отчёт за месяц на выбранном языке — те же цифры, что на экране. */
export async function exportMonth(month: string, data: MonthData, rows: MonthRow[], t: T, f: Fmt): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = t('app.name');
  const s = data.settings;
  const title = f.monthLower(month);
  const sorted = [...rows].sort((a, b) => a.employee.name.localeCompare(b.employee.name, 'ru'));
  const dept = (d: string) => deptLabel(d) || t('common.noDept');

  const titleBlock = (ws: Worksheet, cols: number, head: string, sub: string) => {
    ws.mergeCells(1, 1, 1, cols);
    ws.mergeCells(2, 1, 2, cols);
    ws.getCell(1, 1).value = head;
    ws.getCell(1, 1).font = { size: 16, bold: true, color: { argb: C.navy } };
    ws.getRow(1).height = 28;
    ws.getCell(2, 1).value = sub;
    ws.getCell(2, 1).font = { size: 10, color: { argb: C.grey } };
    ws.getRow(3).height = 6;
  };
  const header = (ws: Worksheet, labels: string[]) => {
    const row = ws.getRow(4);
    labels.forEach((l, i) => {
      const c = row.getCell(i + 1);
      c.value = l;
      c.font = { bold: true, size: 10, color: { argb: C.white } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.stamp } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = box;
    });
    row.height = 36;
    ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 1 }];
  };
  const body = (row: Row, cols: number, zebra: boolean) => {
    for (let i = 1; i <= cols; i++) {
      const c = row.getCell(i);
      c.font = { size: 10, ...(c.font ?? {}) };
      c.border = box;
      c.alignment = { vertical: 'middle', horizontal: i <= 2 ? 'left' : 'center', ...(c.alignment ?? {}) };
      if (zebra && !c.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
    }
  };

  // Итоги
  const a = wb.addWorksheet(t('export.sheetSummary'));
  const aH = [
    t('col.employee'),
    t('export.dept'),
    t('common.faceId'),
    t('col.days'),
    `${t('col.worked')}\n(${t('export.hhmm')})`,
    t('export.lateCount'),
    `${t('export.lateTotal')}\n(${t('export.hhmm')})`,
    t('col.single'),
    `${t('col.overtime')}\n(${t('export.hhmm')})`,
    t('col.absences'),
  ];
  a.columns = [32, 22, 10, 11, 15, 11, 16, 13, 15, 11].map((width) => ({ width }));
  titleBlock(
    a,
    aH.length,
    `${t('app.name')}: ${title}`,
    t('export.summarySub', { n: sorted.length, time: minuteClock(s.shiftStartMinute) }),
  );
  header(a, aH);
  sorted.forEach((m, i) => {
    const row = a.addRow([
      m.employee.name,
      dept(m.employee.department),
      Number(m.employeeId) || m.employeeId,
      m.daysPresent,
      m.minutesPresent / 1440,
      m.noSchedule ? t('common.noSchedule') : m.lateCount,
      m.noSchedule ? t('common.noSchedule') : m.minutesLate / 1440,
      m.singleEventDays || '',
      m.minutesOvertime / 1440,
      m.absenceDays || '',
    ]);
    row.getCell(5).numFmt = DUR;
    row.getCell(7).numFmt = DUR;
    row.getCell(9).numFmt = DUR;
    if (!m.noSchedule && m.lateCount > 0)
      [6, 7].forEach((k) => (row.getCell(k).font = { bold: true, color: { argb: C.red } }));
    if (m.noSchedule) [6, 7].forEach((k) => (row.getCell(k).font = { italic: true, color: { argb: C.grey } }));
    if (m.singleEventDays) row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.amberBg } };
    body(row, aH.length, i % 2 === 1);
  });
  const last = 4 + sorted.length;
  if (sorted.length) {
    const sum = (col: string) => ({ formula: `SUM(${col}5:${col}${last})` });
    const tot = a.addRow([
      t('export.total'),
      '',
      '',
      sum('D'),
      sum('E'),
      sum('F'),
      sum('G'),
      sum('H'),
      sum('I'),
      sum('J'),
    ]);
    [5, 7, 9].forEach((k) => (tot.getCell(k).numFmt = DUR));
    body(tot, aH.length, false);
    tot.eachCell((c) => {
      c.font = { bold: true, size: 10 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.soft } };
    });
  }
  a.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(last, 5), column: aH.length } };

  // По дням
  const d = wb.addWorksheet(t('export.sheetDays'));
  const dH = [
    t('col.employee'),
    t('export.dept'),
    t('export.date'),
    t('export.weekday'),
    t('day.in'),
    t('day.out'),
    `${t('day.worked')}\n(${t('export.hhmm')})`,
    `${t('day.late')}\n(${t('export.hhmm')})`,
    `${t('day.overtime')}\n(${t('export.hhmm')})`,
    t('export.comment'),
  ];
  d.columns = [32, 22, 12, 9, 10, 10, 14, 14, 14, 50].map((width) => ({ width }));
  titleBlock(d, dH.length, `${t('export.daysTitle')}: ${title}`, t('export.daysSub'));
  header(d, dH);
  let band = false;
  for (const m of sorted) {
    band = !band;
    for (const x of m.days) {
      const wd = isoWeekday(x.date);
      const notes: string[] = [];
      if (x.flags.includes('SINGLE_EVENT')) notes.push(t('day.noteSingle'));
      if (x.flags.includes('NON_WORKDAY')) notes.push(wd >= 6 ? t('day.noteWeekend') : t('day.noteHoliday'));
      if (x.flags.includes('NO_SCHEDULE')) notes.push(t('common.noSchedule'));
      if (x.flags.includes('EXCUSED')) notes.push(t('day.noteExcused'));
      for (const ab of m.absences.filter((z) => z.date === x.date && z.status !== 'rejected')) {
        notes.push(`${t('stat.absences')} ${minuteClock(ab.fromMinute)}–${minuteClock(ab.toMinute)}: ${ab.reason}`);
      }
      const [y, mo, dd] = x.date.split('-').map(Number);
      const late = x.minutesLate === null ? '—' : x.minutesLate > 0 ? x.minutesLate / 1440 : '';
      const row = d.addRow([
        m.employee.name,
        dept(m.employee.department),
        new Date(Date.UTC(y, mo - 1, dd)),
        f.weekday(wd),
        x.firstIn / 86400,
        x.lastOut === null ? '—' : x.lastOut / 86400,
        x.lastOut === null ? '—' : x.minutesPresent / 1440,
        late,
        x.minutesOvertime ? x.minutesOvertime / 1440 : '',
        notes.join('. '),
      ]);
      row.getCell(3).numFmt = 'dd.mm.yyyy';
      row.getCell(5).numFmt = 'hh:mm';
      row.getCell(6).numFmt = 'hh:mm';
      [7, 8, 9].forEach((k) => (row.getCell(k).numFmt = DUR));
      row.getCell(10).alignment = { horizontal: 'left' };
      if (typeof late === 'number') {
        row.getCell(8).font = { bold: true, color: { argb: C.red } };
        row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.redBg } };
      }
      if (x.lastOut === null)
        [6, 7].forEach(
          (k) => (row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.amberBg } }),
        );
      body(row, dH.length, band);
    }
  }
  d.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: dH.length } };

  for (const ws of [a, d])
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:4' };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download =
    rows.length === 1
      ? `${t('export.file')}, ${rows[0].employee.name}, ${f.monthTitle(month)}.xlsx`
      : `${t('export.file')}, ${f.monthTitle(month)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
