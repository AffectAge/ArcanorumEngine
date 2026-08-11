import { describe, expect, it } from 'vitest';
import { AUTH_ERROR_CODES } from '@arcanorum/shared';
import { resources } from './resources.js';

describe('auth localizations', () => {
  it('contains matching primary auth sections for English and Russian', () => {
    expect(Object.keys(resources.en.translation.auth)).toEqual(Object.keys(resources.ru.translation.auth));
    expect(Object.keys(resources.en.translation.validation)).toEqual(
      Object.keys(resources.ru.translation.validation),
    );
  });

  it('translates every machine-readable authentication error code', () => {
    const englishCodes = Object.keys(resources.en.translation.auth.errors);
    const russianCodes = Object.keys(resources.ru.translation.auth.errors);

    expect(englishCodes).toEqual(russianCodes);
    expect(englishCodes).toEqual(expect.arrayContaining([...AUTH_ERROR_CODES]));
  });
});
