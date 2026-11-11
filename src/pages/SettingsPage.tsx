import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { DEFAULT_SETTINGS, type Settings } from '../core';
import { Button, Notice, PageHeader, Panel, Spinner } from '../components/ui';
import { useApi } from '../lib/auth';
import { qk, useEmployees, useSettings } from '../lib/data';
import { dateShort, deptLabel, minuteClock, parseClock } from '../lib/format';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function SettingsPage() {
  const api = useApi();
  const qc = useQueryClient();
  const saved = useSettings();
  const emps = useEmployees();
  const [s, setS] = useState<Settings | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [lunchFrom, setLunchFrom] = useState('12:00');
  const [lunchTo, setLunchTo] = useState('13:00');
  const [newHoliday, setNewHoliday] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (saved.data && !s) {
      setS(saved.data);
      setStart(minuteClock(saved.data.shiftStartMinute));
      setEnd(minuteClock(saved.data.shiftEndMinute));
      if (saved.data.lunch) {
        setLunchFrom(minuteClock(saved.data.lunch.startMinute));
        setLunchTo(minuteClock(saved.data.lunch.endMinute));
      }
    }
  }, [saved.data, s]);

  const departments = useMemo(() => {
    const set = new Set<string>([...(emps.data?.values() ?? [])].map((e) => e.department));
    s?.noScheduleDepartments.forEach((d) => set.add(d));
    return [...set].sort((a, b) => deptLabel(a).localeCompare(deptLabel(b), 'ru'));
  }, [emps.data, s]);

  if (saved.isLoading || !s) {
    return saved.error ? (
      <Notice tone="error" title="Не удалось загрузить настройки">
        {(saved.error as Error).message}
      </Notice>
    ) : (
      <Spinner />
    );
  }

  const startMin = parseClock(start);
  const endMin = parseClock(end);
  const lf = parseClock(lunchFrom);
  const lt = parseClock(lunchTo);
  const errors: string[] = [];
  if (startMin === null) errors.push('Начало рабочего дня: укажите время в формате ЧЧ:ММ.');
  if (endMin === null) errors.push('Конец рабочего дня: укажите время в формате ЧЧ:ММ.');
  if (startMin !== null && endMin !== null && endMin <= startMin)
    errors.push('Конец рабочего дня должен быть позже начала.');
  if (s.lunch && (lf === null || lt === null || lt <= lf))
    errors.push('Обед: время окончания должно быть позже начала.');
  if (s.workdays.length === 0) errors.push('Отметьте хотя бы один рабочий день недели.');

  const next: Settings = {
    ...s,
    shiftStartMinute: startMin ?? s.shiftStartMinute,
    shiftEndMinute: endMin ?? s.shiftEndMinute,
    lunch: s.lunch ? { startMinute: lf ?? 0, endMinute: lt ?? 0 } : null,
  };
  const dirty = JSON.stringify(next) !== JSON.stringify(saved.data);

  const save = async () => {
    if (errors.length) return;
    setSaving(true);
    try {
      await api.saveSettings(next);
      qc.setQueryData(qk.settings, next);
      setS(next);
      toast.success('Настройки сохранены', { description: 'Все месяцы пересчитаны по новым правилам.' });
    } catch (e) {
      toast.error('Настройки не сохранены', { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="mx-auto max-w-[860px] pb-24">
      <PageHeader title="Настройки графика">
        Правила применяются сразу ко всем загруженным месяцам — файлы перезагружать не нужно.
      </PageHeader>

      <div className="space-y-5">
        <Section
          title="Рабочий день"
          hint="Опоздание считается от начала рабочего дня. Конец дня используется для отображения."
        >
          <div className="flex flex-wrap gap-4">
            <TimeField label="Начало" value={start} onChange={setStart} />
            <TimeField label="Конец" value={end} onChange={setEnd} />
          </div>
        </Section>

        <Section title="Рабочие дни недели" hint="В остальные дни время на работе учитывается, а опоздания — нет.">
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => {
              const on = s.workdays.includes(i + 1);
              return (
                <button
                  key={d}
                  aria-pressed={on}
                  onClick={() => setS({ ...s, workdays: toggle(s.workdays, i + 1).sort() })}
                  className={clsx(
                    'h-9 w-12 rounded-md border text-sm font-medium',
                    on ? 'border-stamp bg-stamp text-white' : 'border-rule bg-surface text-muted hover:bg-hover',
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </Section>

        <Section
          title="Обед"
          hint="Вычитается из отработанного времени, только если сотрудник был на работе весь интервал обеда."
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!s.lunch}
              onChange={(e) =>
                setS({ ...s, lunch: e.target.checked ? { startMinute: lf ?? 720, endMinute: lt ?? 780 } : null })
              }
              className="size-4 accent-[var(--color-stamp)]"
            />
            Вычитать обед из отработанного времени
          </label>
          {s.lunch && (
            <div className="mt-3 flex flex-wrap gap-4">
              <TimeField label="С" value={lunchFrom} onChange={setLunchFrom} />
              <TimeField label="До" value={lunchTo} onChange={setLunchTo} />
            </div>
          )}
        </Section>

        <Section
          title="Отделы без фиксированного графика"
          hint="Для этих отделов опоздания не считаются. Например, уборщицы работают «в необходимое время»."
        >
          {departments.length === 0 ? (
            <p className="text-sm text-muted">Список отделов появится после первой загрузки файла.</p>
          ) : (
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {departments.map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={s.noScheduleDepartments.includes(d)}
                    onChange={() => setS({ ...s, noScheduleDepartments: toggle(s.noScheduleDepartments, d) })}
                    className="size-4 accent-[var(--color-stamp)]"
                  />
                  {deptLabel(d)}
                </label>
              ))}
            </div>
          )}
        </Section>

        <Section title="Праздничные дни" hint="В праздники время на работе учитывается, а опоздания — нет.">
          <ul className="flex flex-wrap gap-2">
            {[...s.holidays].sort().map((h) => (
              <li
                key={h}
                className="flex items-center gap-1 rounded-full border border-rule bg-paper py-1 pr-1 pl-3 text-sm"
              >
                {dateShort(h)}
                <button
                  onClick={() => setS({ ...s, holidays: s.holidays.filter((x) => x !== h) })}
                  className="rounded-full p-0.5 text-muted hover:bg-hover hover:text-ink"
                  aria-label={`Убрать ${dateShort(h)}`}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
            {s.holidays.length === 0 && <li className="text-sm text-muted">Праздники не указаны</li>}
          </ul>
          <div className="mt-3 flex items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Добавить дату</span>
              <input
                type="date"
                value={newHoliday}
                onChange={(e) => setNewHoliday(e.target.value)}
                className="h-9 rounded-md border border-rule bg-surface px-3"
              />
            </label>
            <Button
              disabled={!newHoliday || s.holidays.includes(newHoliday)}
              onClick={() => {
                setS({ ...s, holidays: [...s.holidays, newHoliday] });
                setNewHoliday('');
              }}
            >
              <Plus className="size-4" aria-hidden /> Добавить
            </Button>
          </div>
        </Section>

        <Panel className="p-5 text-sm text-muted">
          <p className="font-medium text-ink">Постоянные правила разбора файла</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Пришёл — первая отметка за день на любой камере, ушёл — последняя.</li>
            <li>Отметки одного человека чаще, чем раз в 60 секунд, считаются одной.</li>
            <li>Если за день одна отметка, уход неизвестен: отработано 0, опоздание не начисляется.</li>
            <li>Отметки с 00:00 до 04:00 не учитываются.</li>
          </ul>
        </Panel>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-surface/95 backdrop-blur lg:left-[236px]">
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="text-sm">
            {errors.length ? (
              <span className="text-late">{errors[0]}</span>
            ) : dirty ? (
              <span className="text-muted">Есть несохранённые изменения</span>
            ) : (
              <span className="text-muted">Все изменения сохранены</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setS({
                  ...DEFAULT_SETTINGS,
                  holidays: s.holidays,
                  noScheduleDepartments: DEFAULT_SETTINGS.noScheduleDepartments,
                });
                setStart(minuteClock(DEFAULT_SETTINGS.shiftStartMinute));
                setEnd(minuteClock(DEFAULT_SETTINGS.shiftEndMinute));
              }}
            >
              Вернуть стандартные
            </Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty || errors.length > 0}>
              Сохранить настройки
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <Panel className="p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted">{hint}</p>
      {children}
    </Panel>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="08:00"
        maxLength={5}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d:]/g, ''))}
        aria-invalid={parseClock(value) === null}
        className="h-9 w-24 rounded-md border border-rule bg-surface px-3 aria-[invalid=true]:border-late"
      />
    </label>
  );
}
