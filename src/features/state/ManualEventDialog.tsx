import { useState } from 'react';
import { isIsoDate, todayIso } from '../../core/dates';
import type { RegulationItem } from '../../core/model';
import { parseKm } from '../../core/visitForm';
import { getDb } from '../../db/db';
import { saveManualEvent } from '../../db/regulation';
import { Dialog } from '../../ui/Dialog';
import { Checkbox, TextField } from '../../ui/Field';

/**
 * "Отметить, когда делалось" (SPEC section 9): for work without documents, or done long ago.
 * Date and km may be approximate; km may be left empty.
 */
export function ManualEventDialog({ item, onClose }: { item: RegulationItem | null; onClose: () => void }) {
  const [date, setDate] = useState(todayIso());
  const [km, setKm] = useState('');
  const [approximate, setApproximate] = useState(false);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const kmValue = km.trim() ? parseKm(km) : null;
  const dateError = submitted && (!isIsoDate(date) || date > todayIso()) ? 'Укажите дату не позже сегодняшней' : undefined;
  const kmError = submitted && km.trim() && kmValue === null ? 'Целое число километров или пусто' : undefined;

  const close = () => {
    setDate(todayIso());
    setKm('');
    setApproximate(false);
    setNote('');
    setSubmitted(false);
    onClose();
  };

  const save = async () => {
    setSubmitted(true);
    if (!item || !isIsoDate(date) || date > todayIso() || (km.trim() && kmValue === null)) return;
    await saveManualEvent(getDb(), null, { date, km: kmValue, approximate, regulationItemId: item.id, note: note.trim() });
    close();
  };

  return (
    <Dialog
      open={item !== null}
      title="Отметить, когда делалось"
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
      <p className="hint">{item?.name}</p>
      <TextField label="Дата" type="date" value={date} max={todayIso()} error={dateError} onChange={(e) => setDate(e.target.value)} />
      <TextField
        label="Пробег, км"
        inputMode="numeric"
        value={km}
        error={kmError}
        hint="Можно оставить пустым — тогда срок считается только по времени"
        onChange={(e) => setKm(e.target.value)}
      />
      <Checkbox label="Примерно (дату или пробег помню не точно)" checked={approximate} onChange={setApproximate} />
      <TextField label="Заметка" value={note} placeholder="например: менял сам" onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  );
}
