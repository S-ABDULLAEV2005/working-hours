import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useErrorText, useI18n } from '../i18n';
import { useApi } from '../lib/auth';
import { Button } from './ui';

/** Смена своего пароля. recovery — пользователь пришёл по ссылке из письма. */
export function ChangePasswordDialog({
  open,
  onClose,
  recovery,
}: {
  open: boolean;
  onClose: () => void;
  recovery?: boolean;
}) {
  const api = useApi();
  const { t } = useI18n();
  const errText = useErrorText();
  const ref = useRef<HTMLDialogElement>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setPw('');
      setPw2('');
      setError(null);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 10) return setError(t('pw.errShort'));
    if (!/\d/.test(pw) || !/\p{L}/u.test(pw)) return setError(t('pw.errMix'));
    if (pw !== pw2) return setError(t('pw.errMatch'));
    setSaving(true);
    try {
      await api.changeOwnPassword(pw);
      toast.success(t('pw.changed'), { description: t('pw.changedHint') });
      onClose();
    } catch (err) {
      setError(errText(err));
    } finally {
      setSaving(false);
    }
  };

  const field = 'mt-1.5 h-10 w-full rounded-md border border-rule px-3';
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => (saving || recovery) && e.preventDefault()}
      className="m-auto w-[min(420px,calc(100vw-2rem))] rounded-xl border border-rule bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/30"
    >
      <form onSubmit={submit} className="p-6" noValidate>
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold">{recovery ? t('pw.recoveryTitle') : t('pw.title')}</h2>
          {!recovery && (
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded p-1 text-muted hover:bg-hover"
              aria-label={t('common.close')}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <label className="block text-sm font-medium" htmlFor="np1">
          {t('pw.new')}
        </label>
        <input
          id="np1"
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className={field}
        />
        <p className="mt-1 text-xs text-muted">{t('pw.rules')}</p>
        <label className="mt-4 block text-sm font-medium" htmlFor="np2">
          {t('pw.repeat')}
        </label>
        <input
          id="np2"
          type="password"
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          className={field}
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-late">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          {!recovery && (
            <Button type="button" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </Button>
          )}
          <Button type="submit" variant="primary" loading={saving}>
            {t('pw.save')}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
