import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor, type Route } from '../../app/routes';
import type { VisitBundle } from '../../core/bundle';
import { matchingLines } from '../../core/keywords';
import { PERFORMER_LABELS, REGULATION_ACTION_LABELS, REGULATION_SOURCE_GROUPS, SCHEDULE_STATUS_LABELS } from '../../core/labels';
import { mapGroups, type MapRow } from '../../core/serviceMap';
import type { Id, Performer, RegulationAction, RegulationItem, RegulationSource } from '../../core/model';
import { itemIntervalText } from '../../core/scheduleText';
import { formatDate, formatLocalDateTime, plural } from '../../core/format';
import { parseKm } from '../../core/visitForm';
import { getDb } from '../../db/db';
import { componentTree, useComponents } from '../../db/hooks';
import { deleteRegulationItem, saveRegulationItem, type RegulationItemInput } from '../../db/regulation';
import { lastRegulationImport, undoRegulationImport } from '../../db/regulationImport';
import { ConfirmDialog } from '../../ui/Dialog';
import { EmptyState } from '../../ui/EmptyState';
import { SelectField, TextAreaField, TextField } from '../../ui/Field';
import { PlusIcon, RegulationIcon } from '../../ui/icons';
import { ItemCard } from '../state/ItemCard';
import { useSchedule } from '../state/useSchedule';
import { RegulationImportScreen } from './RegulationImportScreen';
import { ServiceMapView } from './ServiceMapView';

/** Регламент tab: list, `/regulation/new`, `/regulation/import`, `/regulation/<id>` (card), `/regulation/<id>/edit`. */
export function RegulationScreen({ route }: { route: Route }) {
  const [first, second] = route.rest;
  if (first === 'new') return <RegulationEditor id={null} />;
  if (first === 'import') return <RegulationImportScreen />;
  if (first === 'map') return <RegulationList view="map" />;
  if (first && second === 'edit') return <RegulationEditor id={first} />;
  if (first) return <ItemCard id={first} backHref={hrefFor('/regulation')} />;
  return <RegulationList view="list" />;
}

function RegulationList({ view }: { view: 'list' | 'map' }) {
  const data = useSchedule();
  if (!data) return <p className="muted">Загрузка…</p>;

  const add = (
    <div className="btn-row">
      <a className="btn btn--primary" href={hrefFor('/regulation/import')}>
        Загрузить таблицу
      </a>
      <a className="btn btn--secondary" href={hrefFor('/regulation/new')}>
        <PlusIcon /> Добавить пункт
      </a>
    </div>
  );

  if (data.regulation.length === 0) {
    return (
      <EmptyState icon={<RegulationIcon />} title="Регламент пуст">
        <p>Пункты ТО с интервалами по пробегу и времени: что менять и когда. Загрузите таблицу регламента (Excel, CSV или фото через чат-ИИ) или добавьте пункты вручную.</p>
        {add}
        <LastImportCard />
      </EmptyState>
    );
  }

  const byId = new Map(data.items.map((s) => [s.item.id, s]));
  // "вручную" matters only next to items from a table.
  const hasTable = data.regulation.some((i) => i.origin === 'table');
  const groups = mapGroups(data.regulation);
  const showTitles = groups.length > 1 || groups[0]?.key !== 'none';
  // The list is for finding an item: by name. «Карта ТО» orders by frequency.
  const byName = (rows: readonly MapRow[]) => rows.map((r) => r.item).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const list =(items: RegulationItem[], label: string) => (
    <ul className="sched-list" aria-label={label}>
      {items.map((item) => {
        const s = byId.get(item.id);
        const status = s?.status ?? 'gray';
        return (
          <li key={item.id} className={`sched-row sched-row--${status}`} data-status={status}>
            <a className="sched-row__link" href={hrefFor(`/regulation/${item.id}`)}>
              <span className="sched-dot" aria-hidden="true" />
              <span className="sched-row__body">
                <span className="sched-row__name">
                  {item.name}
                  {hasTable && item.origin !== 'table' && <span className="tag">вручную</span>}
                </span>
                <span className="sched-row__due">
                  <span className="visually-hidden">{SCHEDULE_STATUS_LABELS[status]}: </span>
                  {itemIntervalText(item)}
                </span>
              </span>
              <span className="muted" aria-hidden="true">
                ›
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="stack">
      {add}
      <LastImportCard />
      <div className="segmented segmented--2" role="tablist" aria-label="Вид регламента">
        <a className="segmented__item segmented__link" role="tab" aria-selected={view === 'list'} href={hrefFor('/regulation')}>
          Список
        </a>
        <a className="segmented__item segmented__link" role="tab" aria-selected={view === 'map'} href={hrefFor('/regulation/map')}>
          Карта ТО по пробегу
        </a>
      </div>
      {view === 'map' ? (
        <ServiceMapView items={data.regulation} />
      ) : (
        <div className="stack" data-testid="regulation-list">
          {groups.map((g) => {
            const title = REGULATION_SOURCE_GROUPS[g.key];
            return (
              <section key={g.key} className="stack-sm" aria-label={title} data-testid={`reg-group-${g.key}`}>
                {showTitles && (
                  <h2 className="reg-group__title">
                    {title} <span className="muted">· {g.replace.length + g.inspect.length}</span>
                  </h2>
                )}
                <div className="card reg-group">
                  {g.replace.length > 0 && (
                    <>
                      <h3 className="reg-group__sub">Замена · {g.replace.length}</h3>
                      {list(
                        byName(g.replace),
                        `${title}: замена`,
                      )}
                    </>
                  )}
                  {g.inspect.length > 0 && (
                    <>
                      <h3 className="reg-group__sub">Проверка · {g.inspect.length}</h3>
                      {list(
                        byName(g.inspect),
                        `${title}: проверка`,
                      )}
                    </>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The last upload, with "Отменить эту загрузку". */
function LastImportCard() {
  const last = useLiveQuery(() => lastRegulationImport(getDb()), []);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!last) return null;
  const s = last.summary;
  return (
    <section className="notice notice--info stack-sm" data-testid="last-import">
      <p>
        Загружено «{last.fileName}» {formatLocalDateTime(last.createdAt)}: добавлено {s.created}, изменено {s.updated}
        {s.revived ? `, вернулось ${s.revived}` : ''}, убрано {s.removed}, привязано строк истории {s.linked}.
      </p>
      <button type="button" className="link-btn" style={{ justifySelf: 'start' }} onClick={() => setConfirm(true)}>
        Отменить эту загрузку
      </button>
      {error && <p className="inline-error">{error}</p>}
      <ConfirmDialog
        open={confirm}
        title="Отменить загрузку таблицы?"
        confirmLabel="Отменить загрузку"
        danger
        onConfirm={() => {
          setConfirm(false);
          undoRegulationImport(getDb(), last.id).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Не удалось отменить'));
        }}
        onCancel={() => setConfirm(false)}
      >
        <p>
          Регламент вернётся к тому, что было до загрузки «{last.fileName}»: изменённые и убранные пункты восстановятся, добавленные уберутся,
          привязки к истории, сделанные загрузкой, снимутся. Правки этих пунктов после загрузки тоже откатятся.
        </p>
      </ConfirmDialog>
    </section>
  );
}

interface EditorState {
  name: string;
  componentId: string;
  action: RegulationAction;
  performer: Performer;
  km: string;
  months: string;
  severeKm: string;
  severeMonths: string;
  keywords: string;
  note: string;
  source: RegulationSource | '';
}

const toText = (n: number | null) => (n === null ? '' : String(n));

function fromItem(item: RegulationItem | undefined): EditorState {
  return {
    name: item?.name ?? '',
    componentId: item?.componentId ?? '',
    action: item?.action ?? 'replace',
    performer: item?.performer ?? 'service',
    km: toText(item?.intervalKm ?? null),
    months: toText(item?.intervalMonths ?? null),
    severeKm: toText(item?.severeIntervalKm ?? null),
    severeMonths: toText(item?.severeIntervalMonths ?? null),
    keywords: item?.keywords.join('\n') ?? '',
    note: item?.note ?? '',
    source: item?.source ?? '',
  };
}

/** One keyword variant per line; empty → the item name. */
export function parseKeywordVariants(text: string, name: string): string[] {
  const variants = text
    .split('\n')
    .map((v) => v.trim().replace(/\s+/g, ' ').toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(variants)];
  return unique.length ? unique : name.trim() ? [name.trim().toLowerCase()] : [];
}

type Parsed = { ok: true; input: RegulationItemInput } | { ok: false; errors: Partial<Record<keyof EditorState, string>> };

function parse(f: EditorState): Parsed {
  const errors: Partial<Record<keyof EditorState, string>> = {};
  const num = (key: keyof EditorState, max: number, what: string): number | null => {
    const raw = String(f[key]).trim();
    if (!raw) return null;
    const v = parseKm(raw);
    if (v === null || v <= 0 || v > max) errors[key] = `${what}: целое число от 1 до ${max.toLocaleString('ru-RU')}`;
    return v;
  };
  if (!f.name.trim()) errors.name = 'Укажите название';
  const intervalKm = num('km', 500000, 'Км');
  const intervalMonths = num('months', 240, 'Месяцы');
  const severeIntervalKm = num('severeKm', 500000, 'Км');
  const severeIntervalMonths = num('severeMonths', 240, 'Месяцы');
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    input: {
      name: f.name.trim(),
      componentId: f.componentId || null,
      action: f.action,
      performer: f.performer,
      intervalKm,
      intervalMonths,
      severeIntervalKm,
      severeIntervalMonths,
      keywords: parseKeywordVariants(f.keywords, f.name),
      note: f.note.trim(),
      source: f.source || undefined,
    },
  };
}

function RegulationEditor({ id }: { id: Id | null }) {
  const data = useSchedule();
  const existing = id ? data?.regulation.find((r) => r.id === id) : undefined;
  usePageHeader(id ? 'Изменить пункт' : 'Новый пункт', id ? hrefFor(`/regulation/${id}`) : hrefFor('/regulation'));
  if (!data) return <p className="muted">Загрузка…</p>;
  if (id && !existing) {
    return (
      <p>
        Пункт не найден. <a href={hrefFor('/regulation')}>К регламенту</a>
      </p>
    );
  }
  return <EditorForm key={id ?? 'new'} existing={existing} bundles={data.bundles} />;
}

function EditorForm({ existing, bundles }: { existing: RegulationItem | undefined; bundles: VisitBundle[] }) {
  const components = useComponents() ?? [];
  const tree = useMemo(() => componentTree(components), [components]);
  const [f, setF] = useState<EditorState>(() => fromItem(existing));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<EditorState>) => setF((x) => ({ ...x, ...patch }));

  const parsed = parse(f);
  const errors = submitted && !parsed.ok ? parsed.errors : {};

  // Live preview: which history lines these keywords catch.
  const preview = useMemo(() => matchingLines(bundles, parseKeywordVariants(f.keywords, f.name)), [f.keywords, f.name, bundles]);

  const save = async () => {
    setSubmitted(true);
    if (!parsed.ok) return;
    setSaving(true);
    const savedId = await saveRegulationItem(getDb(), existing?.id ?? null, parsed.input);
    // The card offers to link matching history lines.
    window.location.replace(hrefFor(`/regulation/${savedId}`));
  };

  return (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <section className="card">
        {existing?.origin === 'table' && (
          <p className="hint" data-testid="from-table">
            Пункт из таблицы регламента: следующая загруженная таблица заменит его интервалы. Ключевые слова сохранятся, если в таблице их нет.
          </p>
        )}
        <TextField label="Название" value={f.name} error={errors.name} placeholder="Масло двигателя" onChange={(e) => set({ name: e.target.value })} />
        <SelectField label="Узел" value={f.componentId} onChange={(e) => set({ componentId: e.target.value })}>
          <option value="">— не выбран —</option>
          {tree.map(({ component, depth }) => (
            <option key={component.id} value={component.id}>
              {'  '.repeat(depth) + component.name}
            </option>
          ))}
        </SelectField>
        <div className="grid2">
          <SelectField label="Что делать" value={f.action} onChange={(e) => set({ action: e.target.value as RegulationAction })}>
            {Object.entries(REGULATION_ACTION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <SelectField label="Кто делает" value={f.performer} onChange={(e) => set({ performer: e.target.value as Performer })}>
            {Object.entries(PERFORMER_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
        </div>
        <SelectField
          label="Откуда пункт"
          value={f.source}
          hint="Пункты сервиса стоят в регламенте первыми; на «Карте ТО» видно, на каком пробеге что делать."
          onChange={(e) => set({ source: e.target.value as RegulationSource | '' })}
        >
          <option value="">— не указано —</option>
          <option value="service">График ТО сервиса</option>
          <option value="instruction">Инструкция к автомобилю</option>
        </SelectField>
      </section>

      <section className="card" aria-label="Интервал">
        <h2 className="card__title">Интервал</h2>
        <p className="hint">Что наступит раньше. Можно указать только пробег или только время.</p>
        <div className="grid2">
          <TextField label="Каждые, км" inputMode="numeric" value={f.km} error={errors.km} placeholder="10000" onChange={(e) => set({ km: e.target.value })} />
          <TextField label="Каждые, мес" inputMode="numeric" value={f.months} error={errors.months} placeholder="12" onChange={(e) => set({ months: e.target.value })} />
        </div>
        <details className="line__more" open={!!(f.severeKm || f.severeMonths) || undefined}>
          <summary>Тяжёлые условия</summary>
          <p className="hint">Используются, когда в «Ещё → Расчёт сроков» включены тяжёлые условия. Пусто — как обычно.</p>
          <div className="grid2">
            <TextField label="Каждые, км" inputMode="numeric" value={f.severeKm} error={errors.severeKm} onChange={(e) => set({ severeKm: e.target.value })} />
            <TextField
              label="Каждые, мес"
              inputMode="numeric"
              value={f.severeMonths}
              error={errors.severeMonths}
              onChange={(e) => set({ severeMonths: e.target.value })}
            />
          </div>
        </details>
      </section>

      <section className="card" aria-label="Ключевые слова">
        <h2 className="card__title">Как узнавать в истории</h2>
        <TextAreaField
          label="Ключевые слова — по варианту в строке"
          rows={3}
          value={f.keywords}
          placeholder={f.name ? f.name.toLowerCase() : 'замена масла двигатель\nмасло моторное'}
          hint="Строка визита подходит, если в её названии есть все слова варианта (можно начала слов, порядок любой). Пусто — по названию пункта."
          onChange={(e) => set({ keywords: e.target.value })}
        />
        <p className="hint" data-testid="keyword-preview">
          {preview.length
            ? `Подходит ${preview.length} ${plural(preview.length, 'строка', 'строки', 'строк')} в истории: ${preview
                .slice(0, 3)
                .map((l) => `${formatDate(l.date)} ${l.name}`)
                .join('; ')}${preview.length > 3 ? '…' : ''}`
            : 'В истории пока ничего не подходит.'}
        </p>
        <TextAreaField label="Заметка" rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} />
      </section>

      <div className="savebar">
        <div className="savebar__buttons">
          {existing && (
            <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmDelete(true)}>
              Удалить
            </button>
          )}
          <a className="btn btn--ghost" href={existing ? hrefFor(`/regulation/${existing.id}`) : hrefFor('/regulation')}>
            Отмена
          </a>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            Сохранить
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Удалить пункт?"
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          setConfirmDelete(false);
          if (existing) void deleteRegulationItem(getDb(), existing.id).then(() => window.location.replace(hrefFor('/regulation')));
        }}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>Пункт «{existing?.name}» исчезнет из регламента и с главного экрана. История визитов не изменится.</p>
      </ConfirmDialog>
    </form>
  );
}
