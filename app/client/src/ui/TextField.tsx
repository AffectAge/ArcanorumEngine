import type { InputHTMLAttributes, ReactNode } from 'react';

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  readonly invalid?: boolean;
  readonly endAdornment?: ReactNode;
};

export function TextField({ invalid = false, endAdornment, ...props }: TextFieldProps) {
  return (
    <span className={`text-field ${invalid ? 'text-field--invalid' : ''}`.trim()}>
      <input {...props} aria-invalid={invalid || undefined} className="text-field__input" />
      {endAdornment ? <span className="text-field__adornment">{endAdornment}</span> : null}
    </span>
  );
}
