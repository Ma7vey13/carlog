import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import { plural } from '../../core/format';
import { buildRegulationPrompt, regulationTemplateCsv } from '../../core/regulationPrompt';
import {
  COLUMN_ROLE_LABELS,
  detectLayout,
  parseTable,
  planImport,
  type ColumnRole,
  type ImportPlan,
  type ItemInput,
  type ParseResult,
  type TableLayout,
} from '../../core/regulationTable';
import { intervalText } from '../../core/scheduleText';
import { extractTableText, parseDelimited, readTableFile, type Grid } from '../../core/table';
import { ZipError } from '../../core/zip';
import { getDb } from '../../db/db';
import { useComponents } from '../../db/hooks';
import { applyRegulationImport, plannedLinks } from '../../db/regulationImport';
import { copyText } from '../../scan/share';
import { TextAreaField } from '../../ui/Field';
import { useSchedule } from '../state/useSchedule';

const ROLES = Object.keys(COLUMN_ROLE_LABELS) as ColumnRole[];

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** "Регламент → Загрузить таблицу" (stage 9): a file, pasted cells or a chat answer → preview → apply. */
export function RegulationImportScreen() {
  usePageHeader('Загрузить регламент', hrefFor('/regulation'));
  const [grid, setGrid] = useState<Grid | null>(null);
  const [fileName, setFileName] = useState('');
  const [layout, setLayout] = useState<TableLayout | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (g: Grid, name: string) => {
    if (g.length < 2) {
      setError('В таблице меньше двух строк — проверьте, что выбран нужный файл или вставлена вся таблица.');
      return;
    }
    setError(null);
    setGrid(g);
    setFileName(name);
    setLayout(detectLayout(g));
  };

  return (
    <div className="stack">
      <SourceCard onGrid={load} onError={setError} />
      {error && (
        <p className="notice notice--error" role="alert" data-testid="import-error">
          {error}
        </p>
      )}
      {grid && layout && <Preview key={fileName + grid.length} grid={grid} fileName={fileName} layout={layout} onLayout={setLayout} />}
    </div>
  );
}

function SourceCard({ onGrid, onError }: { onGrid: (g: Grid, name: string) => void; onError: (e: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      onGrid(await readTableFile(file.name, new Uint8Array(await file.arrayBuffer())), file.name);
    } catch (err) {
      onError(err instanceof ZipError ? err.message : 'Не удалось прочитать файл. Сохраните таблицу как .xlsx или CSV.');
    } finally {
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <section className="card" aria-label="Откуда таблица">
      <h2 className="card__title">Таблица регламента</h2>
      <p className="hint">
        Можно загружать в любой момент: новая таблица заменит пункты предыдущей, история и ваши отметки сохранятся. Перед применением
        покажу, что изменится, а последнюю загрузку можно отменить.
      </p>
      <button type="button" className="btn btn--primary" style={{ justifySelf: 'start' }} onClick={() => ref.current?.click()}>
        Выбрать файл: Excel или CSV
      </button>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        data-testid="table-file-input"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <TextAreaField
        label="Или вставьте таблицу"
        rows={4}
        value={text}
        placeholder="Ячейки, скопированные из Excel или Google Таблиц, или ответ чата"
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" className="btn btn--secondary" style={{ justifySelf: 'start' }} disabled={!text.trim()} onClick={() => onGrid(parseDelimited(extractTableText(text)), 'вставленная таблица')}>
        Разобрать
      </button>
      <details className="line__more">
        <summary>Таблица на фото или в PDF — распознать через чат-ИИ</summary>
        <ol className="steps steps--compact">
          <li>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={() => void copyText(buildRegulationPrompt()).then((ok) => setCopied(ok))}
            >
              Скопировать промпт
            </button>
            {copied && <span className="hint"> Скопирован.</span>}
          </li>
          <li>Вставьте его в чат (Gemini, Claude и т. п.) и прикрепите фото таблицы. Длинную таблицу снимайте по частям — по странице.</li>
          <li>Скопируйте ответ чата целиком в поле «Или вставьте таблицу» и нажмите «Разобрать». Сверьте предпросмотр с фото.</li>
        </ol>
      </details>
      <button type="button" className="link-btn" style={{ justifySelf: 'start' }} onClick={() => download(regulationTemplateCsv(), 'regulation-template.csv')}>
        Скачать шаблон таблицы (CSV)
      </button>
    </section>
  );
}

function Preview({ grid, fileName, layout, onLayout }: { grid: Grid; fileName: string; layout: TableLayout; onLayout: (l: TableLayout) => void }) {
  const data = useSchedule();
  const components = useComponents();
  // Removed items too: a table that brings one back revives it with its history.
  const allItems = useLiveQuery(() => getDb().regulationItems.toArray(), []);
  const [applying, setApplying] = useState(false);

  const parsed: ParseResult = useMemo(() => parseTable(grid, layout), [grid, layout]);
  const plan: ImportPlan | null = useMemo(
    () => (allItems && components ? planImport(parsed.items, allItems, components) : null),
    [parsed, allItems, components],
  );
  const links = useMemo(() => (plan && data ? plannedLinks(data.bundles, plan) : []), [plan, data]);
  const linksOf = (id: string) => links.filter(([, item]) => item === id).length;

  if (!plan) return <p className="muted">Загрузка…</p>;

  const apply = async () => {
    setApplying(true);
    await applyRegulationImport(getDb(), plan, fileName);
    window.location.replace(hrefFor('/regulation'));
  };

  const headers = layout.kind === 'list' && layout.headerRow >= 0 ? grid[layout.headerRow]! : null;
  const total = plan.create.length + plan.update.length + plan.revive.length + plan.unchanged.length;
  const row = (input: ItemInput, extra?: string) => (
    <>
      <strong>{input.name}</strong> — {intervalText(input.intervalKm, input.intervalMonths) || 'без интервала'}
      {input.action === 'inspect' ? ', проверка' : ''}
      {extra ? <span className="muted"> · {extra}</span> : null}
    </>
  );

  return (
    <>
      <section className="card" aria-label="Как понята таблица" data-testid="import-layout">
        <h2 className="card__title">Как понята таблица</h2>
        {layout.kind === 'matrix' ? (
          <p>
            Сетка сервисной книжки: колонки{' '}
            {layout.columns
              .map((c) => [c.km ? `${c.km.toLocaleString('ru-RU')} км` : '', c.months ? `${c.months} мес` : ''].filter(Boolean).join(' / '))
              .join(', ')}
            ; отметки «З» — замена, «П» — проверка. Интервал — шаг между отметками.
          </p>
        ) : (
          <>
            <p className="hint">Одна строка — один пункт. Если колонка понята неверно, выберите её смысл.</p>
            <div className="import-roles">
              {layout.roles.map((role, i) => (
                <label key={i} className="import-role">
                  <span className="import-role__head">{headers?.[i] || `Колонка ${i + 1}`}</span>
                  <select
                    className="input input--compact"
                    value={role}
                    onChange={(e) => onLayout({ ...layout, roles: layout.roles.map((r, j) => (j === i ? (e.target.value as ColumnRole) : r)) })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {COLUMN_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </>
        )}
        {parsed.skipped.length > 0 && (
          <details className="line__more">
            <summary>Не взяты строки: {parsed.skipped.length}</summary>
            <ul className="plain-list">
              {parsed.skipped.map((s) => (
                <li key={s.row}>
                  стр. {s.row}: {s.text} — {s.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card" aria-label="Что изменится" data-testid="import-plan">
        <h2 className="card__title">Что изменится</h2>
        {total === 0 ? (
          <p className="notice notice--warning">В таблице не найдено ни одного пункта. Проверьте колонку «Название».</p>
        ) : (
          <p data-testid="import-summary">
            В таблице {total} {plural(total, 'пункт', 'пункта', 'пунктов')}: добавится {plan.create.length}, изменится {plan.update.length}
            {plan.revive.length ? `, вернётся ${plan.revive.length}` : ''}, уберётся {plan.remove.length}. К истории привяжется{' '}
            {links.length} {plural(links.length, 'строка', 'строки', 'строк')}.
          </p>
        )}
        {plan.create.length > 0 && (
          <details className="line__more" open>
            <summary>Добавится: {plan.create.length}</summary>
            <ul className="plain-list" data-testid="plan-create">
              {plan.create.map((c, i) => (
                <li key={c.name}>{row(c, `в истории: ${linksOf(`new-${i}`)}`)}</li>
              ))}
            </ul>
          </details>
        )}
        {plan.update.length > 0 && (
          <details className="line__more" open>
            <summary>Изменится: {plan.update.length}</summary>
            <ul className="plain-list" data-testid="plan-update">
              {plan.update.map((u) => (
                <li key={u.existing.id}>
                  <strong>{u.input.name}</strong>: {u.changes.length ? u.changes.join('; ') : 'станет пунктом из таблицы'}
                </li>
              ))}
            </ul>
          </details>
        )}
        {plan.revive.length > 0 && (
          <details className="line__more">
            <summary>Вернётся с прежней историей: {plan.revive.length}</summary>
            <ul className="plain-list">
              {plan.revive.map((r) => (
                <li key={r.existing.id}>{row(r.input)}</li>
              ))}
            </ul>
          </details>
        )}
        {plan.remove.length > 0 && (
          <div className="notice notice--warning" data-testid="plan-remove">
            <p className="notice__title">Уберётся из регламента: {plan.remove.length}</p>
            <ul className="plain-list">
              {plan.remove.map((r) => (
                <li key={r.id}>{r.name}</li>
              ))}
            </ul>
            <p className="notice__hint">История визитов и отметки не удаляются. Если пункт вернётся в следующей таблице, вернутся и они.</p>
          </div>
        )}
        {plan.unchanged.length > 0 && <p className="hint">Без изменений: {plan.unchanged.length}.</p>}
        {plan.keepManual.length > 0 && <p className="hint">Пункты, добавленные вручную, останутся как есть: {plan.keepManual.map((i) => i.name).join(', ')}.</p>}
        {plan.duplicates.length > 0 && <p className="hint">Повторяются в таблице (взята первая строка): {plan.duplicates.join(', ')}.</p>}
        <div className="btn-row">
          <button type="button" className="btn btn--primary" disabled={applying || total === 0} onClick={() => void apply()}>
            {applying ? 'Применяю…' : 'Применить таблицу'}
          </button>
          <a className="btn btn--ghost" href={hrefFor('/regulation')}>
            Отмена
          </a>
        </div>
      </section>
    </>
  );
}
