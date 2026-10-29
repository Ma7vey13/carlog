import { PURPOSE_LABELS, REGULATION_ACTION_LABELS } from '../../core/labels';
import type { RegulationItem } from '../../core/model';
import { PURPOSES, type Purpose, type VisitPurpose } from '../../core/purpose';

/** "ТО", "Ремонт" or both, as coloured tags; nothing for a visit that is neither. */
export function PurposeTags({ purpose }: { purpose: VisitPurpose }) {
  const shown = PURPOSES.filter((p) => purpose[p]);
  if (shown.length === 0) return null;
  return (
    <span className="kind-tags" data-testid="purpose-tags">
      {shown.map((p) => (
        <PurposeTag key={p} purpose={p} />
      ))}
    </span>
  );
}

export function PurposeTag({ purpose }: { purpose: Purpose }) {
  return <span className={`kind-tag kind-tag--${purpose}`}>{PURPOSE_LABELS[purpose]}</span>;
}

/** "Сам": work the owner does himself (a "Своя работа" visit, a self-check). */
export function SelfTag() {
  return <span className="kind-tag kind-tag--self">Сам</span>;
}

/**
 * A regulation item on the main screen (D-091): "ТО · замена" / "ТО · проверка" when the service
 * does it, "Сам · …" when the owner does.
 */
export function ItemKindTag({ item }: { item: Pick<RegulationItem, 'performer' | 'action'> }) {
  const self = item.performer === 'self';
  return (
    <span className={`kind-tag ${self ? 'kind-tag--self' : 'kind-tag--maintenance'}`} data-testid="item-kind">
      {self ? 'Сам' : 'ТО'} · {REGULATION_ACTION_LABELS[item.action].toLowerCase()}
    </span>
  );
}

/** CSS modifier for the stripe: maintenance, repair or mixed. */
export function purposeClass(prefix: string, purpose: VisitPurpose): string {
  if (purpose.maintenance && purpose.repair) return `${prefix}--mixed`;
  if (purpose.maintenance) return `${prefix}--maintenance`;
  if (purpose.repair) return `${prefix}--repair`;
  return '';
}
