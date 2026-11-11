import { useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import clsx from 'clsx';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { ImportResult } from '../core';
import { Button, Notice, PageHeader, Panel } from '../components/ui';
import { useApi } from '../lib/auth';
import { useMonths } from '../lib/data';
import { readAttendanceFile } from '../lib/excel';
import { dateShort, monthTitle, plural } from '../lib/format';

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
      setState({ step: 'error', message: (e as Error).message });
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
      const last = result.period.months[result.period.months.length - 1];
      toast.success('Файл загружен', {
        description: `Данные за ${dateShort(result.period.from)} – ${dateShort(result.period.to)} обновлены.`,
      });
      navigate(`/?m=${last}`);
    } catch (e) {
      setState({ step: 'preview', file, result });
      toast.error('Файл не загружен', { description: `${(e as Error).message} Данные в базе не изменились.` });
    }
  };

  const existing = new Set(months.data?.map((m) => m.month));

  return (
    <div className="mx-auto max-w-[860px]">
      <PageHeader title="Загрузка файла">
        Выгрузка из системы камер FaceID в формате .xlsx. Файл можно загружать за любой период — данные за эти даты
        заменятся.
      </PageHeader>

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
                Читаю «{state.file.name}»…
                <span className="mt-1 block text-sm font-normal text-muted">
                  Большой файл обрабатывается до 10–20 секунд.
                </span>
              </p>
            ) : (
              <>
                <p className="mt-4 text-lg font-medium">Перетащите файл сюда</p>
                <p className="mt-1 text-sm text-muted">или</p>
                <Button variant="primary" className="mt-3" onClick={() => input.current?.click()}>
                  Выбрать файл
                </Button>
              </>
            )}
            <input
              ref={input}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => void pick(e.target.files?.[0])}
              aria-label="Файл Excel"
            />
          </div>
          {state.step === 'error' && (
            <div className="mt-4">
              <Notice tone="error" title="Файл не принят">
                {state.message}
              </Notice>
            </div>
          )}
          <Requirements />
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
  const replaced = r.period.months.filter((m) => existing.has(m));
  const facts: [string, string][] = [
    ['Период', `${dateShort(r.period.from)} – ${dateShort(r.period.to)}`],
    ['Месяцы', r.period.months.map(monthTitle).join(', ')],
    ['Сотрудников', r.employees.length.toLocaleString('ru-RU')],
    ['Рабочих дней (сотрудник × день)', r.days.length.toLocaleString('ru-RU')],
    ['Строк в файле', r.totalRows.toLocaleString('ru-RU')],
    ['Повторных отметок объединено', r.duplicatesRemoved.toLocaleString('ru-RU')],
  ];
  return (
    <Panel>
      <div className="flex items-center gap-3 border-b border-rule px-6 py-4">
        <FileSpreadsheet className="size-6 shrink-0 text-ok" aria-hidden />
        <div className="min-w-0">
          <p className="truncate font-medium">{file.name}</p>
          <p className="text-sm text-muted">Проверьте данные перед загрузкой</p>
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
        {replaced.length > 0 && (
          <Notice
            tone="warn"
            title={`Данные за ${dateShort(r.period.from)} – ${dateShort(r.period.to)} будут заменены`}
          >
            В базе уже есть {replaced.map((m) => monthTitle(m).toLowerCase()).join(', ')}. Всё, что попадает в период
            этого файла, перезапишется. Даты за пределами периода не изменятся.
          </Notice>
        )}
        {r.issues.length > 0 ? (
          <Notice
            tone="warn"
            title={`${r.issues.length} ${plural(r.issues.length, 'строка пропущена', 'строки пропущены', 'строк пропущено')}`}
          >
            <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto">
              {r.issues.slice(0, 100).map((i) => (
                <li key={i.row}>
                  Строка {i.row}: {i.message}
                </li>
              ))}
              {r.issues.length > 100 && <li>…и ещё {r.issues.length - 100}</li>}
            </ul>
          </Notice>
        ) : (
          <Notice tone="ok" title="Ошибок в файле нет">
            Все строки распознаны.
          </Notice>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-rule px-6 py-4">
        <Button onClick={onCancel} disabled={saving}>
          Выбрать другой файл
        </Button>
        <Button variant="primary" onClick={onSave} loading={saving}>
          {saving ? 'Загружаю…' : 'Загрузить в базу'}
        </Button>
      </div>
    </Panel>
  );
}

function Requirements() {
  return (
    <div className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
      <div>
        <h2 className="font-semibold">Какой файл подходит</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Выгрузка событий из системы FaceID, формат .xlsx</li>
          <li>Колонки «Время», «Ид. польз.», «Имя», «Раздел», «Имя устройства посещения»</li>
          <li>Порядок колонок и строк не важен, лишние колонки игнорируются</li>
        </ul>
      </div>
      <div>
        <h2 className="font-semibold">Что произойдёт</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Файл читается прямо в браузере, на сервер уходят только итоги по дням</li>
          <li>Фотографии и пути к ним не сохраняются</li>
          <li>Если загрузка прервётся, данные в базе останутся прежними</li>
        </ul>
        <p className="mt-3 text-muted">
          Правила расчёта — в разделе{' '}
          <Link to="/settings" className="text-stamp underline underline-offset-2">
            Настройки графика
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
