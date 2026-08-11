import { z } from 'zod';

const LOGIN_PATTERN = /^[A-Za-z0-9_]+$/;
const COUNTRY_NAME_PATTERN = /^[\p{L}\p{M}\p{N}](?:[\p{L}\p{M}\p{N}\p{Zs}'’-]*[\p{L}\p{M}\p{N}])?$/u;
const PASSWORD_MIN_LENGTH = 15;
const PASSWORD_MAX_LENGTH = 128;

export const AUTH_ERROR_CODES = [
  'VALIDATION_ERROR',
  'LOGIN_TAKEN',
  'COUNTRY_NAME_TAKEN',
  'INVALID_CREDENTIALS',
  'TOO_MANY_ATTEMPTS',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INTERNAL_ERROR',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type AuthProfile = {
  readonly login: string;
  readonly countryName: string;
};

export type AuthSuccessResponse = {
  readonly player: AuthProfile;
};

export type AuthErrorResponse = {
  readonly error: {
    readonly code: AuthErrorCode;
    readonly fields?: Readonly<Record<string, string>>;
  };
};

export type RegistrationInput = {
  readonly login: string;
  readonly countryName: string;
  readonly password: string;
  readonly passwordConfirmation: string;
};

export type LoginInput = {
  readonly login: string;
  readonly password: string;
  readonly rememberMe: boolean;
};

export type NormalizedRegistrationInput = {
  readonly loginDisplay: string;
  readonly loginNormalized: string;
  readonly countryNameDisplay: string;
  readonly countryNameNormalized: string;
  readonly password: string;
};

export type NormalizedLoginInput = {
  readonly loginNormalized: string;
  readonly password: string;
  readonly rememberMe: boolean;
};

function graphemeCount(value: string): number {
  return [...new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(value)].length;
}

export function normalizeLogin(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

export function normalizeCountryName(value: string): string {
  return value.normalize('NFKC').trim();
}

export function normalizeCountryNameForUniqueness(value: string): string {
  return normalizeCountryName(value).toLowerCase();
}

const loginSchema = z
  .string({ required_error: 'login.required', invalid_type_error: 'login.invalid' })
  .superRefine((value, context) => {
    const normalized = normalizeLogin(value);

    if (normalized.length < 3 || normalized.length > 32) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'login.length' });
    }

    if (!LOGIN_PATTERN.test(normalized)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'login.format' });
    }
  });

const countryNameSchema = z
  .string({ required_error: 'countryName.required', invalid_type_error: 'countryName.invalid' })
  .superRefine((value, context) => {
    const normalized = normalizeCountryName(value);
    const count = graphemeCount(normalized);

    if (count < 3 || count > 48) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'countryName.length' });
    }

    if (!COUNTRY_NAME_PATTERN.test(normalized)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'countryName.format' });
    }
  });

const passwordSchema = z
  .string({ required_error: 'password.required', invalid_type_error: 'password.invalid' })
  .superRefine((value, context) => {
    const count = graphemeCount(value);

    if (count < PASSWORD_MIN_LENGTH || count > PASSWORD_MAX_LENGTH) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'password.length' });
    }
  });

export const RegistrationInputSchema = z
  .object({
    login: loginSchema,
    countryName: countryNameSchema,
    password: passwordSchema,
    passwordConfirmation: z.string({
      required_error: 'passwordConfirmation.required',
      invalid_type_error: 'passwordConfirmation.invalid',
    }),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.password !== value.passwordConfirmation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'passwordConfirmation.mismatch',
        path: ['passwordConfirmation'],
      });
    }
  });

export const LoginInputSchema = z
  .object({
    login: loginSchema,
    password: z.string({ required_error: 'password.required', invalid_type_error: 'password.invalid' }),
    rememberMe: z.boolean({
      required_error: 'rememberMe.required',
      invalid_type_error: 'rememberMe.invalid',
    }),
  })
  .strict();

export function parseRegistrationInput(input: unknown): NormalizedRegistrationInput {
  const parsed = RegistrationInputSchema.parse(input);

  return {
    loginDisplay: parsed.login.normalize('NFKC'),
    loginNormalized: normalizeLogin(parsed.login),
    countryNameDisplay: normalizeCountryName(parsed.countryName),
    countryNameNormalized: normalizeCountryNameForUniqueness(parsed.countryName),
    password: parsed.password,
  };
}

export function parseLoginInput(input: unknown): NormalizedLoginInput {
  const parsed = LoginInputSchema.parse(input);

  return {
    loginNormalized: normalizeLogin(parsed.login),
    password: parsed.password,
    rememberMe: parsed.rememberMe,
  };
}

export function zodIssuesToFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && fieldErrors[field] === undefined) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}

export const AuthSuccessResponseSchema = z.object({
  player: z.object({
    login: z.string(),
    countryName: z.string(),
  }),
});

export const AuthErrorResponseSchema = z.object({
  error: z.object({
    code: z.enum(AUTH_ERROR_CODES),
    fields: z.record(z.string()).optional(),
  }),
});
