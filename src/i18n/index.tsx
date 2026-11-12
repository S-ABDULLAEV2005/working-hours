import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DICT, PLURALS, type DictKey, type PluralKey } from './dict';

export type Lang = 'ru' | 'en' | 'tj';
export const LANGS: { code: Lang; label: string; name: string }[] = [
  { code: 'tj', label: 'TJ', name: 'Тоҷикӣ' },
  { code: 'ru', label: 'RU', name: 'Русский' },
  { code: 'en', label: 'EN', name: 'English' },
];
const IDX: Record<Lang, number> = { ru: 0, en: 1, tj: 2 };
const STORAGE_KEY = 'davomot-lang';

const MONTHS: Record<Lang, string[]> = {
  ru: [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  tj: ['Январ', 'Феврал', 'Март', 'Апрел', 'Май', 'Июн', 'Июл', 'Август', 'Сентябр', 'Октябр', 'Ноябр', 'Декабр'],
};
const MONTHS_GEN: Record<Lang, string[]> = {
  ru: [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ],
  en: MONTHS.en,
  tj: ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'],
};
const WEEKDAYS: Record<Lang, string[]> = {
  ru: ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  en: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  tj: ['', 'Дш', 'Сш', 'Чш', 'Пш', 'Ҷм', 'Шб', 'Яш'],
};
const UNITS: Record<Lang, { h: string; m: string }> = {
  ru: { h: 'ч', m: 'мин' },
  en: { h: 'h', m: 'min' },
  tj: { h: 'соат', m: 'дақ' },
};

function readLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'ru' || v === 'en' || v === 'tj') return v;
  } catch {
    /* хранилище недоступно */
  }
  return 'ru';
}

export interface Fmt {
  monthTitle: (m: string) => string;
  monthLower: (m: string) => string;
  dayLong: (date: string) => string;
  weekday: (iso: number) => string;
  hm: (min: number | null | undefined) => string;
  hours: (min: number) => string;
  num: (n: number) => string;
  dateTime: (iso: string) => string;
}

export function makeFmt(lang: Lang): Fmt {
  const u = UNITS[lang];
  const locale = lang === 'en' ? 'en-GB' : 'ru-RU';
  return {
    monthTitle: (m) => {
      const [y, mo] = m.split('-').map(Number);
      return `${MONTHS[lang][mo - 1]} ${y}`;
    },
    monthLower: (m) => {
      const [y, mo] = m.split('-').map(Number);
      return `${lang === 'en' ? MONTHS.en[mo - 1] : MONTHS[lang][mo - 1].toLowerCase()} ${y}`;
    },
    dayLong: (date) => {
      const [, m, d] = date.split('-').map(Number);
      return lang === 'en' ? `${d} ${MONTHS.en[m - 1]}` : `${d} ${MONTHS_GEN[lang][m - 1]}`;
    },
    weekday: (iso) => WEEKDAYS[lang][iso],
    hm: (min) => {
      if (min === null || min === undefined) return '—';
      const h = Math.floor(min / 60);
      const m = min % 60;
      if (h === 0) return `${m} ${u.m}`;
      return m === 0 ? `${h} ${u.h}` : `${h} ${u.h} ${m} ${u.m}`;
    },
    hours: (min) => `${Math.floor(min / 60).toLocaleString(locale)} ${u.h}`,
    num: (n) => n.toLocaleString(locale),
    dateTime: (iso) =>
      new Date(iso).toLocaleString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
  };
}

type Vars = Record<string, string | number>;
const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s);

export function translate(lang: Lang, key: DictKey, vars?: Vars): string {
  const e = DICT[key];
  return fill(e ? e[IDX[lang]] || e[0] : key, vars);
}

export function pluralWord(lang: Lang, key: PluralKey, n: number): string {
  const p = PLURALS[key];
  if (lang === 'tj') return p.tj;
  if (lang === 'en') return n === 1 ? p.en[0] : p.en[1];
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return p.ru[2];
  if (b > 1 && b < 5) return p.ru[1];
  if (b === 1) return p.ru[0];
  return p.ru[2];
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey, vars?: Vars) => string;
  /** Слово в нужной форме для числа: tp('employees', 5) → «сотрудников». */
  tp: (key: PluralKey, n: number) => string;
  f: Fmt;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l === 'tj' ? 'tg' : l;
  }, []);
  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (k, v) => translate(lang, k, v),
      tp: (k, n) => pluralWord(lang, k, n),
      f: makeFmt(lang),
    }),
    [lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n вне I18nProvider');
  return v;
}

export type { DictKey, PluralKey };

/** Текст ошибки для показа: ключ словаря переводится, остальное (сообщения сервера) — как есть. */
export function useErrorText() {
  const { lang } = useI18n();
  return (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e ?? '');
    return msg in DICT ? translate(lang, msg as DictKey) : msg;
  };
}
