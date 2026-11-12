import { useSearchParams } from 'react-router';
import { useMonths } from './data';

/** Выбранный месяц хранится в адресе (?m=2026-10) — ссылкой можно поделиться, «Назад» работает. */
export function useMonthParam() {
  const [params, setParams] = useSearchParams();
  const months = useMonths();
  const fromUrl = params.get('m');
  const valid = fromUrl && /^\d{4}-\d{2}$/.test(fromUrl) ? fromUrl : null;
  const month = valid ?? months.data?.[0]?.month;
  const setMonth = (m: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('m', m);
      return n;
    });
  return { month, setMonth, months };
}
