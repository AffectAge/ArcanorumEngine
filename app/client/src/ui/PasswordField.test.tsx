import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../i18n/index.js';
import { PasswordField } from './PasswordField.js';

describe('PasswordField', () => {
  it('toggles the password visibility without changing its value', () => {
    render(<PasswordField id="password" value="long password" readOnly />);
    const input = screen.getByDisplayValue('long password');

    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button'));
    expect(input).toHaveAttribute('type', 'text');
  });
});
