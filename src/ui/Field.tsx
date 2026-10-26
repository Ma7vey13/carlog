import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldShellProps {
  label: string;
  error?: string | undefined;
  warning?: string | undefined;
  hint?: ReactNode;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

/** Label + control + error/warning/hint text, wired for screen readers. */
export function FieldShell({ label, error, warning, hint, className, children }: FieldShellProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  const message = error ?? warning;
  return (
    <div className={['field', error ? 'field--error' : warning ? 'field--warning' : '', className ?? ''].join(' ').trim()}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children(id, message || hint ? msgId : undefined)}
      {message ? (
        <p className="field__msg" id={msgId} role={error ? 'alert' : undefined}>
          {message}
        </p>
      ) : hint ? (
        <p className="field__hint" id={msgId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type Common = { label: string; error?: string | undefined; warning?: string | undefined; hint?: ReactNode; className?: string };

export function TextField({ label, error, warning, hint, className, ...input }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} error={error} warning={warning} hint={hint} className={className}>
      {(id, describedBy) => (
        <input id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      )}
    </FieldShell>
  );
}

export function SelectField({ label, error, warning, hint, className, children, ...select }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell label={label} error={error} warning={warning} hint={hint} className={className}>
      {(id, describedBy) => (
        <select id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...select}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

export function TextAreaField({ label, error, warning, hint, className, ...area }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} error={error} warning={warning} hint={hint} className={className}>
      {(id, describedBy) => <textarea id={id} className="input" aria-describedby={describedBy} {...area} />}
    </FieldShell>
  );
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
