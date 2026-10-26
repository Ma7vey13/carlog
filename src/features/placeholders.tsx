import { EmptyState } from '../ui/EmptyState';
import { GaugeIcon, RegulationIcon } from '../ui/icons';

// Empty screens of stage 1. Each is replaced by the real screen in its own stage.

export function StateScreen() {
  return (
    <EmptyState icon={<GaugeIcon />} title="Пока нет данных" note="Появится на этапе 6">
      <p>Здесь будет главный экран: текущий пробег, что пора менять и что проверить самому.</p>
    </EmptyState>
  );
}

export function RegulationScreen() {
  return (
    <EmptyState icon={<RegulationIcon />} title="Регламент пуст" note="Редактор — на этапе 6, ваша таблица — на этапе 9">
      <p>Здесь будут пункты ТО с интервалами по пробегу и времени.</p>
    </EmptyState>
  );
}
