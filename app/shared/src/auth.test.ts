import { describe, expect, it } from 'vitest';
import { parseLoginInput, parseRegistrationInput, RegistrationInputSchema } from './auth.js';

describe('authentication input contracts', () => {
  it('normalizes logins and country names deterministically', () => {
    const input = parseRegistrationInput({
      login: 'Player_One',
      countryName: '  Российская Империя  ',
      password: 'A secure long password',
      passwordConfirmation: 'A secure long password',
    });

    expect(input.loginNormalized).toBe('player_one');
    expect(input.countryNameDisplay).toBe('Российская Империя');
    expect(input.countryNameNormalized).toBe('российская империя');
  });

  it('rejects a short password and mismatched confirmation', () => {
    const result = RegistrationInputSchema.safeParse({
      login: 'player_one',
      countryName: 'France',
      password: 'short',
      passwordConfirmation: 'other',
    });

    expect(result.success).toBe(false);
  });

  it('requires a boolean rememberMe value', () => {
    expect(() =>
      parseLoginInput({
        login: 'player_one',
        password: 'A secure long password',
        rememberMe: 'true',
      }),
    ).toThrow();
  });
});
