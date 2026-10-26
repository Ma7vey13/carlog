import { useState } from 'react';
import { isIsoDate, todayIso } from '../../core/dates';
import { parseKm } from '../../core/visitForm';
import { getDb } from '../../db/db';
import { addManualMileage } from '../../db/visits';
import { Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/Field';

/** "Отметить пробег": a manual odometer reading. The quick field on the main screen comes in stage 6. */
export function MileageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [date, setDate] = useState(todayIso());
  const [km, setKm] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const kmValue = parseKm(km);
  const dateError = submitted && !isIsoDate(date) ? 'Укажите дату' : undefined;
  const kmError = submitted && kmValue === null ? 'Целое число километров, например 310500' : undefined;

  const close = () => {
    setKm('');
    setDate(todayIso());
    setSubmitted(false);
    onClose();
  };

  const save = async () => {
    setSubmitted(true);
    if (kmValue === null || !isIsoDate(date)) return;
    await addManualMileage(getDb(), date, kmValue);
    close();
  };

  return (
    <Dialog
      open={open}
      title="Отметить пробег"
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
      <TextField label="Пробег, км" inputMode="numeric" autoFocus value={km} error={kmError} onChange={(e) => setKm(e.target.value)} />
      <TextField label="Дата" type="date" value={date} error={dateError} onChange={(e) => setDate(e.target.value)} />
    </Dialog>
  );
}
