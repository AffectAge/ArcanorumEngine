import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RegistrationInputSchema, type RegistrationInput } from '@arcanorum/shared';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../state/auth-store.js';
import { AuthShell } from '../../ui/AuthShell.js';
import { Button } from '../../ui/Button.js';
import { FormField } from '../../ui/FormField.js';
import { PasswordField } from '../../ui/PasswordField.js';
import { TextField } from '../../ui/TextField.js';
import { getAuthErrorMessage, translateZodErrors } from './auth-form-utils.js';

const INITIAL_VALUES: RegistrationInput = {
  login: '',
  countryName: '',
  password: '',
  passwordConfirmation: '',
};

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const register = useAuthStore((state) => state.register);
  const [values, setValues] = useState<RegistrationInput>(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validation = RegistrationInputSchema.safeParse(values);
    if (!validation.success) {
      setFieldErrors(translateZodErrors(validation.error, t));
      setFormError(t('auth.errors.VALIDATION_ERROR'));
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError(undefined);

    try {
      await register(values);
      await navigate('/game', { replace: true });
    } catch (error) {
      const result = getAuthErrorMessage(error, t);
      setFieldErrors({ ...result.fields });
      setFormError(result.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title={t('auth.register.title')}
      description={t('auth.register.description')}
      footer={<Link to="/login">{t('auth.register.loginLink')}</Link>}
    >
      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {formError ? (
          <p className="auth-form__error" role="alert">
            {formError}
          </p>
        ) : null}
        <FormField id="login" label={t('auth.fields.login')} error={fieldErrors.login}>
          <TextField
            id="login"
            name="login"
            autoComplete="username"
            value={values.login}
            invalid={fieldErrors.login !== undefined}
            onChange={(event) => setValues((current) => ({ ...current, login: event.target.value }))}
          />
        </FormField>
        <FormField id="country-name" label={t('auth.fields.countryName')} error={fieldErrors.countryName}>
          <TextField
            id="country-name"
            name="countryName"
            autoComplete="organization"
            value={values.countryName}
            invalid={fieldErrors.countryName !== undefined}
            onChange={(event) => setValues((current) => ({ ...current, countryName: event.target.value }))}
          />
        </FormField>
        <FormField id="password" label={t('auth.fields.password')} error={fieldErrors.password}>
          <PasswordField
            id="password"
            name="password"
            autoComplete="new-password"
            value={values.password}
            invalid={fieldErrors.password !== undefined}
            onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
          />
        </FormField>
        <FormField
          id="password-confirmation"
          label={t('auth.fields.passwordConfirmation')}
          error={fieldErrors.passwordConfirmation}
        >
          <PasswordField
            id="password-confirmation"
            name="passwordConfirmation"
            autoComplete="new-password"
            value={values.passwordConfirmation}
            invalid={fieldErrors.passwordConfirmation !== undefined}
            onChange={(event) =>
              setValues((current) => ({ ...current, passwordConfirmation: event.target.value }))
            }
          />
        </FormField>
        <Button type="submit" loading={submitting}>
          {t('auth.register.submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
