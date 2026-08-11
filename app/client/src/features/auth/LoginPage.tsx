import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LoginInputSchema, type LoginInput } from '@arcanorum/shared';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../state/auth-store.js';
import { AuthShell } from '../../ui/AuthShell.js';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { FormField } from '../../ui/FormField.js';
import { PasswordField } from '../../ui/PasswordField.js';
import { TextField } from '../../ui/TextField.js';
import { getAuthErrorMessage, translateZodErrors } from './auth-form-utils.js';

const INITIAL_VALUES: LoginInput = {
  login: '',
  password: '',
  rememberMe: false,
};

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [values, setValues] = useState<LoginInput>(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validation = LoginInputSchema.safeParse(values);
    if (!validation.success) {
      setFieldErrors(translateZodErrors(validation.error, t));
      setFormError(t('auth.errors.VALIDATION_ERROR'));
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError(undefined);

    try {
      await login(values);
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
      title={t('auth.login.title')}
      description={t('auth.login.description')}
      footer={<Link to="/register">{t('auth.login.registerLink')}</Link>}
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
        <FormField id="password" label={t('auth.fields.password')} error={fieldErrors.password}>
          <PasswordField
            id="password"
            name="password"
            autoComplete="current-password"
            value={values.password}
            invalid={fieldErrors.password !== undefined}
            onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
          />
        </FormField>
        <Checkbox
          id="remember-me"
          name="rememberMe"
          checked={values.rememberMe}
          label={t('auth.login.rememberMe')}
          onChange={(event) => setValues((current) => ({ ...current, rememberMe: event.target.checked }))}
        />
        <Button type="submit" loading={submitting}>
          {t('auth.login.submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
