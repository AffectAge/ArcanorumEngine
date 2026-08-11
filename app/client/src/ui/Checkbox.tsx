import type { InputHTMLAttributes } from 'react';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  readonly label: string;
};

export function Checkbox({ id, label, ...props }: CheckboxProps) {
  return (
    <label className="checkbox" htmlFor={id}>
      <input {...props} id={id} type="checkbox" className="checkbox__input" />
      <span className="checkbox__box" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}
