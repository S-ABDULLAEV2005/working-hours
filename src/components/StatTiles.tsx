import clsx from 'clsx';

export interface Tile<K extends string> {
  key: K;
  label: string;
  value: string;
  note?: string;
  tone?: 'late' | 'single' | 'ok' | 'stamp';
  disabled?: boolean;
}

/**
 * Крупные цифры, которые одновременно работают как фильтр:
 * нажал «Опоздания» — ниже остаются только опоздания. Повторное нажатие снимает фильтр.
 */
export function StatTiles<K extends string>({
  tiles,
  active,
  onSelect,
  label,
}: {
  tiles: Tile<K>[];
  active: K | null;
  onSelect: (k: K | null) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => {
        const on = active === tile.key;
        return (
          <button
            key={tile.key}
            onClick={() => onSelect(on ? null : tile.key)}
            aria-pressed={on}
            disabled={tile.disabled}
            className={clsx(
              'rounded-lg border px-4 py-3 text-left transition-colors disabled:cursor-default disabled:opacity-60',
              on
                ? 'border-stamp bg-stamp-soft ring-1 ring-stamp'
                : 'border-rule bg-surface hover:border-faint hover:bg-hover',
            )}
          >
            <span
              className={clsx(
                'block font-semibold tracking-tight whitespace-nowrap',
                tile.value.length > 9 ? 'text-xl leading-8' : 'text-2xl',
                tile.tone === 'late' && 'text-late',
                tile.tone === 'single' && 'text-single',
                tile.tone === 'ok' && 'text-ok',
                tile.tone === 'stamp' && 'text-stamp',
              )}
            >
              {tile.value}
            </span>
            <span className="block text-sm leading-5 text-muted">{tile.label}</span>
            {tile.note && <span className="block text-xs text-faint">{tile.note}</span>}
          </button>
        );
      })}
    </div>
  );
}
