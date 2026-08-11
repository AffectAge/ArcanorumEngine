import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InputHTMLAttributes } from 'react';
import { TextField } from './TextField.js';

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  readonly invalid?: boolean;
};

export function PasswordField({ invalid = false, ...props }: PasswordFieldProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      invalid={invalid}
      endAdornment={
        <button
          type="button"
          className="password-field__toggle"
          aria-label={t(visible ? 'auth.actions.hidePassword' : 'auth.actions.showPassword')}
          onClick={() => setVisible((current) => !current)}
        >
          {t(visible ? 'auth.actions.hidePassword' : 'auth.actions.showPassword')}
        </button>
      }
    />
  );
}
