import { describe, expect, it } from '@jest/globals';
import { editProfileSchema } from '../schemas/user.js';

describe('editProfileSchema currency preference', () => {
  it('accepts preferredCurrency values for supported currencies', () => {
    const { error, value } = editProfileSchema.validate({ preferredCurrency: 'EUR' });

    expect(error).toBeUndefined();
    expect(value.preferredCurrency).toBe('EUR');
  });

  it('rejects unsupported currency values', () => {
    const { error } = editProfileSchema.validate({ preferredCurrency: 'JPY' });

    expect(error).toBeDefined();
  });
});
