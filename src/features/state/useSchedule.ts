import { useMemo } from 'react';
import type { VisitBundle } from '../../core/bundle';
import { todayIso } from '../../core/dates';
import { mileagePoints, type MileagePoint } from '../../core/mileage';
import type { ManualEvent, RegulationItem, Settings } from '../../core/model';
import { currentMileage, scheduleAll, type CurrentMileage, type ItemSchedule } from '../../core/schedule';
import { useManualEvents, useMileage, useRegulationItems, useSettings, useVisitBundles } from '../../db/hooks';

export interface ScheduleData {
  today: string;
  bundles: VisitBundle[];
  events: ManualEvent[];
  points: MileagePoint[];
  regulation: RegulationItem[];
  settings: Settings;
  current: CurrentMileage | null;
  items: ItemSchedule[];
}

/** Everything the state screen and the cards need; undefined while loading. */
export function useSchedule(): ScheduleData | undefined {
  const bundles = useVisitBundles();
  const mileage = useMileage();
  const events = useManualEvents();
  const regulation = useRegulationItems();
  const settings = useSettings();
  const today = todayIso();

  return useMemo(() => {
    if (!bundles || !mileage || !events || !regulation || !settings) return undefined;
    const points = mileagePoints(mileage);
    const items = scheduleAll(regulation, { bundles, events, points, today, thresholds: settings });
    return { today, bundles, events, points, regulation, settings, current: currentMileage(points, today), items };
  }, [bundles, mileage, events, regulation, settings, today]);
}
