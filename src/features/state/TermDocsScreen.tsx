import { useMemo, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import { addDays, addMonths, isIsoDate, todayIso } from '../../core/dates';
import { formatDate } from '../../core/format';
import type { Id, TermDocument, TermDocumentKind } from '../../core/model';
import { DEFAULT_REMIND_DAYS, TERM_KIND_LABELS, termDueText, termStatuses, termTitle, type TermState, type TermStatus } from '../../core/termDocs';
import { parseKm } from '../../core/visitForm';
import { getDb } from '../../db/db';
import { useScans, useTermDocuments } from '../../db/hooks';
import { addTermDocumentScans, clearTermDocumentScans, deleteTermDocument, saveTermDocument, type TermDocumentInput } from '../../db/selfCheck';
import { ConfirmDialog } from '../../ui/Dialog';
import { EmptyState } from '../../ui/EmptyState';
import { SelectField, TextField } from '../../ui/Field';
import { PlusIcon } from '../../ui/icons';
import { ScanViewer } from '../review/ScanViewer';
import { ScanPicker } from '../scans/ScanPicker';

export const TERM_ROW: Record<TermState, 'red' | 'yellow' | 'green' | 'gray'> = { expired: 'red', soon: 'yellow', ok: 'green', 'no-date': 'gray', replaced: 'gray' };

export function useTermStatuses(): TermStatus[] | undefined {
  const docs = useTermDocuments();
  const today = todayIso();
  return useMemo(() => (docs ? termStatuses(docs, today) : undefined), [docs, today]);
}

/** `/state/docs`, `/state/docs/new[?from=<id>]`, `/state/docs/<id>`, `/state/docs/<id>/edit`. */
export function TermDocsScreen({ id, edit }: { id: Id | null; edit: boolean }) {
  if (id === 'new') return <TermDocEditor id={null} />;
  if (id && edit) return <TermDocEditor id={id} />;
  if (id) return <TermDocCard id={id} />;
  return <TermDocList />;
}

export function TermRow({ s }: { s: TermStatus }) {
  const today = todayIso();
  const row = TERM_ROW[s.state];
  return (
    <li className={`sched-row sched-row--${row}`} data-testid="term-row" data-state={s.state}>
      <a className="sched-row__link" href={hrefFor(`/state/docs/${s.doc.id}`)}>
        <span className="sched-dot" aria-hidden="true" />
        <span className="sched-row__body">
          <span className="sched-row__name">{termTitle(s.doc)}</span>
          <span className="sched-row__due">{termDueText(s, today)}</span>
        </span>
        <span className="muted" aria-hidden="true">
          ›
        </span>
      </a>
    </li>
  );
}

function TermDocList() {
  usePageHeader('Документы со сроком', hrefFor('/'));
  const list = useTermStatuses();
  if (!list) return <p className="muted">Загрузка…</p>;

  const add = (
    <a className="btn btn--primary" href={hrefFor('/state/docs/new')} style={{ justifySelf: 'start' }}>
      <PlusIcon /> Добавить документ
    </a>
  );
  if (list.length === 0) {
    return (
      <EmptyState icon={<PlusIcon />} title="Документов пока нет">
        <p>ОСАГО, аптечка, огнетушитель — всё, у чего есть срок. Напоминание появится на главном экране заранее.</p>
        {add}
      </EmptyState>
    );
  }
  const current = list.filter((s) => s.state !== 'replaced');
  const old = list.filter((s) => s.state === 'replaced');
  return (
    <div className="stack">
      {add}
      <ul className="card sched-list" data-testid="term-list">
        {current.map((s) => (
          <TermRow key={s.doc.id} s={s} />
        ))}
      </ul>
      {old.length > 0 && (
        <details className="card sched-group">
          <summary>Заменённые новыми: {old.length}</summary>
          <ul className="sched-list">
            {old.map((s) => (
              <TermRow key={s.doc.id} s={s} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function TermDocCard({ id }: { id: Id }) {
  const list = useTermStatuses();
  const s = list?.find((x) => x.doc.id === id);
  usePageHeader(s ? termTitle(s.doc) : 'Документ', hrefFor('/state/docs'));
  const scans = useScans(s?.doc.scanIds ?? []);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!list) return <p className="muted">Загрузка…</p>;
  if (!s) {
    return (
      <p>
        Документ не найден. <a href={hrefFor('/state/docs')}>К документам</a>
      </p>
    );
  }
  const { doc } = s;
  const row = TERM_ROW[s.state];
  const today = todayIso();

  return (
    <div className="stack">
      <section className={`card sched-card sched-card--${row}`} data-testid="term-card">
        <p className="sched-card__due">
          <span className="sched-dot" aria-hidden="true" /> {termDueText(s, today)}
        </p>
        <dl className="facts">
          <div>
            <dt>Вид</dt>
            <dd>{doc.kind === 'other' ? doc.title || TERM_KIND_LABELS.other : TERM_KIND_LABELS[doc.kind]}</dd>
          </div>
          {doc.number && (
            <div>
              <dt>Номер</dt>
              <dd>{doc.number}</dd>
            </div>
          )}
          {doc.company && (
            <div>
              <dt>Компания</dt>
              <dd>{doc.company}</dd>
            </div>
          )}
          <div>
            <dt>Действует</dt>
            <dd>
              {doc.startDate ? `с ${formatDate(doc.startDate)} ` : ''}
              {doc.endDate ? `по ${formatDate(doc.endDate)}` : '—'}
            </dd>
          </div>
          <div>
            <dt>Напомнить</dt>
            <dd>за {doc.remindDaysBefore} дн.</dd>
          </div>
        </dl>
        <div className="btn-row">
          <a className="btn btn--secondary" href={hrefFor(`/state/docs/${doc.id}/edit`)}>
            Изменить
          </a>
          {s.state !== 'replaced' && (
            <a className="btn btn--secondary" href={hrefFor(`/state/docs/new?from=${doc.id}`)}>
              Внести новый на следующий срок
            </a>
          )}
        </div>
      </section>

      <section className="card" aria-label="Скан">
        <h2 className="card__title">Скан</h2>
        {doc.scanIds.length > 0 && scans && <ScanViewer scans={scans} />}
        <p className="hint">Скан хранится зашифрованным вместе с остальными и не распознаётся — поля выше заполняются вручную.</p>
        <ScanPicker
          cameraLabel="Сфотографировать"
          filesLabel="Выбрать фото или PDF"
          primary={doc.scanIds.length === 0}
          testIdPrefix="doc-"
          onStored={(scanIds) => addTermDocumentScans(getDb(), doc.id, scanIds)}
        />
        {doc.scanIds.length > 0 && (
          <button type="button" className="link-btn" style={{ justifySelf: 'start' }} onClick={() => setConfirmClear(true)}>
            Убрать скан
          </button>
        )}
      </section>

      <ConfirmDialog
        open={confirmClear}
        title="Убрать скан?"
        confirmLabel="Убрать"
        danger
        onConfirm={() => {
          setConfirmClear(false);
          void clearTermDocumentScans(getDb(), doc.id);
        }}
        onCancel={() => setConfirmClear(false)}
      >
        <p>Страницы ({doc.scanIds.length}) открепятся от документа. Поля документа останутся.</p>
      </ConfirmDialog>
    </div>
  );
}

interface EditorState {
  kind: TermDocumentKind;
  title: string;
  number: string;
  company: string;
  startDate: string;
  endDate: string;
  remind: string;
}

/** A year of OSAGO: 20.11.2025 → 19.11.2026. */
const yearAfter = (start: string) => addDays(addMonths(start, 12), -1);

function initialState(existing: TermDocument | undefined, from: TermDocument | undefined): EditorState {
  if (existing) {
    return {
      kind: existing.kind,
      title: existing.title ?? '',
      number: existing.number ?? '',
      company: existing.company ?? '',
      startDate: existing.startDate ?? '',
      endDate: existing.endDate ?? '',
      remind: String(existing.remindDaysBefore),
    };
  }
  // "Внести новый на следующий срок": same kind and company, starting the day after the old one ends.
  const start = from?.endDate ? addDays(from.endDate, 1) : '';
  return {
    kind: from?.kind ?? 'osago',
    title: from?.title ?? '',
    number: '',
    company: from?.company ?? '',
    startDate: start,
    endDate: start && (from?.kind ?? 'osago') === 'osago' ? yearAfter(start) : '',
    remind: String(from?.remindDaysBefore ?? DEFAULT_REMIND_DAYS),
  };
}

type Parsed = { ok: true; input: TermDocumentInput } | { ok: false; errors: Partial<Record<keyof EditorState, string>> };

function parse(f: EditorState): Parsed {
  const errors: Partial<Record<keyof EditorState, string>> = {};
  if (f.kind === 'other' && !f.title.trim()) errors.title = 'Укажите, что это за документ';
  if (f.startDate && !isIsoDate(f.startDate)) errors.startDate = 'Неверная дата';
  if (!isIsoDate(f.endDate)) errors.endDate = 'Укажите дату окончания';
  else if (f.startDate && isIsoDate(f.startDate) && f.startDate > f.endDate) errors.endDate = 'Окончание раньше начала';
  const remind = parseKm(f.remind);
  if (remind === null || remind > 365) errors.remind = 'От 0 до 365 дней';
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    input: {
      kind: f.kind,
      title: f.kind === 'other' ? f.title.trim() : null,
      number: f.number.trim() || null,
      company: f.company.trim() || null,
      startDate: f.startDate || null,
      endDate: f.endDate,
      remindDaysBefore: remind!,
    },
  };
}

function TermDocEditor({ id }: { id: Id | null }) {
  const docs = useTermDocuments();
  const fromId = id ? null : new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('from');
  usePageHeader(id ? 'Изменить документ' : 'Новый документ', id ? hrefFor(`/state/docs/${id}`) : hrefFor('/state/docs'));
  if (!docs) return <p className="muted">Загрузка…</p>;
  const existing = id ? docs.find((d) => d.id === id) : undefined;
  if (id && !existing) {
    return (
      <p>
        Документ не найден. <a href={hrefFor('/state/docs')}>К документам</a>
      </p>
    );
  }
  const from = fromId ? docs.find((d) => d.id === fromId) : undefined;
  return <EditorForm key={id ?? `new-${fromId ?? ''}`} existing={existing} from={from} />;
}

function EditorForm({ existing, from }: { existing: TermDocument | undefined; from: TermDocument | undefined }) {
  const [f, setF] = useState<EditorState>(() => initialState(existing, from));
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<EditorState>) => setF((x) => ({ ...x, ...patch }));
  const parsed = parse(f);
  const errors = submitted && !parsed.ok ? parsed.errors : {};

  const save = async () => {
    setSubmitted(true);
    if (!parsed.ok) return;
    const savedId = await saveTermDocument(getDb(), existing?.id ?? null, parsed.input);
    window.location.replace(hrefFor(`/state/docs/${savedId}`));
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
        <SelectField label="Вид" value={f.kind} onChange={(e) => set({ kind: e.target.value as TermDocumentKind })}>
          {Object.entries(TERM_KIND_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
        {f.kind === 'other' && (
          <TextField label="Название" value={f.title} error={errors.title} placeholder="Диагностическая карта" onChange={(e) => set({ title: e.target.value })} />
        )}
        <TextField label="Номер" value={f.number} autoComplete="off" onChange={(e) => set({ number: e.target.value })} />
        <TextField label="Компания" value={f.company} onChange={(e) => set({ company: e.target.value })} />
        <div className="grid2">
          <TextField
            label="Начало"
            type="date"
            value={f.startDate}
            error={errors.startDate}
            onChange={(e) => {
              const startDate = e.target.value;
              // OSAGO is a year: fill the end date while it is empty or still the automatic one.
              const auto = f.kind === 'osago' && isIsoDate(startDate) && (!f.endDate || (isIsoDate(f.startDate) && f.endDate === yearAfter(f.startDate)));
              set(auto ? { startDate, endDate: yearAfter(startDate) } : { startDate });
            }}
          />
          <TextField label="Окончание" type="date" value={f.endDate} error={errors.endDate} onChange={(e) => set({ endDate: e.target.value })} />
        </div>
        <TextField label="Напомнить за, дней" inputMode="numeric" value={f.remind} error={errors.remind} onChange={(e) => set({ remind: e.target.value })} />
        <p className="hint">Скан добавляется в карточке документа после сохранения.</p>
      </section>

      <div className="savebar">
        <div className="savebar__buttons">
          {existing && (
            <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmDelete(true)}>
              Удалить
            </button>
          )}
          <a className="btn btn--ghost" href={existing ? hrefFor(`/state/docs/${existing.id}`) : hrefFor('/state/docs')}>
            Отмена
          </a>
          <button type="submit" className="btn btn--primary">
            Сохранить
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Удалить документ?"
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          setConfirmDelete(false);
          if (existing) void deleteTermDocument(getDb(), existing.id).then(() => window.location.replace(hrefFor('/state/docs')));
        }}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>Документ и его скан будут удалены.</p>
      </ConfirmDialog>
    </form>
  );
}
