import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  /** Small note about when the screen gets its content. */
  note?: string;
}

export function EmptyState({ icon, title, children, note }: Props) {
  return (
    <section className="empty">
      <div className="empty__icon">{icon}</div>
      <h2 className="empty__title">{title}</h2>
      <div className="empty__text">{children}</div>
      {note && <p className="empty__note">{note}</p>}
    </section>
  );
}
