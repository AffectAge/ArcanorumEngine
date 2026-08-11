import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly children: ReactNode;
  readonly variant?: 'primary' | 'secondary' | 'danger';
  readonly loading?: boolean;
};

export function Button({ children, variant = 'primary', loading = false, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`button button--${variant} ${props.className ?? ''}`.trim()}
      disabled={disabled || loading}
    >
      {loading ? <span className="button__loading" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}
