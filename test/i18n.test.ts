import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DICT } from '../src/i18n/dict';
import { makeFmt, pluralWord, translate } from '../src/i18n';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('словарь RU/EN/TJ', () => {
  it('у каждой фразы есть все три перевода с одинаковыми переменными', () => {
    for (const [key, [ru, en, tj]] of Object.entries(DICT)) {
      expect(ru.trim(), key).not.toBe('');
      expect(en.trim(), key).not.toBe('');
      expect(tj.trim(), key).not.toBe('');
      expect(vars(en), `${key} en`).toEqual(vars(ru));
      expect(vars(tj), `${key} tj`).toEqual(vars(ru));
    }
  });

  it('все ключи, использованные в коде, есть в словаре', () => {
    const files: string[] = [];
    const walk = (d: string) =>
      readdirSync(d).forEach((f) => {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p)) files.push(p);
      });
    walk(fileURLToPath(new URL('../src', import.meta.url)));
    const used = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/UserError\('(err\.[\w.]+)'\)/g)) used.add(m[1]);
    }
    for (const k of used) expect(DICT, k).toHaveProperty([k]);
  });

  it('подстановка переменных и форма слов', () => {
    expect(translate('ru', 'tabel.title', { month: 'октябрь 2026' })).toBe('Табель: октябрь 2026');
    expect(translate('tj', 'nav.me')).toBe('Саҳифаи ман');
    expect([1, 2, 5, 11, 21, 22, 191].map((n) => pluralWord('ru', 'employees', n))).toEqual([
      'сотрудник',
      'сотрудника',
      'сотрудников',
      'сотрудников',
      'сотрудник',
      'сотрудника',
      'сотрудник',
    ]);
    expect(pluralWord('en', 'employees', 1)).toBe('employee');
    expect(pluralWord('tj', 'employees', 5)).toBe('корманд');
  });

  it('форматы времени и дат на трёх языках', () => {
    expect(makeFmt('ru').hm(1739)).toBe('28 ч 59 мин');
    expect(makeFmt('en').hm(1739)).toBe('28 h 59 min');
    expect(makeFmt('tj').hm(1739)).toBe('28 соат 59 дақ');
    expect(makeFmt('ru').dayLong('2026-10-07')).toBe('7 октября');
    expect(makeFmt('tj').monthTitle('2026-10')).toBe('Октябр 2026');
    expect(makeFmt('en').weekday(1)).toBe('Mon');
  });
});
