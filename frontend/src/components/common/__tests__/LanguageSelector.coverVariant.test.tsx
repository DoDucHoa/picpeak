import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const changeLanguage = vi.fn();
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'de', changeLanguage } }),
}));

import { LanguageSelector } from '../LanguageSelector';

beforeEach(() => changeLanguage.mockReset());

describe('LanguageSelector on the gallery cover', () => {
  it('reads as the plain language code with a chevron, no flag and no box', () => {
    render(<LanguageSelector variant="cover" />);
    const trigger = screen.getByRole('button', { name: 'Deutsch' });
    expect(trigger.textContent).toBe('DE');
    expect(trigger.className).toContain('cg-lang-trigger');
    expect(trigger.className).not.toContain('border');
    // The chevron is the only drawing in it.
    expect(trigger.querySelectorAll('svg')).toHaveLength(1);
  });

  it('switches language like the standard switcher', () => {
    render(<LanguageSelector variant="cover" />);
    fireEvent.click(screen.getByRole('button', { name: 'Deutsch' }));
    fireEvent.click(screen.getByRole('button', { name: /english/i }));
    expect(changeLanguage).toHaveBeenCalledWith('en');
  });

  it('keeps the flag and globe for every other caller', () => {
    render(<LanguageSelector />);
    const trigger = screen.getByRole('button', { name: 'Deutsch' });
    expect(trigger.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
    expect(trigger.className).toContain('border');
  });
});
