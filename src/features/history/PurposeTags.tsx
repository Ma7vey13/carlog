import { PURPOSE_LABELS } from '../../core/labels';
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

/** CSS modifier for the stripe: maintenance, repair or mixed. */
export function purposeClass(prefix: string, purpose: VisitPurpose): string {
  if (purpose.maintenance && purpose.repair) return `${prefix}--mixed`;
  if (purpose.maintenance) return `${prefix}--maintenance`;
  if (purpose.repair) return `${prefix}--repair`;
  return '';
}
