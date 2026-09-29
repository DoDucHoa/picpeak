import { describe, expect, it, vi } from 'vitest';
import { buildEventPayload, runSave, validateDraft } from '../saveDraft';
import { eventFormValues } from '../serverValues';
import { fieldKey, type DraftState } from '../eventDraft';
import type { Event } from '../../../../../types';

const event = {
  id: 1, slug: 's', event_name: 'E', event_type: 'wedding', event_date: '2026-01-01',
  customer_name: 'Anna', customer_email: 'anna@example.com', require_password: true,
  header_style: 'standard', hero_divider_style: 'wave', color_theme: null,
} as unknown as Event;
const server = eventFormValues(event);
const theme = { config: { headerStyle: 'standard', heroDividerStyle: 'wave', primaryColor: '#111' } as never, preset: 'custom' };

describe('buildEventPayload', () => {
  it('sends only the changed keys', () => {
    const form = { ...server, welcome_message: 'Hi' };
    expect(buildEventPayload(new Set(['welcome_message']), form, theme, theme)).toEqual({ welcome_message: 'Hi' });
  });
  it('sends customer_account_ids only when the picker changed', () => {
    const form = { ...server, customer_accounts: [{ id: 3, email: 'c@x', displayName: null }] };
    expect(buildEventPayload(new Set(['welcome_message']), form, theme, theme)).not.toHaveProperty('customer_account_ids');
    expect(buildEventPayload(new Set(['customer_accounts']), form, theme, theme)).toEqual({ customer_account_ids: [3] });
  });
  it('clears the customer email and name with null', () => {
    const form = { ...server, customer_email: '  ', customer_name: '' };
    expect(buildEventPayload(new Set(['customer_email', 'customer_name']), form, theme, theme))
      .toEqual({ customer_email: null, customer_name: null });
  });
  it('sends a new password as password and never its confirmation', () => {
    const form = { ...server, new_password: 'secret1', confirm_new_password: 'secret1' };
    expect(buildEventPayload(new Set(['new_password', 'confirm_new_password']), form, theme, theme)).toEqual({ password: 'secret1' });
  });
  it('sends only the header style when only the header style changed', () => {
    const next = { ...theme, config: { ...theme.config, headerStyle: 'hero' } as never };
    expect(buildEventPayload(new Set(['__theme']), server, next, theme)).toEqual({ header_style: 'hero' });
  });
  it('sends the theme when the look changed', () => {
    const next = { ...theme, config: { ...theme.config, primaryColor: '#222' } as never };
    const out = buildEventPayload(new Set(['__theme']), server, next, theme);
    expect(JSON.parse(out.color_theme as string).primaryColor).toBe('#222');
    expect(out).not.toHaveProperty('header_style');
  });
  it('keeps the grouped fields consistent', () => {
    const form = { ...server, source_mode: 'reference' as const, external_path: ' /mnt/a ', external_watch: true };
    expect(buildEventPayload(new Set(['external_path']), form, theme, theme))
      .toEqual({ source_mode: 'reference', external_path: '/mnt/a', external_watch: true });
    const promo = { ...server, promo_mode: 'off' as const, promo_markdown: 'x' };
    expect(buildEventPayload(new Set(['promo_mode']), promo, theme, theme)).toEqual({ promo_mode: 'off', promo_markdown: null });
  });
  it('turns an empty photo limit and expiry into null', () => {
    const form = { ...server, photo_cap: 0, expires_at: '' };
    expect(buildEventPayload(new Set(['photo_cap', 'expires_at']), form, theme, theme)).toEqual({ photo_cap: null, expires_at: null });
  });
});

describe('validateDraft', () => {
  it('asks for a password when protection is newly turned on without one', () => {
    const s = { ...server, require_password: false };
    const form = { ...s, require_password: true };
    expect(validateDraft(new Set(['require_password']), form, s)?.key).toBe('events.newPasswordRequired');
  });
  it('checks length and confirmation of a new password', () => {
    expect(validateDraft(new Set(['new_password']), { ...server, new_password: 'abc', confirm_new_password: 'abc' }, server)?.key).toBe('validation.passwordMinLength');
    expect(validateDraft(new Set(['new_password']), { ...server, new_password: 'abcdef', confirm_new_password: 'x' }, server)?.key).toBe('validation.passwordsDoNotMatch');
  });
  it('asks for a folder in reference mode', () => {
    const form = { ...server, source_mode: 'reference' as const, external_path: '' };
    expect(validateDraft(new Set(['source_mode']), form, server)?.key).toBe('events.externalFolderRequired');
  });
  it('lets an unrelated change through on a protected event', () => {
    expect(validateDraft(new Set(['welcome_message']), { ...server, welcome_message: 'x' }, server)).toBeNull();
  });
});

describe('runSave', () => {
  const state: DraftState = {
    [fieldKey('event', 'welcome_message')]: { base: '', value: 'Hi' },
    [fieldKey('feedback', 'allow_likes')]: { base: false, value: true },
    [fieldKey('resolution', 'download_allow_original')]: { base: null, value: false },
  };
  const api = () => ({
    updateEvent: vi.fn(async () => ({})), updateFeedback: vi.fn(async () => ({})),
    updateQuota: vi.fn(async () => ({})), updateResolution: vi.fn(async () => ({})),
  });

  it('sends the parts in order and skips an unchanged part', async () => {
    const a = api(); const calls: string[] = [];
    a.updateEvent.mockImplementation(async () => { calls.push('event'); return {}; });
    a.updateFeedback.mockImplementation(async () => { calls.push('feedback'); return {}; });
    a.updateResolution.mockImplementation(async () => { calls.push('resolution'); return {}; });
    const r = await runSave(state, () => ({ welcome_message: 'Hi' }), a);
    expect(calls).toEqual(['event', 'feedback', 'resolution']);
    expect(a.updateQuota).not.toHaveBeenCalled();
    expect(a.updateFeedback).toHaveBeenCalledWith({ allow_likes: true });
    expect(r).toEqual({ saved: ['event', 'feedback', 'resolution'], failed: null });
  });

  it('stops at a failing request and reports what saved', async () => {
    const a = api(); const boom = new Error('500');
    a.updateFeedback.mockRejectedValue(boom);
    const r = await runSave(state, () => ({ welcome_message: 'Hi' }), a);
    expect(r).toEqual({ saved: ['event'], failed: { part: 'feedback', error: boom } });
    expect(a.updateResolution).not.toHaveBeenCalled();
  });

  it('sends nothing for an event part that builds an empty payload', async () => {
    const a = api();
    const only: DraftState = { [fieldKey('event', 'confirm_new_password')]: { base: '', value: 'x' } };
    const r = await runSave(only, () => ({}), a);
    expect(a.updateEvent).not.toHaveBeenCalled();
    expect(r.saved).toEqual(['event']);
  });
});
