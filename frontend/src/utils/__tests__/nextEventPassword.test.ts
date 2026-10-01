import { describe, expect, it } from 'vitest';
import { generatePasswordSuggestions, nextEventPassword } from '../passwordGenerator';

describe('nextEventPassword', () => {
  it('gives a different password on each regenerate', () => {
    const first = nextEventPassword('Lakeside Wedding', '2026-08-15');
    const second = nextEventPassword('Lakeside Wedding', '2026-08-15', first);
    expect(first.length).toBeGreaterThanOrEqual(6);
    expect(second).not.toBe(first);
  });

  // The venue and date are in the gallery address, so a password built only
  // from them can be guessed on the first try.
  it('never hands out a suggestion built only from the public name and date', () => {
    const guessable = generatePasswordSuggestions({ eventName: 'Lakeside Wedding', eventDate: '2026-08-15' });
    for (let i = 0; i < 20; i += 1) {
      const password = nextEventPassword('Lakeside Wedding', '2026-08-15');
      expect(guessable).not.toContain(password);
      expect(password).toMatch(/-[a-z2-9]{6}$/);
    }
  });
});
