import { useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import { isIsoDate, todayIso } from '../../core/dates';
import { formatDate } from '../../core/format';
import { REPAIR_URGENCY_LABELS } from '../../core/labels';
import type { Id, Repair, RepairUrgency } from '../../core/model';
import { doneRepairs, openRepairs, REPAIR_DOT, REPAIR_URGENCIES } from '../../core/repairs';
import { getDb } from '../../db/db';
import { componentTree, useComponents, useRepairs, useVisitBundles } from '../../db/hooks';
import { deleteRepair, markRepairDone, reopenRepair, saveRepair } from '../../db/repairs';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { SelectField, TextAreaField, TextField } from '../../ui/Field';
import { PlusIcon } from '../../ui/icons';
import { PurposeTag } from '../history/PurposeTags';

/** `/state/repairs`, `/state/repairs/new`, `/state/repairs/<id>` (D-097). */
export function RepairsScreen({ id }: { id: Id | null }) {
  if (id === 'new') return <NewRepair />;
  if (id) return <RepairPage id={id} />;
  return <RepairList />;
}

function RepairList() {
  usePageHeader('Нужно отремонтировать', hrefFor('/'));
  const repairs = useRepairs();
  if (!repairs) return <p className="muted">Загрузка…</p>;
  const open = openRepairs(repairs);
  const done = doneRepairs(repairs);
  return (
    <div className="stack">
      <p className="hint">
        Что на машине требует ремонта вне регламента: «ШРУС хрустит при повороте». Висит на главном экране, пока не отметите «Сделано». В «Список
        к ТО» добавляется по выбору.
      </p>
      {open.length === 0 ? (
        <p className="notice notice--info" data-testid="repairs-empty">
          Сейчас ремонтировать нечего.
        </p>
      ) : (
        <section className="card" aria-label="Нужно отремонтировать">
          <ul className="sched-list" data-testid="repair-list">
            {open.map((r) => (
              <RepairRow key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}
      <a className="btn btn--primary" href={hrefFor('/state/repairs/new')} style={{ justifySelf: 'start' }}>
        <PlusIcon /> Добавить ремонт
      </a>
      {done.length > 0 && (
        <details className="card sched-group" data-testid="repairs-done">
          <summary>Сделано: {done.length}</summary>
          <ul className="sched-list">
            {done.map((r) => (
              <li key={r.id} className="sched-row">
                <a className="sched-row__link" href={hrefFor(`/state/repairs/${r.id}`)}>
                  <span className="sched-row__body">
                    <span className="sched-row__name">{r.title}</span>
                    <span className="sched-row__due">сделано {formatDate(r.doneDate)}</span>
                  </span>
                  <span className="muted" aria-hidden="true">
                    ›
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** A row of the main screen and of the list: urgency as the dot, the note under the name. */
export function RepairRow({ r }: { r: Repair }) {
  return (
    <li className={`sched-row sched-row--${REPAIR_DOT[r.urgency]}`} data-testid="repair-row" data-urgency={r.urgency}>
      <a className="sched-row__link" href={hrefFor(`/state/repairs/${r.id}`)}>
        <span className="sched-dot" aria-hidden="true" />
        <span className="sched-row__body">
          <span className="sched-row__name">
            {r.title}
            <PurposeTag purpose="repair" />
          </span>
          <span className="sched-row__due">
            {REPAIR_URGENCY_LABELS[r.urgency]}
            {r.note ? ` · ${r.note}` : ''}
          </span>
        </span>
        <span className="muted" aria-hidden="true">
          ›
        </span>
      </a>
    </li>
  );
}

function NewRepair() {
  usePageHeader('Новый ремонт', hrefFor('/state/repairs'));
  return <RepairEditor repair={null} />;
}

function RepairPage({ id }: { id: Id }) {
  const repairs = useRepairs();
  const bundles = useVisitBundles();
  const r = repairs?.find((x) => x.id === id);
  usePageHeader(r?.title ?? 'Ремонт', hrefFor('/state/repairs'));
  const [doneOpen, setDoneOpen] = useState(false);

  if (!repairs) return <p className="muted">Загрузка…</p>;
  if (!r) {
    return (
      <p>
        Запись не найдена — возможно, она удалена. <a href={hrefFor('/state/repairs')}>К списку ремонтов</a>
      </p>
    );
  }
  const visit = r.visitId ? bundles?.find((b) => b.visit.id === r.visitId)?.visit : undefined;

  return (
    <div className="stack">
      <section className={`card sched-card sched-card--${r.doneDate ? 'green' : REPAIR_DOT[r.urgency]}`} data-testid="repair-status">
        <p className="sched-card__status">
          <span className="sched-dot" aria-hidden="true" /> {r.doneDate ? `Сделано ${formatDate(r.doneDate)}` : REPAIR_URGENCY_LABELS[r.urgency]}
        </p>
        {visit && (
          <a href={hrefFor(`/history/${visit.id}`)}>
            Визит {formatDate(visit.date)}
            {visit.shop.name ? ` · ${visit.shop.name}` : ''} ›
          </a>
        )}
        <div className="btn-row">
          {r.doneDate ? (
            <button type="button" className="btn btn--secondary" onClick={() => void reopenRepair(getDb(), r.id)}>
              Вернуть в список
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => setDoneOpen(true)}>
              Сделано
            </button>
          )}
        </div>
      </section>
      <RepairEditor repair={r} />
      <DoneDialog repair={doneOpen ? r : null} onClose={() => setDoneOpen(false)} />
    </div>
  );
}

function RepairEditor({ repair }: { repair: Repair | null }) {
  const components = useComponents();
  const [title, setTitle] = useState(repair?.title ?? '');
  const [note, setNote] = useState(repair?.note ?? '');
  const [urgency, setUrgency] = useState<RepairUrgency>(repair?.urgency ?? 'soon');
  const [componentId, setComponentId] = useState(repair?.componentId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const touch = () => setSaved(false);

  const save = async () => {
    if (!title.trim()) {
      setError('Напишите, что нужно отремонтировать');
      return;
    }
    await saveRepair(getDb(), repair?.id ?? null, { title, note, urgency, componentId: componentId || null });
    if (repair) setSaved(true);
    else window.location.replace(hrefFor('/state/repairs'));
  };

  return (
    <form
      className="card"
      noValidate
      aria-label="Ремонт"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <TextField
        label="Что отремонтировать"
        value={title}
        error={error ?? undefined}
        placeholder="ШРУС передний левый"
        onChange={(e) => (setTitle(e.target.value), setError(null), touch())}
      />
      <div className="field">
        <span className="field__label" id="repair-urgency">
          Срочность
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="repair-urgency">
          {REPAIR_URGENCIES.map((u) => (
            <button key={u} type="button" role="radio" aria-checked={urgency === u} className="segmented__item" onClick={() => (setUrgency(u), touch())}>
              {REPAIR_URGENCY_LABELS[u]}
            </button>
          ))}
        </div>
      </div>
      <SelectField label="Узел (необязательно)" value={componentId} onChange={(e) => (setComponentId(e.target.value), touch())}>
        <option value="">— не выбран —</option>
        {componentTree(components ?? []).map(({ component, depth }) => (
          <option key={component.id} value={component.id}>
            {'  '.repeat(depth) + component.name}
          </option>
        ))}
      </SelectField>
      <TextAreaField
        label="Заметка"
        rows={3}
        value={note}
        placeholder="хрустит при повороте влево; стук на кочках"
        hint="Попадёт в список для мастера после названия"
        onChange={(e) => (setNote(e.target.value), touch())}
      />
      <div className="btn-row">
        <button type="submit" className="btn btn--primary">
          Сохранить
        </button>
        {repair && (
          <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmDelete(true)}>
            Удалить
          </button>
        )}
        {saved && (
          <span className="hint" role="status">
            Сохранено
          </span>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Удалить запись?"
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          setConfirmDelete(false);
          if (repair) void deleteRepair(getDb(), repair.id).then(() => window.location.replace(hrefFor('/state/repairs')));
        }}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>«{repair?.title}» исчезнет из списка ремонтов. Если ремонт сделан, лучше нажать «Сделано» — запись останется в «Сделано».</p>
      </ConfirmDialog>
    </form>
  );
}

/** "Сделано": the date and, optionally, the visit where it was done. */
function DoneDialog({ repair, onClose }: { repair: Repair | null; onClose: () => void }) {
  const bundles = useVisitBundles();
  const [date, setDate] = useState(todayIso());
  const [visitId, setVisitId] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const dateError = submitted && (!isIsoDate(date) || date > todayIso()) ? 'Укажите дату не позже сегодняшней' : undefined;
  const visits = (bundles ?? [])
    .map((b) => b.visit)
    .filter((v) => !v.deleted && v.status === 'confirmed')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);

  const close = () => {
    setDate(todayIso());
    setVisitId('');
    setSubmitted(false);
    onClose();
  };
  const save = async () => {
    setSubmitted(true);
    if (!repair || !isIsoDate(date) || date > todayIso()) return;
    await markRepairDone(getDb(), repair.id, date, visitId || null);
    close();
  };

  return (
    <Dialog
      open={repair !== null}
      title="Ремонт сделан"
      onClose={close}
      onSubmit={() => void save()}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={close}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary">
            Сохранить
          </button>
        </>
      }
    >
      <p className="hint">{repair?.title}</p>
      <TextField label="Когда" type="date" value={date} max={todayIso()} error={dateError} onChange={(e) => setDate(e.target.value)} />
      <SelectField
        label="Визит (необязательно)"
        value={visitId}
        hint="Если ремонт внесён в «Историю», выберите визит — из записи будет ссылка на него"
        onChange={(e) => {
          setVisitId(e.target.value);
          const v = visits.find((x) => x.id === e.target.value);
          if (v) setDate(v.date);
        }}
      >
        <option value="">— не выбран —</option>
        {visits.map((v) => (
          <option key={v.id} value={v.id}>
            {formatDate(v.date)}
            {v.kind === 'self' ? ' · своя работа' : v.shop.name ? ` · ${v.shop.name}` : ''}
          </option>
        ))}
      </SelectField>
    </Dialog>
  );
}
