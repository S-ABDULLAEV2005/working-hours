import { useEffect, useMemo, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { Check, Copy, Download, KeyRound, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../components/Absences';
import { Button, ConfirmDialog, EmptyState, Notice, PageHeader, Panel, SkeletonRows } from '../components/ui';
import { useErrorText, useI18n, type DictKey } from '../i18n';
import type { Credential, PlatformUser, Role } from '../lib/api';
import { useApi } from '../lib/auth';
import { useEmployees } from '../lib/data';
import { deptLabel } from '../lib/format';

const ROLE_KEY: Record<Role, DictKey> = {
  admin: 'role.admin',
  rohbar: 'role.rohbar',
  viewer: 'role.viewer',
  korgar: 'role.korgar',
};
const ROLE_HINT: Record<Role, DictKey> = {
  admin: 'role.adminHint',
  rohbar: 'role.rohbarHint',
  viewer: 'role.viewerHint',
  korgar: 'role.korgarHint',
};
const ORDER: Role[] = ['admin', 'rohbar', 'viewer', 'korgar'];
const BATCH = 25;

export function UsersPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { t, f } = useI18n();
  const errText = useErrorText();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.listUsers(), retry: false });
  const [creating, setCreating] = useState(false);
  const [bulk, setBulk] = useState<'create' | 'reset' | null>(null);
  const [credentials, setCredentials] = useState<{
    title: string;
    name: string;
    login: string;
    password: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'reset'; user: PlatformUser } | null>(null);
  const [busy, setBusy] = useState(false);
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [query, setQuery] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });

  const changeRole = async (u: PlatformUser, role: Role) => {
    try {
      await api.setUserRole(u.id, role);
      toast.success(`${u.fullName}: ${t(ROLE_KEY[role])}`);
      refresh();
    } catch (e) {
      toast.error(t('users.roleFailed'), { description: errText(e) });
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'delete') {
        await api.deleteUser(confirm.user.id);
        toast.success(t('users.deleted', { name: confirm.user.fullName }));
        refresh();
      } else {
        const password = await api.resetUserPassword(confirm.user.id);
        setCredentials({
          title: t('users.newPassword'),
          name: confirm.user.fullName,
          login: confirm.user.login,
          password,
        });
      }
      setConfirm(null);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const all = users.data ?? [];
  const counts = Object.fromEntries(ORDER.map((r) => [r, all.filter((u) => u.role === r).length])) as Record<
    Role,
    number
  >;
  const q = query.trim().toLowerCase();
  const list = all
    .filter((u) => roleFilter === 'all' || u.role === roleFilter)
    .filter((u) => !q || u.fullName.toLowerCase().includes(q) || u.login.toLowerCase().includes(q))
    .sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || a.fullName.localeCompare(b.fullName, 'ru'));

  return (
    <div className="mx-auto max-w-[1040px]">
      <PageHeader
        title={t('nav.users')}
        aside={
          <>
            <Button onClick={() => setBulk('reset')}>
              <KeyRound className="size-4" aria-hidden /> {t('users.bulkReset')}
            </Button>
            <Button onClick={() => setBulk('create')}>
              <Users className="size-4" aria-hidden /> {t('users.bulk')}
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <UserPlus className="size-4" aria-hidden /> {t('users.add')}
            </Button>
          </>
        }
      >
        {t('users.subtitle')}
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-md border border-rule bg-surface p-0.5" role="group">
          {(['all', ...ORDER] as const).map((r) => (
            <button
              key={r}
              aria-pressed={roleFilter === r}
              onClick={() => setRoleFilter(r)}
              className={clsx(
                'h-8 rounded px-3 text-sm whitespace-nowrap',
                roleFilter === r ? 'bg-stamp-soft font-medium text-stamp-deep' : 'text-muted hover:text-ink',
              )}
            >
              {r === 'all' ? t('users.all') : t(ROLE_KEY[r])}{' '}
              <span className="text-faint">{r === 'all' ? all.length : counts[r]}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto min-w-[200px]">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('users.search')}
            aria-label={t('users.search')}
            className="h-9 w-full rounded-md border border-rule bg-surface pr-3 pl-9 text-sm"
          />
        </div>
      </div>

      <Panel className="overflow-hidden">
        {users.isLoading ? (
          <SkeletonRows rows={4} />
        ) : users.error ? (
          <div className="p-5">
            <Notice
              tone="error"
              title={t('users.loadFailed')}
              action={<Button onClick={() => users.refetch()}>{t('common.retry')}</Button>}
            >
              {errText(users.error)}
            </Notice>
          </div>
        ) : list.length === 0 ? (
          <EmptyState title={t('users.none')} />
        ) : (
          <ul className="divide-y divide-rule">
            {list.map((u) => (
              <li key={u.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_210px_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {u.fullName || u.login}
                    {u.isMe && <span className="ml-2 text-sm font-normal text-muted">{t('users.you')}</span>}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {t('users.login')}: <span className="text-ink">{u.login}</span>
                  </p>
                  <p className="text-xs text-faint">
                    {u.lastSignInAt
                      ? t('users.lastLogin', { date: f.dateTime(u.lastSignInAt) })
                      : t('users.neverLogged')}
                  </p>
                </div>
                {u.role === 'korgar' ? (
                  <span className="text-sm text-muted">{t('role.korgar')}</span>
                ) : (
                  <select
                    value={u.role}
                    disabled={u.isMe}
                    onChange={(e) => changeRole(u, e.target.value as Role)}
                    aria-label={`${t('users.role')}: ${u.fullName}`}
                    title={u.isMe ? t('users.selfRole') : undefined}
                    className="h-9 rounded-md border border-rule bg-surface px-3 text-sm disabled:bg-paper disabled:text-muted"
                  >
                    {(['admin', 'rohbar', 'viewer'] as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {t(ROLE_KEY[r])}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex gap-1 sm:justify-end">
                  {!u.isMe && (
                    <>
                      <Button variant="ghost" onClick={() => setConfirm({ kind: 'reset', user: u })}>
                        <KeyRound className="size-4" aria-hidden /> {t('users.newPassword')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setConfirm({ kind: 'delete', user: u })}
                        aria-label={`${t('users.delete')} ${u.fullName}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {users.data && counts.admin < 2 && <p className="mt-3 text-sm text-muted">{t('users.adviceTwoAdmins')}</p>}

      <CreateUserDialog
        open={creating}
        users={all}
        onClose={() => setCreating(false)}
        onCreated={(c) => {
          setCreating(false);
          setCredentials({ title: t('users.created'), ...c });
          refresh();
        }}
      />
      <BulkDialog mode={bulk ?? 'create'} open={!!bulk} users={all} onClose={() => setBulk(null)} onDone={refresh} />
      <CredentialsDialog data={credentials} onClose={() => setCredentials(null)} />

      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.kind === 'delete'
            ? t('users.deleteTitle', { name: confirm.user.fullName })
            : t('users.resetTitle', { name: confirm?.user.fullName ?? '' })
        }
        confirmLabel={confirm?.kind === 'delete' ? t('users.deleteConfirm') : t('users.resetConfirm')}
        danger={confirm?.kind === 'delete'}
        loading={busy}
        onConfirm={runConfirm}
        onClose={() => !busy && setConfirm(null)}
      >
        {confirm?.kind === 'delete' ? t('users.deleteHint') : t('users.resetHint')}
      </ConfirmDialog>
    </div>
  );
}

function CreateUserDialog({
  open,
  users,
  onClose,
  onCreated,
}: {
  open: boolean;
  users: PlatformUser[];
  onClose: () => void;
  onCreated: (c: { name: string; login: string; password: string }) => void;
}) {
  const api = useApi();
  const { t } = useI18n();
  const errText = useErrorText();
  const emps = useEmployees();
  const [role, setRole] = useState<Role>('viewer');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [empQuery, setEmpQuery] = useState('');
  const [empId, setEmpId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRole('viewer');
      setFullName('');
      setEmail('');
      setEmpQuery('');
      setEmpId('');
      setError(null);
    }
  }, [open]);

  const linked = useMemo(() => new Set(users.map((u) => u.employeeId).filter(Boolean)), [users]);
  const candidates = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    return [...(emps.data?.values() ?? [])]
      .filter((e) => !linked.has(e.employeeId) && !e.excluded)
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.employeeId === q)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .slice(0, 50);
  }, [emps.data, empQuery, linked]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (role === 'korgar') {
      if (!empId) return setError(t('users.errPickEmployee'));
    } else {
      if (!fullName.trim()) return setError(t('err.nameRequired'));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(t('err.emailFormat'));
    }
    setSaving(true);
    try {
      const r = await api.createUser(role === 'korgar' ? { role, employeeId: empId } : { role, email, fullName });
      const name = role === 'korgar' ? (emps.data?.get(empId)?.name ?? empId) : fullName.trim();
      onCreated({ name, login: r.login, password: r.password });
    } catch (err) {
      setError(errText(err));
    } finally {
      setSaving(false);
    }
  };

  const field = 'mt-1.5 h-10 w-full rounded-md border border-rule px-3';
  return (
    <Modal open={open} onClose={onClose} title={t('users.add')} locked={saving}>
      <form onSubmit={submit} noValidate>
        <fieldset>
          <legend className="text-sm font-medium">{t('users.role')}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ORDER.map((r) => (
              <label
                key={r}
                className={clsx(
                  'flex cursor-pointer gap-3 rounded-lg border p-3',
                  role === r ? 'border-stamp bg-stamp-soft' : 'border-rule hover:bg-hover',
                )}
              >
                <input
                  type="radio"
                  name="role"
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="mt-1 accent-[var(--color-stamp)]"
                />
                <span>
                  <span className="block text-sm font-medium">{t(ROLE_KEY[r])}</span>
                  <span className="block text-xs text-muted">{t(ROLE_HINT[r])}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {role === 'korgar' ? (
          <div className="mt-4">
            <label className="block text-sm font-medium" htmlFor="nu-emp">
              {t('users.employee')}
            </label>
            <input
              id="nu-emp"
              value={empQuery}
              onChange={(e) => setEmpQuery(e.target.value)}
              placeholder={t('tabel.search')}
              className={field}
              autoComplete="off"
            />
            <ul className="mt-2 max-h-48 overflow-auto rounded-md border border-rule">
              {candidates.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted">{t('users.noCandidates')}</li>
              ) : (
                candidates.map((e) => (
                  <li key={e.employeeId}>
                    <button
                      type="button"
                      onClick={() => setEmpId(e.employeeId)}
                      className={clsx(
                        'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm',
                        empId === e.employeeId ? 'bg-stamp-soft' : 'hover:bg-hover',
                      )}
                    >
                      <span className="min-w-0 truncate">
                        {e.name} <span className="text-muted">· {deptLabel(e.department) || t('common.noDept')}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">ID {e.employeeId}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <p className="mt-2 text-xs text-muted">{t('users.korgarLoginHint')}</p>
          </div>
        ) : (
          <>
            <label className="mt-4 block text-sm font-medium" htmlFor="nu-name">
              {t('users.fullName')}
            </label>
            <input
              id="nu-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={field}
              autoComplete="off"
            />
            <label className="mt-4 block text-sm font-medium" htmlFor="nu-email">
              {t('users.emailLogin')}
            </label>
            <input
              id="nu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
              autoComplete="off"
            />
          </>
        )}
        <p className="mt-4 text-sm text-muted">{t('users.passwordAuto')}</p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-late">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {t('users.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Аккаунты сразу для многих сотрудников + Excel с логинами и паролями. */
function BulkDialog({
  mode,
  open,
  users,
  onClose,
  onDone,
}: {
  mode: 'create' | 'reset';
  open: boolean;
  users: PlatformUser[];
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useApi();
  const { t } = useI18n();
  const errText = useErrorText();
  const emps = useEmployees();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    created: Credential[];
    failed: { employeeId: string; error: string }[];
  } | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const linked = useMemo(() => new Set(users.map((u) => u.employeeId).filter(Boolean)), [users]);
  /** id — то, что уходит на сервер: ID сотрудника (создание) или ID аккаунта (новые пароли). */
  const candidates = useMemo<{ id: string; name: string; employeeId: string; neverLogged: boolean }[]>(
    () =>
      mode === 'create'
        ? [...(emps.data?.values() ?? [])]
            .filter((e) => !linked.has(e.employeeId) && !e.excluded)
            .map((e) => ({ id: e.employeeId, name: e.name, employeeId: e.employeeId, neverLogged: true }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        : users
            .filter((u) => u.role === 'korgar' && u.employeeId)
            .map((u) => ({ id: u.id, name: u.fullName, employeeId: u.employeeId!, neverLogged: !u.lastSignInAt }))
            .sort((a, b) => Number(b.neverLogged) - Number(a.neverLogged) || a.name.localeCompare(b.name, 'ru')),
    [mode, emps.data, linked, users],
  );

  useEffect(() => {
    if (open) {
      // Новые пароли: по умолчанию выбраны те, кто ещё ни разу не входил (их пароли могли потеряться).
      setSelected(new Set(candidates.filter((c) => c.neverLogged).map((c) => c.id)));
      setResult(null);
      setDownloaded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  /** Партиями по 25 — чтобы не упереться в лимит времени серверной функции и не потерять пароли. */
  const run = async () => {
    const ids = [...selected];
    const created: Credential[] = [];
    const failed: { employeeId: string; error: string }[] = [];
    setBusy(true);
    setProgress({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      try {
        const r = mode === 'create' ? await api.createKorgarBulk(chunk) : await api.resetPasswordsBulk(chunk);
        created.push(...r.created);
        failed.push(...r.failed);
      } catch (e) {
        // Партия не прошла целиком (сеть, таймаут) — отмечаем и идём дальше; уже созданные пароли не теряются.
        failed.push(...chunk.map((employeeId) => ({ employeeId, error: errText(e) })));
      }
      setProgress({ done: Math.min(i + BATCH, ids.length), total: ids.length });
    }
    setResult({ created, failed });
    setBusy(false);
    setProgress(null);
    onDone();
  };

  const download = async () => {
    if (!result) return;
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(t('bulk.sheet'));
    ws.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: t('users.fullName'), key: 'name', width: 34 },
      { header: t('users.login'), key: 'login', width: 12 },
      { header: t('login.password'), key: 'password', width: 16 },
      { header: t('bulk.signature'), key: 'sign', width: 18 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const c of [...result.created].sort((a, b) => a.name.localeCompare(b.name, 'ru'))) {
      ws.addRow({
        id: Number(c.employeeId) || c.employeeId,
        name: c.name,
        login: c.login,
        password: c.password,
        sign: '',
      });
    }
    ws.addRow({});
    ws.addRow({ name: `${t('bulk.site')}: ${location.href.split('#')[0]}` });
    ws.addRow({ name: t('bulk.changeHint') });
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(
      new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t('bulk.fileName')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setDownloaded(true);
  };

  const toggleAll = () =>
    setSelected(selected.size === candidates.length ? new Set() : new Set(candidates.map((c) => c.id)));

  return (
    <Modal
      open={open}
      onClose={() => (!busy && (!result || downloaded) ? onClose() : undefined)}
      title={mode === 'create' ? t('users.bulk') : t('users.bulkReset')}
      locked={busy || (!!result && !downloaded)}
      wide
    >
      {!result ? (
        <>
          <p className="text-sm text-muted">{mode === 'create' ? t('bulk.explain') : t('bulk.resetExplain')}</p>
          {candidates.length === 0 ? (
            <EmptyState title={mode === 'create' ? t('bulk.nobody') : t('bulk.noKorgar')} />
          ) : (
            <>
              <label className="mt-4 flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={selected.size === candidates.length}
                  onChange={toggleAll}
                  className="size-4 accent-[var(--color-stamp)]"
                />
                {t('bulk.selectAll', { n: selected.size, total: candidates.length })}
              </label>
              <ul className="mt-2 max-h-72 divide-y divide-rule overflow-auto rounded-md border border-rule">
                {candidates.map((e) => (
                  <li key={e.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-hover">
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        onChange={() => {
                          const n = new Set(selected);
                          if (n.has(e.id)) n.delete(e.id);
                          else n.add(e.id);
                          setSelected(n);
                        }}
                        className="size-4 accent-[var(--color-stamp)]"
                      />
                      <span className="min-w-0 flex-1 truncate">{e.name}</span>
                      {mode === 'reset' && !e.neverLogged && (
                        <span className="text-xs text-single">{t('bulk.loggedIn')}</span>
                      )}
                      <span className="text-xs text-muted">ID {e.employeeId}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={run} loading={busy} disabled={selected.size === 0}>
              {busy
                ? t('bulk.progress', { done: progress?.done ?? 0, total: progress?.total ?? selected.size })
                : mode === 'create'
                  ? t('bulk.create', { n: selected.size })
                  : t('bulk.reset', { n: selected.size })}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Notice
            tone={result.failed.length ? 'warn' : 'ok'}
            title={t(mode === 'create' ? 'bulk.result' : 'bulk.resetResult', {
              ok: result.created.length,
              fail: result.failed.length,
            })}
          >
            {t('bulk.downloadNow')}
          </Notice>
          {result.failed.length > 0 && (
            <ul className="mt-3 max-h-40 overflow-auto text-sm text-muted">
              {result.failed.map((x) => (
                <li key={x.employeeId}>
                  ID {x.employeeId}: {x.error}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 rounded-lg bg-late-soft px-3 py-2 text-sm text-late">{t('bulk.sensitive')}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant={downloaded ? 'secondary' : 'primary'} onClick={download} disabled={!result.created.length}>
              <Download className="size-4" aria-hidden /> {t('bulk.download')}
            </Button>
            <Button
              variant={downloaded ? 'primary' : 'secondary'}
              onClick={onClose}
              disabled={!downloaded && result.created.length > 0}
            >
              {t('common.done')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function CredentialsDialog({
  data,
  onClose,
}: {
  data: { title: string; name: string; login: string; password: string } | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [data]);
  const site = location.href.split('#')[0];
  const copy = async () => {
    if (!data) return;
    const text = `${t('app.name')}\n${t('bulk.site')}: ${site}\n${t('users.login')}: ${data.login}\n${t('login.password')}: ${data.password}\n${t('bulk.changeHint')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.error(t('cred.copyFailed'));
    }
  };
  return (
    <Modal open={!!data} onClose={onClose} title={data?.title ?? ''}>
      {data && (
        <>
          <p className="text-sm text-muted">{t('cred.hint', { name: data.name })}</p>
          <dl className="mt-4 space-y-2 rounded-lg border border-rule bg-paper p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t('users.login')}</dt>
              <dd className="font-medium break-all">{data.login}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{t('login.password')}</dt>
              <dd className="text-lg font-semibold tracking-wider select-all">{data.password}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button onClick={copy}>
              {copied ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? t('cred.copied') : t('cred.copy')}
            </Button>
            <Button variant="primary" onClick={onClose}>
              {t('common.done')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
