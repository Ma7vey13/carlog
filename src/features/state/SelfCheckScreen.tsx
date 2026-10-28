import { useMemo, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import { todayIso } from '../../core/dates';
import { formatDate } from '../../core/format';
import type { Id, SelfCheckItem } from '../../core/model';
import { selfCheckAll, selfCheckText, type SelfCheckState, type SelfCheckStatus } from '../../core/selfCheck';
import { parseKm } from '../../core/visitForm';
import { getDb } from '../../db/db';
import { useSelfCheckItems, useSelfCheckLogs } from '../../db/hooks';
import { deleteSelfCheckItem, deleteSelfCheckLog, logSelfCheck, saveSelfCheckItem } from '../../db/selfCheck';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { TextAreaField, TextField } from '../../ui/Field';
import { PlusIcon } from '../../ui/icons';

/** Row colours: attention is red, due is yellow, ok is green (same dots as the schedule). */
export const SELF_CHECK_ROW: Record<SelfCheckState, 'red' | 'yellow' | 'green'> = { attention: 'red', due: 'yellow', ok: 'green' };

export function useSelfCheck(): SelfCheckStatus[] | undefined {
  const items = useSelfCheckItems();
  const logs = useSelfCheckLogs();
  const today = todayIso();
  return useMemo(() => (items && logs ? selfCheckAll(items, logs, today) : undefined), [items, logs, today]);
}

/** `/state/self-check`, `/state/self-check/new`, `/state/self-check/<id>`. */
export function SelfCheckScreen({ id }: { id: Id | null }) {
  if (id === 'new') return <NewSelfCheckItem />;
  if (id) return <SelfCheckItemPage id={id} />;
  return <SelfCheckList />;
}

function SelfCheckList() {
  usePageHeader('Самопроверка', hrefFor('/'));
  const list = useSelfCheck();
  const [attentionFor, setAttentionFor] = useState<SelfCheckItem | null>(null);
  if (!list) return <p className="muted">Загрузка…</p>;

  return (
    <div className="stack">
      <p className="hint">То, что можно проверить самому. «Нужно внимание» висит на главном экране, пока не отметите «В норме».</p>
      <ul className="check-list" data-testid="self-check-list">
        {list.map((s) => (
          <SelfCheckRow key={s.item.id} s={s} onAttention={() => setAttentionFor(s.item)} />
        ))}
      </ul>
      <a className="btn btn--secondary" href={hrefFor('/state/self-check/new')} style={{ justifySelf: 'start' }}>
        <PlusIcon /> Добавить пункт
      </a>
      <AttentionDialog item={attentionFor} onClose={() => setAttentionFor(null)} />
    </div>
  );
}

function SelfCheckRow({ s, onAttention, inList = true }: { s: SelfCheckStatus; onAttention: () => void; inList?: boolean }) {
  const [saving, setSaving] = useState(false);
  return (
    <li className={`card check-row sched-row--${SELF_CHECK_ROW[s.state]}`} data-testid="self-check-row" data-state={s.state}>
      <div className="check-row__head">
        <span className="sched-dot" aria-hidden="true" />
        <div className="check-row__body">
          {inList && <p className="check-row__name">{s.item.name}</p>}
          <p className="sched-row__due">{selfCheckText(s)}</p>
        </div>
      </div>
      {s.item.howTo && (
        <details className="line__more" open={!inList || undefined}>
          <summary>Как проверить</summary>
          <p className="hint">{s.item.howTo}</p>
        </details>
      )}
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary btn--small"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void logSelfCheck(getDb(), s.item.id, 'ok').finally(() => setSaving(false));
          }}
        >
          В норме
        </button>
        <button type="button" className="btn btn--secondary btn--small" onClick={onAttention}>
          Нужно внимание
        </button>
        {inList && (
          <a className="check-row__more" href={hrefFor(`/state/self-check/${s.item.id}`)}>
            Журнал ›
          </a>
        )}
      </div>
    </li>
  );
}

function AttentionDialog({ item, onClose }: { item: SelfCheckItem | null; onClose: () => void }) {
  const [note, setNote] = useState('');
  const close = () => {
    setNote('');
    onClose();
  };
  return (
    <Dialog
      open={item !== null}
      title="Нужно внимание"
      onClose={close}
      onSubmit={() => {
        if (item) void logSelfCheck(getDb(), item.id, 'attention', note).then(close);
      }}
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
      <p className="hint">{item?.name}</p>
      <TextAreaField label="Что не так" rows={3} value={note} placeholder="например: уровень у MIN, долить" onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  );
}

function SelfCheckItemPage({ id }: { id: Id }) {
  const list = useSelfCheck();
  const s = list?.find((x) => x.item.id === id);
  usePageHeader(s?.item.name ?? 'Пункт самопроверки', hrefFor('/state/self-check'));
  const [attention, setAttention] = useState<SelfCheckItem | null>(null);
  const [deletingLog, setDeletingLog] = useState<Id | null>(null);

  if (!list) return <p className="muted">Загрузка…</p>;
  if (!s) {
    return (
      <p>
        Пункт не найден. <a href={hrefFor('/state/self-check')}>К самопроверке</a>
      </p>
    );
  }

  return (
    <div className="stack">
      <ul className="check-list">
        <SelfCheckRow s={s} inList={false} onAttention={() => setAttention(s.item)} />
      </ul>
      <section className="card" aria-label="Журнал">
        <h2 className="card__title">Журнал</h2>
        {s.logs.length === 0 ? (
          <p className="hint">Отметок пока нет.</p>
        ) : (
          <ul className="exec-list" data-testid="self-check-log">
            {s.logs.map((l) => (
              <li key={l.id} className="exec-row">
                <div className="exec-row__top">
                  <span className="exec-row__when">
                    {formatDate(l.date)} — {l.result === 'ok' ? 'в норме' : 'нужно внимание'}
                  </span>
                  <button type="button" className="link-btn" onClick={() => setDeletingLog(l.id)}>
                    удалить
                  </button>
                </div>
                {l.note && <span className="hint">{l.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <SelfCheckItemEditor item={s.item} embedded />
      <AttentionDialog item={attention} onClose={() => setAttention(null)} />
      <ConfirmDialog
        open={deletingLog !== null}
        title="Удалить отметку?"
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          if (deletingLog) void deleteSelfCheckLog(getDb(), deletingLog);
          setDeletingLog(null);
        }}
        onCancel={() => setDeletingLog(null)}
      >
        <p>Отметка исчезнет из журнала.</p>
      </ConfirmDialog>
    </div>
  );
}

function NewSelfCheckItem() {
  usePageHeader('Новый пункт самопроверки', hrefFor('/state/self-check'));
  return <SelfCheckItemEditor item={null} />;
}

function SelfCheckItemEditor({ item, embedded = false }: { item: SelfCheckItem | null; embedded?: boolean }) {
  const [name, setName] = useState(item?.name ?? '');
  const [period, setPeriod] = useState(item ? String(item.periodDays) : '30');
  const [howTo, setHowTo] = useState(item?.howTo ?? '');
  const [errors, setErrors] = useState<{ name?: string; period?: string }>({});
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    const days = parseKm(period);
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Укажите, что проверять';
    if (days === null || days < 1 || days > 730) next.period = 'Целое число дней от 1 до 730';
    setErrors(next);
    if (Object.keys(next).length) return;
    const id = await saveSelfCheckItem(getDb(), item?.id ?? null, { name: name.trim(), periodDays: days!, howTo: howTo.trim() });
    if (item) setSaved(true);
    else window.location.replace(hrefFor(`/state/self-check/${id}`));
  };

  return (
    <form
      className="card"
      noValidate
      aria-label="Настройки пункта"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {embedded && <h2 className="card__title">Настройки пункта</h2>}
      <TextField label="Что проверять" value={name} error={errors.name} onChange={(e) => (setName(e.target.value), setSaved(false))} />
      <TextField label="Раз в, дней" inputMode="numeric" value={period} error={errors.period} onChange={(e) => (setPeriod(e.target.value), setSaved(false))} />
      <TextAreaField label="Как проверить" rows={3} value={howTo} onChange={(e) => (setHowTo(e.target.value), setSaved(false))} />
      <div className="btn-row">
        <button type="submit" className="btn btn--primary">
          Сохранить
        </button>
        {item && (
          <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmDelete(true)}>
            Удалить пункт
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
        title="Удалить пункт?"
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          setConfirmDelete(false);
          if (item) void deleteSelfCheckItem(getDb(), item.id).then(() => window.location.replace(hrefFor('/state/self-check')));
        }}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>«{item?.name}» исчезнет из самопроверки вместе с напоминаниями.</p>
      </ConfirmDialog>
    </form>
  );
}

