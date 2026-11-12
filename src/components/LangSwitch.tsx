import clsx from 'clsx';
import { LANGS, useI18n } from '../i18n';

/** Переключатель языка TJ / RU / EN. */
export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('lang.label')}
      className={clsx('flex rounded-md border border-rule bg-surface p-0.5', className)}
    >
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          title={l.name}
          className={clsx(
            'h-7 min-w-9 rounded px-2 text-xs font-semibold',
            lang === l.code ? 'bg-stamp text-white' : 'text-muted hover:bg-hover hover:text-ink',
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
