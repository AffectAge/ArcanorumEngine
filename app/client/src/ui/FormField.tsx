import type { ReactNode } from 'react';

type FormFieldProps = {
  readonly id: string;
  readonly label: string;
  readonly error?: string | undefined;
  readonly children: ReactNode;
};

export function FormField({ id, label, error, children }: FormFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="form-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
