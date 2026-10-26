import { useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import type { ExpectedPartRule } from '../../core/model';
import { getDb } from '../../db/db';
import { deleteExpectedPartRule, saveExpectedPartRule, splitKeywords } from '../../db/expectedParts';
import { useExpectedPartRules } from '../../db/hooks';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/Field';
import { EditIcon, PlusIcon, TrashIcon } from '../../ui/icons';

type Draft = { id: string | null; label: string; work: string; parts: string; partName: string };
const EMPTY: Draft = { id: null, label: '', work: '', parts: '', partName: '' };

/** Editable list of "work → expected part" pairs for the "запчасть клиента?" check (SPEC section 7, item 6). */
export function PartRulesScreen() {
  usePageHeader('Работа → запчасть', hrefFor('/more'));
  const rules = useExpectedPartRules();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [deleting, setDeleting] = useState<ExpectedPartRule | null>(null);

  if (!rules) return <p className="muted">Загрузка…</p>;

  const open = (d: Draft) => {
    setEditing(d);
    setSubmitted(false);
  };
  const valid = editing && editing.label.trim() && splitKeywords(editing.work).length && splitKeywords(editing.parts).length && editing.partName.trim();

  const save = async () => {
    setSubmitted(true);
    if (!editing || !valid) return;
    await saveExpectedPartRule(getDb(), editing.id, {
      label: editing.label.trim(),
      workKeywords: splitKeywords(editing.work),
      partKeywords: splitKeywords(editing.parts),
      partName: editing.partName.trim(),
    });
    setEditing(null);
  };

  const err = (v: string, msg: string) => (submitted && !v.trim() ? msg : undefined);

  return (
    <div className="stack">
      <p className="hint">
        Если в документе есть работа, а нужной запчасти нет, экран проверки спросит: «Запчасть клиента?». Слова работы должны встретиться все,
        слов запчасти — хотя бы одно. Окончания не важны: «масла» найдёт и «масло».
      </p>
      <button type="button" className="btn btn--primary" style={{ justifySelf: 'start' }} onClick={() => open(EMPTY)}>
        <PlusIcon width={18} height={18} /> Добавить правило
      </button>
      <ul className="component-list" aria-label="Правила">
        {rules.map((r) => (
          <li key={r.id} className="component-row rule-row">
            <span className="component-row__name">
              <strong>{r.label}</strong>
              <span className="muted rule-row__words">
                работа: {r.workKeywords.join(', ')} → запчасть: {r.partKeywords.join(', ')}
              </span>
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Изменить «${r.label}»`}
              onClick={() => open({ id: r.id, label: r.label, work: r.workKeywords.join(', '), parts: r.partKeywords.join(', '), partName: r.partName })}
            >
              <EditIcon width={20} height={20} />
            </button>
            <button type="button" className="icon-btn" aria-label={`Удалить «${r.label}»`} onClick={() => setDeleting(r)}>
              <TrashIcon width={20} height={20} />
            </button>
          </li>
        ))}
      </ul>

      <Dialog
        open={editing !== null}
        title={editing?.id ? 'Изменить правило' : 'Новое правило'}
        onClose={() => setEditing(null)}
        onSubmit={() => void save()}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
              Отмена
            </button>
            <button type="submit" className="btn btn--primary">
              Сохранить
            </button>
          </>
        }
      >
        {editing && (
          <>
            <TextField label="Название" value={editing.label} error={err(editing.label, 'Введите название')} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
            <TextField
              label="Слова в работе (все), через запятую"
              value={editing.work}
              placeholder="замена, масла, двигателе"
              error={err(editing.work, 'Хотя бы одно слово')}
              onChange={(e) => setEditing({ ...editing, work: e.target.value })}
            />
            <TextField
              label="Слова в запчасти (любое), через запятую"
              value={editing.parts}
              placeholder="масло мот, 5w30"
              error={err(editing.parts, 'Хотя бы одно слово')}
              onChange={(e) => setEditing({ ...editing, parts: e.target.value })}
            />
            <TextField
              label="Какую строку добавить"
              value={editing.partName}
              placeholder="Масло моторное"
              error={err(editing.partName, 'Введите название строки')}
              onChange={(e) => setEditing({ ...editing, partName: e.target.value })}
            />
          </>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Удалить правило?"
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          if (deleting) void deleteExpectedPartRule(getDb(), deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      >
        <p>«{deleting?.label}» больше не будет проверяться.</p>
      </ConfirmDialog>
    </div>
  );
}
