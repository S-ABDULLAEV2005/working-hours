import { useEffect, useMemo, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { DEFAULT_SETTINGS, isoWeekday, type Holiday, type Settings } from '../core';
import { Button, ConfirmDialog, EmptyState, Notice, PageHeader, Panel, Spinner } from '../components/ui';
import { useErrorText, useI18n } from '../i18n';
import { useApi } from '../lib/auth';
import { qk, useEmployees, useHolidays, useSettings } from '../lib/data';
import { dateShort, deptLabel, minuteClock, parseClock } from '../lib/format';

export function SettingsPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { t, f } = useI18n();
  const errText = useErrorText();
  const saved = useSettings();
  const emps = useEmployees();
  const [s, setS] = useState<Settings | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [lunchFrom, setLunchFrom] = useState('12:00');
  const [lunchTo, setLunchTo] = useState('13:00');
  const [pct, setPct] = useState('25');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (saved.raw && !s) {
      setS(saved.raw);
      setStart(minuteClock(saved.raw.shiftStartMinute));
      setEnd(minuteClock(saved.raw.shiftEndMinute));
      setPct(String(saved.raw.lowAttendancePercent));
      if (saved.raw.lunch) {
        setLunchFrom(minuteClock(saved.raw.lunch.startMinute));
        setLunchTo(minuteClock(saved.raw.lunch.endMinute));
      }
    }
  }, [saved.raw, s]);

  const departments = useMemo(() => {
    const set = new Set<string>([...(emps.data?.values() ?? [])].map((e) => e.department));
    s?.noScheduleDepartments.forEach((d) => set.add(d));
    return [...set].sort((a, b) => deptLabel(a).localeCompare(deptLabel(b), 'ru'));
  }, [emps.data, s]);

  if (!s) {
    return saved.error ? (
      <Notice tone="error" title={t('common.loadError')}>
        {errText(saved.error)}
      </Notice>
    ) : (
      <Spinner label={t('common.loading')} />
    );
  }

  const startMin = parseClock(start);
  const endMin = parseClock(end);
  const lf = parseClock(lunchFrom);
  const lt = parseClock(lunchTo);
  const pctNum = Number(pct);
  const errors: string[] = [];
  if (startMin === null) errors.push(t('set.errStart'));
  if (endMin === null) errors.push(t('set.errEnd'));
  if (startMin !== null && endMin !== null && endMin <= startMin) errors.push(t('set.errOrder'));
  if (s.lunch && (lf === null || lt === null || lt <= lf)) errors.push(t('set.errLunch'));
  if (s.workdays.length === 0) errors.push(t('set.errWorkdays'));
  if (!/^\d{1,3}$/.test(pct) || pctNum > 100) errors.push(t('set.errPct'));

  const next: Settings = {
    ...s,
    shiftStartMinute: startMin ?? s.shiftStartMinute,
    shiftEndMinute: endMin ?? s.shiftEndMinute,
    lunch: s.lunch ? { startMinute: lf ?? 0, endMinute: lt ?? 0 } : null,
    lowAttendancePercent: Number.isFinite(pctNum) ? pctNum : s.lowAttendancePercent,
  };
  const dirty =
    JSON.stringify({ ...next, holidays: 0, shortDays: 0 }) !==
    JSON.stringify({ ...saved.raw, holidays: 0, shortDays: 0 });

  const save = async () => {
    if (errors.length) return;
    setSaving(true);
    try {
      await api.saveSettings(next);
      qc.setQueryData(qk.settings, next);
      setS(next);
      toast.success(t('set.saved'), { description: t('set.savedHint') });
    } catch (e) {
      toast.error(t('set.notSaved'), { description: errText(e) });
    } finally {
      setSaving(false);
    }
  };

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="mx-auto max-w-[900px] pb-24">
      <PageHeader title={t('nav.settings')}>{t('set.subtitle')}</PageHeader>

      <div className="space-y-5">
        <Section title={t('set.workday')} hint={t('set.workdayHint')}>
          <div className="flex flex-wrap gap-4">
            <TimeField label={t('set.start')} value={start} onChange={setStart} />
            <TimeField label={t('set.end')} value={end} onChange={setEnd} />
          </div>
        </Section>

        <Section title={t('set.weekdays')} hint={t('set.weekdaysHint')}>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const on = s.workdays.includes(d);
              return (
                <button
                  key={d}
                  aria-pressed={on}
                  onClick={() => setS({ ...s, workdays: toggle(s.workdays, d).sort() })}
                  className={clsx(
                    'h-9 min-w-12 rounded-md border px-2 text-sm font-medium',
                    on ? 'border-stamp bg-stamp text-white' : 'border-rule bg-surface text-muted hover:bg-hover',
                  )}
                >
                  {f.weekday(d)}
                </button>
              );
            })}
          </div>
        </Section>

        <HolidaysSection />

        <Section title={t('set.lunch')} hint={t('set.lunchHint')}>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!s.lunch}
              onChange={(e) =>
                setS({ ...s, lunch: e.target.checked ? { startMinute: lf ?? 720, endMinute: lt ?? 780 } : null })
              }
              className="size-4 accent-[var(--color-stamp)]"
            />
            {t('set.lunchToggle')}
          </label>
          {s.lunch && (
            <div className="mt-3 flex flex-wrap gap-4">
              <TimeField label={t('set.from')} value={lunchFrom} onChange={setLunchFrom} />
              <TimeField label={t('set.to')} value={lunchTo} onChange={setLunchTo} />
            </div>
          )}
        </Section>

        <Section title={t('set.low')} hint={t('set.lowHint')}>
          <label className="flex items-center gap-2 text-sm">
            <input
              value={pct}
              onChange={(e) => setPct(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              aria-invalid={errors.includes(t('set.errPct'))}
              className="h-9 w-20 rounded-md border border-rule bg-surface px-3 aria-[invalid=true]:border-late"
            />
            % {t('set.lowSuffix')}
          </label>
          <p className="mt-2 text-xs text-muted">
            {t('set.lowExample', { n: Math.ceil((22 * (Number(pct) || 0)) / 100) })}
          </p>
        </Section>

        <Section title={t('set.noSchedule')} hint={t('set.noScheduleHint')}>
          {departments.length === 0 ? (
            <p className="text-sm text-muted">{t('set.noDepts')}</p>
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
                  {deptLabel(d) || t('common.noDept')}
                </label>
              ))}
            </div>
          )}
        </Section>

        <Panel className="p-5 text-sm text-muted">
          <p className="font-medium text-ink">{t('set.fixedRules')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t('set.rule1')}</li>
            <li>{t('set.rule2')}</li>
            <li>{t('set.rule3')}</li>
            <li>{t('set.rule4')}</li>
            <li>{t('set.rule5')}</li>
          </ul>
        </Panel>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-surface/95 backdrop-blur lg:left-[236px]">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="text-sm">
            {errors.length ? (
              <span className="text-late">{errors[0]}</span>
            ) : dirty ? (
              <span className="text-muted">{t('set.unsaved')}</span>
            ) : (
              <span className="text-muted">{t('set.allSaved')}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setS({ ...DEFAULT_SETTINGS, holidays: s.holidays, shortDays: s.shortDays });
                setStart(minuteClock(DEFAULT_SETTINGS.shiftStartMinute));
                setEnd(minuteClock(DEFAULT_SETTINGS.shiftEndMinute));
                setPct(String(DEFAULT_SETTINGS.lowAttendancePercent));
              }}
            >
              {t('set.defaults')}
            </Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty || errors.length > 0}>
              {t('set.save')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const emptyHoliday = (): Holiday => ({ date: '', kind: 'holiday', endMinute: 960, name: '', comment: '' });

function HolidaysSection() {
  const api = useApi();
  const qc = useQueryClient();
  const { t, f } = useI18n();
  const errText = useErrorText();
  const list = useHolidays();
  const [form, setForm] = useState<Holiday>(emptyHoliday);
  const [endText, setEndText] = useState('16:00');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Holiday | null>(null);
  const [year] = useState(() => new Date().getFullYear());
  const [showPast, setShowPast] = useState(false);

  const all = list.data ?? [];
  const shown = showPast ? all : all.filter((h) => Number(h.date.slice(0, 4)) >= year - 0 || h.date >= `${year}-01-01`);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return setError(t('hol.errDate'));
    if (form.name.trim().length < 2) return setError(t('hol.errName'));
    const endMinute = form.kind === 'short' ? parseClock(endText) : null;
    if (form.kind === 'short' && endMinute === null) return setError(t('hol.errEnd'));
    if (!editing && all.some((h) => h.date === form.date)) return setError(t('hol.errExists'));
    setBusy(true);
    try {
      if (editing && editing !== form.date) await api.deleteHoliday(editing);
      await api.saveHoliday({ ...form, endMinute });
      await qc.invalidateQueries({ queryKey: qk.holidays });
      toast.success(editing ? t('hol.updated') : t('hol.added'));
      setForm(emptyHoliday());
      setEditing(null);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.deleteHoliday(toDelete.date);
      await qc.invalidateQueries({ queryKey: qk.holidays });
      toast.success(t('hol.deleted'));
      setToDelete(null);
    } catch (err) {
      toast.error(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const field = 'mt-1.5 h-10 w-full rounded-md border border-rule bg-surface px-3';
  return (
    <Panel className="overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="font-semibold">{t('hol.title')}</h2>
        <p className="mt-0.5 text-sm text-muted">{t('hol.hint')}</p>
      </div>

      {list.isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : shown.length === 0 ? (
        <EmptyState title={t('hol.none')} />
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {shown.map((h) => (
            <li key={h.date} className="grid grid-cols-[120px_1fr_auto] items-start gap-4 px-5 py-3">
              <div>
                <p className="font-medium">{dateShort(h.date)}</p>
                <p className="text-xs text-muted">{f.weekday(isoWeekday(h.date))}</p>
              </div>
              <div className="min-w-0">
                <p className="font-medium">
                  {h.name}
                  <span
                    className={clsx(
                      'ml-2 inline-flex rounded-full px-2 py-0.5 align-middle text-xs font-medium',
                      h.kind === 'holiday' ? 'bg-stamp-soft text-stamp-deep' : 'bg-single-soft text-[#8a5d00]',
                    )}
                  >
                    {h.kind === 'holiday'
                      ? t('hol.kind.holiday')
                      : t('hol.shortUntil', { time: minuteClock(h.endMinute ?? 0) })}
                  </span>
                </p>
                {h.comment && <p className="mt-0.5 text-sm break-words text-muted">{h.comment}</p>}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  aria-label={t('hol.edit')}
                  onClick={() => {
                    setEditing(h.date);
                    setForm(h);
                    setEndText(minuteClock(h.endMinute ?? 960));
                    setError(null);
                  }}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button variant="ghost" aria-label={t('hol.delete')} onClick={() => setToDelete(h)}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {all.length !== shown.length && (
        <button onClick={() => setShowPast(true)} className="px-5 pt-3 text-sm text-stamp hover:underline">
          {t('hol.showPast', { n: all.length - shown.length })}
        </button>
      )}

      <form onSubmit={submit} className="grid gap-3 p-5 sm:grid-cols-[170px_230px_1fr]" noValidate>
        <p className="font-medium sm:col-span-3">{editing ? t('hol.editTitle') : t('hol.addTitle')}</p>
        <label className="text-sm font-medium">
          {t('hol.date')}
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className={field}
          />
        </label>
        <label className="text-sm font-medium">
          {t('hol.kind')}
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as Holiday['kind'] })}
            className={field}
          >
            <option value="holiday">{t('hol.kind.holiday')}</option>
            <option value="short">{t('hol.kind.short')}</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          {t('hol.name')}
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('hol.namePlaceholder')}
            maxLength={120}
            className={field}
          />
        </label>
        {form.kind === 'short' && (
          <label className="text-sm font-medium">
            {t('hol.endTime')}
            <input
              value={endText}
              onChange={(e) => setEndText(e.target.value.replace(/[^\d:]/g, ''))}
              inputMode="numeric"
              maxLength={5}
              className={field}
            />
          </label>
        )}
        <label className={clsx('text-sm font-medium', form.kind === 'short' ? 'sm:col-span-2' : 'sm:col-span-3')}>
          {t('hol.comment')}
          <input
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
            placeholder={t('hol.commentPlaceholder')}
            maxLength={300}
            className={field}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-late sm:col-span-3">
            {error}
          </p>
        )}
        <div className="flex gap-2 sm:col-span-3">
          <Button type="submit" variant="primary" loading={busy}>
            {!busy && <Plus className="size-4" aria-hidden />}
            {editing ? t('hol.saveChanges') : t('hol.add')}
          </Button>
          {editing && (
            <Button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(emptyHoliday());
                setError(null);
              }}
            >
              {t('common.cancel')}
            </Button>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={!!toDelete}
        title={t('hol.deleteTitle', { name: toDelete?.name ?? '' })}
        confirmLabel={t('hol.delete')}
        cancelLabel={t('common.cancel')}
        danger
        loading={busy}
        onConfirm={remove}
        onClose={() => !busy && setToDelete(null)}
      >
        {t('hol.deleteHint')}
      </ConfirmDialog>
    </Panel>
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
