import { useMemo, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import type { Component } from '../../core/model';
import { addComponent, componentUsage, deleteComponent, renameComponent } from '../../db/components';
import { getDb } from '../../db/db';
import { componentTree, useComponents } from '../../db/hooks';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { SelectField, TextField } from '../../ui/Field';
import { EditIcon, PlusIcon, TrashIcon } from '../../ui/icons';

type Editing = { mode: 'add'; parentId: string } | { mode: 'rename'; component: Component };

export function ComponentsScreen() {
  usePageHeader('Справочник узлов', hrefFor('/more'));
  const components = useComponents();
  const tree = useMemo(() => componentTree(components ?? []), [components]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [deleting, setDeleting] = useState<{ component: Component; usage: number } | null>(null);

  if (!components) return <p className="muted">Загрузка…</p>;

  const open = (e: Editing) => {
    setEditing(e);
    setName(e.mode === 'rename' ? e.component.name : '');
    setSubmitted(false);
  };
  const close = () => setEditing(null);
  const nameError = submitted && name.trim() === '' ? 'Введите название' : undefined;

  const save = async () => {
    setSubmitted(true);
    if (!editing || name.trim() === '') return;
    if (editing.mode === 'add') await addComponent(getDb(), name, editing.parentId || null);
    else await renameComponent(getDb(), editing.component.id, name);
    close();
  };

  const askDelete = async (component: Component) => {
    setDeleting({ component, usage: await componentUsage(getDb(), component.id) });
  };

  return (
    <div className="stack">
      <p className="hint">
        Узлы нужны для фильтра в истории и для привязки строк к регламенту. Можно переименовать, добавить свои и вложить один узел в
        другой.
      </p>
      <button type="button" className="btn btn--primary" style={{ justifySelf: 'start' }} onClick={() => open({ mode: 'add', parentId: '' })}>
        <PlusIcon width={18} height={18} /> Добавить узел
      </button>

      <ul className="component-list" aria-label="Узлы">
        {tree.map(({ component, depth }) => (
          <li key={component.id} className="component-row" style={{ paddingLeft: 12 + depth * 20 }}>
            <span className="component-row__name">{component.name}</span>
            <button type="button" className="icon-btn" aria-label={`Переименовать «${component.name}»`} onClick={() => open({ mode: 'rename', component })}>
              <EditIcon width={20} height={20} />
            </button>
            <button type="button" className="icon-btn" aria-label={`Удалить «${component.name}»`} onClick={() => void askDelete(component)}>
              <TrashIcon width={20} height={20} />
            </button>
          </li>
        ))}
      </ul>

      <Dialog
        open={editing !== null}
        title={editing?.mode === 'rename' ? 'Переименовать узел' : 'Новый узел'}
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
        <TextField label="Название" autoFocus value={name} error={nameError} onChange={(e) => setName(e.target.value)} />
        {editing?.mode === 'add' && (
          <SelectField label="Внутри узла" value={editing.parentId} onChange={(e) => setEditing({ mode: 'add', parentId: e.target.value })}>
            <option value="">— верхний уровень —</option>
            {tree.map(({ component, depth }) => (
              <option key={component.id} value={component.id}>
                {' '.repeat(depth) + component.name}
              </option>
            ))}
          </SelectField>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Удалить узел?"
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          if (deleting) void deleteComponent(getDb(), deleting.component.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      >
        {deleting && (
          <p>
            «{deleting.component.name}» пропадёт из списка.
            {deleting.usage > 0 ? ` Он указан в строках истории: ${deleting.usage}. Эти строки останутся, но без узла.` : ''} Вложенные узлы
            поднимутся на уровень выше.
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
