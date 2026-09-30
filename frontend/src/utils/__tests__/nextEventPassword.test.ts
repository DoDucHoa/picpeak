import { describe, expect, it } from 'vitest';
import { nextEventPassword } from '../passwordGenerator';

describe('nextEventPassword', () => {
  it('gives a different password on each regenerate', () => {
    const first = nextEventPassword('Lakeside Wedding', '2026-08-15');
    const second = nextEventPassword('Lakeside Wedding', '2026-08-15', first);
    expect(first.length).toBeGreaterThanOrEqual(6);
    expect(second).not.toBe(first);
  });
});
