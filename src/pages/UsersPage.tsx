import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check, Copy, KeyRound, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ConfirmDialog, EmptyState, Notice, PageHeader, Panel, SkeletonRows } from '../components/ui';
import type { PlatformUser, Role } from '../lib/api';
import { useApi } from '../lib/auth';
import { dateTime } from '../lib/format';

const ROLE_LABEL: Record<Role, string> = { admin: 'Администратор', viewer: 'Только просмотр' };

export function UsersPage() {
  const api = useApi();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.listUsers(), retry: false });
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<{
    title: string;
    name: string;
    email: string;
    password: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'reset'; user: PlatformUser } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });

  const changeRole = async (u: PlatformUser, role: Role) => {
    try {
      await api.setUserRole(u.id, role);
      toast.success(`${u.fullName}: ${ROLE_LABEL[role].toLowerCase()}`);
      refresh();
    } catch (e) {
      toast.error('Роль не изменена', { description: (e as Error).message });
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'delete') {
        await api.deleteUser(confirm.user.id);
        toast.success(`Доступ для ${confirm.user.fullName} удалён`);
        refresh();
      } else {
        const password = await api.resetUserPassword(confirm.user.id);
        setCredentials({ title: 'Новый пароль', name: confirm.user.fullName, email: confirm.user.email, password });
      }
      setConfirm(null);
    } catch (e) {
      toast.error(confirm.kind === 'delete' ? 'Не удалось удалить' : 'Пароль не сброшен', {
        description: (e as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  const list = [...(users.data ?? [])].sort((a, b) =>
    a.role === b.role ? a.fullName.localeCompare(b.fullName, 'ru') : a.role === 'admin' ? -1 : 1,
  );
  const admins = list.filter((u) => u.role === 'admin').length;

  return (
    <div className="mx-auto max-w-[1000px]">
      <PageHeader
        title="Пользователи"
        aside={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <UserPlus className="size-4" aria-hidden /> Добавить пользователя
          </Button>
        }
      >
        Кто может входить на платформу. Администратор загружает файлы и управляет доступом, остальные только смотрят
        табель.
      </PageHeader>

      <Panel className="overflow-hidden">
        {users.isLoading ? (
          <SkeletonRows rows={4} />
        ) : users.error ? (
          <div className="p-5">
            <Notice
              tone="error"
              title="Не удалось загрузить список"
              action={<Button onClick={() => users.refetch()}>Повторить</Button>}
            >
              {(users.error as Error).message}
            </Notice>
          </div>
        ) : list.length === 0 ? (
          <EmptyState title="Пользователей нет" />
        ) : (
          <ul className="divide-y divide-rule">
            {list.map((u) => (
              <li key={u.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_200px_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {u.fullName || u.email}
                    {u.isMe && <span className="ml-2 text-sm font-normal text-muted">это вы</span>}
                  </p>
                  <p className="truncate text-sm text-muted">{u.email}</p>
                  <p className="text-xs text-faint">
                    {u.lastSignInAt ? `Последний вход ${dateTime(u.lastSignInAt)}` : 'Ещё не входил'}
                  </p>
                </div>
                <select
                  value={u.role}
                  disabled={u.isMe}
                  onChange={(e) => changeRole(u, e.target.value as Role)}
                  aria-label={`Роль: ${u.fullName}`}
                  title={u.isMe ? 'Свою роль изменить нельзя — иначе можно остаться без администратора' : undefined}
                  className="h-9 rounded-md border border-rule bg-surface px-3 text-sm disabled:bg-paper disabled:text-muted"
                >
                  <option value="viewer">{ROLE_LABEL.viewer}</option>
                  <option value="admin">{ROLE_LABEL.admin}</option>
                </select>
                <div className="flex gap-1 sm:justify-end">
                  {!u.isMe && (
                    <>
                      <Button variant="ghost" onClick={() => setConfirm({ kind: 'reset', user: u })}>
                        <KeyRound className="size-4" aria-hidden /> Новый пароль
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setConfirm({ kind: 'delete', user: u })}
                        aria-label={`Удалить ${u.fullName}`}
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

      {users.data && (
        <p className="mt-3 text-sm text-muted">
          Администраторов: {admins}.{' '}
          {admins < 2 && 'Совет: назначьте второго администратора на случай отпуска или болезни.'}
        </p>
      )}

      <CreateUserDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(c) => {
          setCreating(false);
          setCredentials({ title: 'Пользователь создан', ...c });
          refresh();
        }}
      />

      <CredentialsDialog data={credentials} onClose={() => setCredentials(null)} />

      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.kind === 'delete'
            ? `Удалить доступ для ${confirm.user.fullName}?`
            : `Выдать новый пароль для ${confirm?.user.fullName}?`
        }
        confirmLabel={confirm?.kind === 'delete' ? 'Удалить доступ' : 'Выдать новый пароль'}
        danger={confirm?.kind === 'delete'}
        loading={busy}
        onConfirm={runConfirm}
        onClose={() => !busy && setConfirm(null)}
      >
        {confirm?.kind === 'delete'
          ? 'Человек больше не сможет войти на платформу. Данные табеля не удаляются. Вернуть доступ можно, создав пользователя заново.'
          : 'Старый пароль перестанет работать сразу. Новый пароль покажем один раз — передайте его человеку лично.'}
      </ConfirmDialog>
    </div>
  );
}

function Modal({
  open,
  onClose,
  title,
  children,
  locked,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  locked?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => locked && e.preventDefault()}
      className="m-auto w-[min(460px,calc(100vw-2rem))] rounded-xl border border-rule bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/30"
    >
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          {!locked && (
            <button onClick={onClose} className="rounded p-1 text-muted hover:bg-hover" aria-label="Закрыть">
              <X className="size-4" />
            </button>
          )}
        </div>
        {children}
      </div>
    </dialog>
  );
}

function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: { name: string; email: string; password: string }) => void;
}) {
  const api = useApi();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFullName('');
      setEmail('');
      setRole('viewer');
      setError(null);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) return setError('Укажите фамилию и имя.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return setError('Укажите корректный email — он будет логином.');
    setSaving(true);
    try {
      const r = await api.createUser({ email, fullName, role });
      onCreated({ name: fullName.trim(), email: r.email, password: r.password });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = 'mt-1.5 h-10 w-full rounded-md border border-rule px-3';
  return (
    <Modal open={open} onClose={onClose} title="Новый пользователь" locked={saving}>
      <form onSubmit={submit} noValidate>
        <label className="block text-sm font-medium" htmlFor="nu-name">
          Фамилия и имя
        </label>
        <input
          id="nu-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={field}
          autoComplete="off"
        />
        <label className="mt-4 block text-sm font-medium" htmlFor="nu-email">
          Email — будет логином
        </label>
        <input
          id="nu-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
          autoComplete="off"
        />
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Роль</legend>
          <div className="mt-2 grid gap-2">
            {(['viewer', 'admin'] as Role[]).map((r) => (
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
                  <span className="block text-sm font-medium">{ROLE_LABEL[r]}</span>
                  <span className="block text-xs text-muted">
                    {r === 'viewer'
                      ? 'Видит табель и может скачать отчёт.'
                      : 'Загружает файлы, меняет настройки, управляет пользователями.'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-4 text-sm text-muted">Пароль придумает система и покажет на следующем шаге.</p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-late">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Создать
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CredentialsDialog({
  data,
  onClose,
}: {
  data: { title: string; name: string; email: string; password: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [data]);
  if (!data)
    return (
      <Modal open={false} onClose={onClose} title="">
        {null}
      </Modal>
    );
  const site = location.href.split('#')[0];
  const text = `Платформа учёта рабочего времени\nАдрес: ${site}\nЛогин: ${data.email}\nПароль: ${data.password}\nПосле входа смените пароль: меню слева, «Сменить пароль».`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.error('Не удалось скопировать — выделите текст и скопируйте вручную');
    }
  };
  return (
    <Modal open onClose={onClose} title={data.title}>
      <p className="text-sm text-muted">
        Данные для входа: <span className="font-medium text-ink">{data.name}</span>. Пароль показывается{' '}
        <span className="font-medium text-ink">только сейчас</span> — скопируйте и передайте человеку лично.
      </p>
      <dl className="mt-4 space-y-2 rounded-lg border border-rule bg-paper p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Логин</dt>
          <dd className="font-medium break-all">{data.email}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Пароль</dt>
          <dd className="text-lg font-semibold tracking-wider select-all">{data.password}</dd>
        </div>
      </dl>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button onClick={copy}>
          {copied ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? 'Скопировано' : 'Скопировать адрес, логин и пароль'}
        </Button>
        <Button variant="primary" onClick={onClose}>
          Готово
        </Button>
      </div>
    </Modal>
  );
}
