import { useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import clsx from 'clsx';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { ImportResult } from '../core';
import { Button, Notice, PageHeader, Panel } from '../components/ui';
import { useErrorText, useI18n } from '../i18n';
import { useApi } from '../lib/auth';
import { useMonths } from '../lib/data';
import { readAttendanceFile } from '../lib/excel';
import { dateShort } from '../lib/format';

type State =
  | { step: 'idle' }
  | { step: 'reading'; file: File }
  | { step: 'preview'; file: File; result: ImportResult }
  | { step: 'saving'; file: File; result: ImportResult }
  | { step: 'error'; message: string };

export function UploadPage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const months = useMonths();
  const { t } = useI18n();
  const errText = useErrorText();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ step: 'idle' });
  const [drag, setDrag] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setState({ step: 'reading', file });
    try {
      const result = await readAttendanceFile(file);
      setState({ step: 'preview', file, result });
    } catch (e) {
      setState({ step: 'error', message: errText(e) });
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void pick(e.dataTransfer.files[0]);
  };

  const save = async () => {
    if (state.step !== 'preview') return;
    const { file, result } = state;
    setState({ step: 'saving', file, result });
    try {
      await api.importData(file.name, result);
      await qc.invalidateQueries();
      toast.success(t('up.done'), {
        description: t('up.doneHint', { from: dateShort(result.period.from), to: dateShort(result.period.to) }),
      });
      navigate(`/today?d=${result.period.to}`);
    } catch (e) {
      setState({ step: 'preview', file, result });
      toast.error(t('up.failed'), { description: `${errText(e)} ${t('up.failedHint')}` });
    }
  };

  const existing = new Set(months.data?.map((m) => m.month));

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader title={t('nav.upload')}>{t('up.subtitle')}</PageHeader>

      {(state.step === 'idle' || state.step === 'error' || state.step === 'reading') && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={clsx(
              'rounded-xl border-2 border-dashed bg-surface px-6 py-14 text-center transition-colors',
              drag ? 'border-stamp bg-stamp-soft' : 'border-rule',
            )}
          >
            <UploadCloud className="mx-auto size-10 text-stamp" aria-hidden />
            {state.step === 'reading' ? (
              <p className="mt-4 font-medium" role="status">
                {t('up.reading', { name: state.file.name })}
                <span className="mt-1 block text-sm font-normal text-muted">{t('up.readingHint')}</span>
              </p>
            ) : (
              <>
                <p className="mt-4 text-lg font-medium">{t('up.drop')}</p>
                <p className="mt-1 text-sm text-muted">{t('up.or')}</p>
                <Button variant="primary" className="mt-3" onClick={() => input.current?.click()}>
                  {t('up.choose')}
                </Button>
              </>
            )}
            <input
              ref={input}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => void pick(e.target.files?.[0])}
              aria-label={t('up.choose')}
            />
          </div>
          {state.step === 'error' && (
            <div className="mt-4">
              <Notice tone="error" title={t('up.rejected')}>
                {state.message}
              </Notice>
            </div>
          )}
          <div className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
            <div>
              <h2 className="font-semibold">{t('up.whichFile')}</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                <li>{t('up.req1')}</li>
                <li>{t('up.req2')}</li>
                <li>{t('up.req3')}</li>
                <li>{t('up.req4')}</li>
              </ul>
            </div>
            <div>
              <h2 className="font-semibold">{t('up.whatHappens')}</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                <li>{t('up.what1')}</li>
                <li>{t('up.what2')}</li>
                <li>{t('up.what3')}</li>
              </ul>
              <p className="mt-3 text-muted">
                <Link to="/settings" className="text-stamp underline underline-offset-2">
                  {t('nav.settings')}
                </Link>
              </p>
            </div>
          </div>
        </>
      )}

      {(state.step === 'preview' || state.step === 'saving') && (
        <Preview
          file={state.file}
          r={state.result}
          existing={existing}
          saving={state.step === 'saving'}
          onCancel={() => setState({ step: 'idle' })}
          onSave={save}
        />
      )}
    </div>
  );
}

function Preview({
  file,
  r,
  existing,
  saving,
  onCancel,
  onSave,
}: {
  file: File;
  r: ImportResult;
  existing: Set<string>;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t, f } = useI18n();
  const replaced = r.period.months.filter((m) => existing.has(m));
  const w = r.warnings;
  const facts: [string, string][] = [
    [t('up.period'), `${dateShort(r.period.from)} – ${dateShort(r.period.to)}`],
    [t('up.months'), r.period.months.map(f.monthTitle).join(', ')],
    [t('up.employees'), f.num(r.employees.length)],
    [t('up.days'), f.num(r.days.length)],
    [t('up.rows'), f.num(r.totalRows)],
    [t('up.dups'), f.num(r.duplicatesRemoved)],
  ];
  return (
    <Panel>
      <div className="flex items-center gap-3 border-b border-rule px-6 py-4">
        <FileSpreadsheet className="size-6 shrink-0 text-ok" aria-hidden />
        <div className="min-w-0">
          <p className="truncate font-medium">{file.name}</p>
          <p className="text-sm text-muted">{t('up.check')}</p>
        </div>
      </div>
      <dl className="grid gap-x-8 gap-y-3 px-6 py-5 sm:grid-cols-2">
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-rule/70 pb-2 sm:block sm:border-0 sm:pb-0">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-3 px-6 pb-5">
        {(w.sameIdDifferentNames.length > 0 || w.sameNameDifferentIds.length > 0) && (
          <Notice tone="warn" title={t('up.identityTitle')}>
            <p className="mb-2">{t('up.identityHint')}</p>
            <ul className="max-h-56 space-y-1 overflow-auto">
              {w.sameIdDifferentNames.map((x) => (
                <li key={`id-${x.employeeId}`}>
                  <span className="font-medium">{t('up.sameId', { id: x.employeeId })}</span> {x.names.join(' / ')}
                </li>
              ))}
              {w.sameNameDifferentIds.map((x) => (
                <li key={`n-${x.name}`}>
                  <span className="font-medium">{t('up.sameName', { name: x.name })}</span> ID{' '}
                  {x.employeeIds.join(', ')}
                </li>
              ))}
            </ul>
          </Notice>
        )}
        {replaced.length > 0 && (
          <Notice
            tone="warn"
            title={t('up.replaceTitle', { from: dateShort(r.period.from), to: dateShort(r.period.to) })}
          >
            {t('up.replaceHint', { months: replaced.map((m) => f.monthLower(m)).join(', ') })}
          </Notice>
        )}
        {r.issues.length > 0 ? (
          <Notice tone="warn" title={t('up.skipped', { n: r.issues.length })}>
            <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto">
              {r.issues.slice(0, 100).map((i) => (
                <li key={i.row}>
                  {t('up.row', { n: i.row })}: {i.message}
                </li>
              ))}
            </ul>
          </Notice>
        ) : (
          <Notice tone="ok" title={t('up.noErrors')}>
            {t('up.noErrorsHint')}
          </Notice>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-rule px-6 py-4">
        <Button onClick={onCancel} disabled={saving}>
          {t('up.another')}
        </Button>
        <Button variant="primary" onClick={onSave} loading={saving}>
          {saving ? t('up.saving') : t('up.save')}
        </Button>
      </div>
    </Panel>
  );
}
