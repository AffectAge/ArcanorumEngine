import { zodIssuesToFieldErrors } from '@arcanorum/shared';
import type { TFunction } from 'i18next';
import type { ZodError } from 'zod';
import { AuthApiError } from '../../api/auth-api.js';

export function translateZodErrors(error: ZodError, t: TFunction): Record<string, string> {
  const messages = zodIssuesToFieldErrors(error);
  return Object.fromEntries(Object.entries(messages).map(([field, key]) => [field, t(`validation.${key}`)]));
}

export function getAuthErrorMessage(
  error: unknown,
  t: TFunction,
): {
  readonly message: string;
  readonly fields: Readonly<Record<string, string>>;
} {
  if (!(error instanceof AuthApiError)) {
    return { message: t('auth.errors.generic'), fields: {} };
  }

  const fields = translateServerFieldErrors(error, t);
  const message = t(`auth.errors.${error.code}`, { defaultValue: t('auth.errors.generic') });
  return { message, fields };
}

function translateServerFieldErrors(error: AuthApiError, t: TFunction): Readonly<Record<string, string>> {
  if (error.code === 'LOGIN_TAKEN') {
    return { login: t('auth.errors.LOGIN_TAKEN') };
  }

  if (error.code === 'COUNTRY_NAME_TAKEN') {
    return { countryName: t('auth.errors.COUNTRY_NAME_TAKEN') };
  }

  if (error.fields === undefined) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(error.fields).map(([field, key]) => [field, t(`validation.${key}`)]),
  );
}
