import { useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import type { Settings } from '../../core/model';
import { parseKm } from '../../core/visitForm';
import { getDb } from '../../db/db';
import { useSettings } from '../../db/hooks';
import { updateSettings } from '../../db/regulation';
import { Checkbox, TextField } from '../../ui/Field';

/** "Ещё → Расчёт сроков": severe conditions and the yellow thresholds (SPEC section 9). Synced to all devices. */
export function ScheduleSettingsScreen() {
  usePageHeader('Расчёт сроков', hrefFor('/more'));
  const settings = useSettings();
  if (!settings) return <p className="muted">Загрузка…</p>;
  return <SettingsForm key={settings.updatedAt} settings={settings} />;
}

function SettingsForm({ settings }: { settings: Settings }) {
  const [percent, setPercent] = useState(String(settings.warnPercent));
  const [km, setKm] = useState(String(settings.warnKm));
  const [days, setDays] = useState(String(settings.warnDays));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  // Shown at once; the stored record follows (and re-keys this form when it changes).
  const [severe, setSevere] = useState(settings.severeConditions);

  const save = async () => {
    const p = parseKm(percent);
    const k = parseKm(km);
    const d = parseKm(days);
    const next: Record<string, string> = {};
    if (p === null || p > 50) next.percent = 'От 0 до 50';
    if (k === null || k > 50000) next.km = 'От 0 до 50 000';
    if (d === null || d > 365) next.days = 'От 0 до 365';
    setErrors(next);
    if (Object.keys(next).length) return;
    await updateSettings(getDb(), { warnPercent: p!, warnKm: k!, warnDays: d! });
    setSaved(true);
  };

  return (
    <div className="stack">
      <section className="card">
        <h2 className="card__title">Условия эксплуатации</h2>
        <Checkbox
          label="Тяжёлые условия (пробки, короткие поездки, пыль, буксировка)"
          checked={severe}
          onChange={(severeConditions) => {
            setSevere(severeConditions);
            void updateSettings(getDb(), { severeConditions });
          }}
        />
        <p className="hint">Для пунктов, где задан интервал для тяжёлых условий, сроки считаются по нему.</p>
      </section>

      <form
        className="card"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 className="card__title">Когда предупреждать (жёлтый)</h2>
        <p className="hint">Пункт становится жёлтым, если до срока осталось не больше любого из порогов.</p>
        <div className="grid3">
          <TextField label="% интервала" inputMode="numeric" value={percent} error={errors.percent} onChange={(e) => (setPercent(e.target.value), setSaved(false))} />
          <TextField label="Км" inputMode="numeric" value={km} error={errors.km} onChange={(e) => (setKm(e.target.value), setSaved(false))} />
          <TextField label="Дней" inputMode="numeric" value={days} error={errors.days} onChange={(e) => (setDays(e.target.value), setSaved(false))} />
        </div>
        <div className="btn-row">
          <button type="submit" className="btn btn--primary">
            Сохранить
          </button>
          {saved && (
            <span className="hint" role="status">
              Сохранено
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
