/** Языконезависимые форматтеры. Названия месяцев, «ч/мин» и т. п. — в i18n (useI18n().f). */

/** 2026-10-07 → «07.10.2026» */
export const dateShort = (date: string) => date.split('-').reverse().join('.');

/** Минуты от полуночи → «08:00» */
export const minuteClock = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Секунды от полуночи → «08:00» */
export const secClock = (sec: number | null) => (sec === null ? '—' : minuteClock(Math.floor(sec / 60)));

export const parseClock = (v: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
};

/** Agency\1Ҷ(ҶСК) → 1Ҷ(ҶСК); пустой отдел → '' (подпись подставляет интерфейс). */
export const deptLabel = (d: string) => d.replace(/^Agency\\?/, '');

export const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
