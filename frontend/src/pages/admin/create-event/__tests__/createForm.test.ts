import { describe, expect, it } from 'vitest';
import {
  buildCreatePayload, createDefaults, createRequirements, createThemeFields, generatedPassword,
  initialCreateForm, validateCreateForm, type CreateType,
} from '../createForm';
import { expiryFromToday } from '../../event-details/settings/ExpiryField';

const today = new Date(2026, 9, 1);
const types: CreateType[] = [
  { slug: 'birthday', name: 'Birthday', emoji: 'b', themePreset: 'birthdayFun' },
  { slug: 'wedding', name: 'Wedding', emoji: 'w', themePreset: 'elegantWedding' },
  { slug: 'other', name: 'Other', emoji: 'o', themePreset: 'default' },
];
const none = { customerName: false, customerEmail: false, eventDate: false, expiration: false };
const all = { customerName: true, customerEmail: true, eventDate: true, expiration: true };

describe('createDefaults', () => {
  it('preselects wedding when the catalog has it, else the first type', () => {
    expect(createDefaults({}, {}, types, today).type?.slug).toBe('wedding');
    expect(createDefaults({}, {}, [types[0]], today).type?.slug).toBe('birthday');
    expect(createDefaults({}, {}, [], today).type).toBeNull();
  });

  it('takes the expiry days from Settings, and 30 when they are missing or out of range', () => {
    expect(createDefaults({}, { general_default_expiration_days: 45 }, types, today).expiryDays).toBe(45);
    expect(createDefaults({}, { general_default_expiration_days: '60' }, types, today).expiryDays).toBe(60);
    expect(createDefaults({}, undefined, types, today).expiryDays).toBe(30);
    expect(createDefaults({}, { general_default_expiration_days: 0 }, types, today).expiryDays).toBe(30);
  });

  it('seeds the password switch and the feedback from the public defaults', () => {
    const d = createDefaults({
      event_default_require_password: false, event_default_feedback_enabled: true,
      event_default_allow_likes: false, event_default_allow_comments: false,
    }, {}, types, today);
    expect(d.requirePassword).toBe(false);
    expect(d.feedback).toEqual({
      feedback_enabled: true, allow_favorites: true, allow_likes: false, allow_ratings: true,
      allow_comments: false, allow_reactions: true, identity_mode: 'simple',
    });
  });
});

describe('initialCreateForm', () => {
  it('starts with a generated password that passes the rules, and the expiry counted from today', () => {
    const form = initialCreateForm(createDefaults({}, { general_default_expiration_days: 45 }, types, today));
    expect(form.event_type).toBe('wedding');
    expect(form.event_date).toBe('2026-10-01');
    expect(form.require_password).toBe(true);
    expect(form.password.length).toBeGreaterThanOrEqual(6);
    expect(validateCreateForm({ ...form, event_name: 'Anna' }, none)).toEqual({});
    expect(form.expires_at).toBe(expiryFromToday(45, today));
  });

  it('leaves the password empty when Settings do not ask for one', () => {
    const form = initialCreateForm(createDefaults({ event_default_require_password: false }, {}, types, today));
    expect(form.password).toBe('');
  });
});

describe('generatedPassword', () => {
  it('uses the name once typed, and never hands back the current value', () => {
    const form = { ...initialCreateForm(createDefaults({}, {}, types, today)), event_name: 'Anna and Ben' };
    const next = generatedPassword(form, 'Wedding', form.password);
    expect(next).not.toBe(form.password);
    expect(next.length).toBeGreaterThanOrEqual(6);
  });
});

describe('createRequirements', () => {
  it('reads every toggle as required unless Settings turned it off', () => {
    expect(createRequirements({})).toEqual(all);
    expect(createRequirements({ event_require_customer_email: false, event_require_expiration: false }))
      .toEqual({ ...all, customerEmail: false, expiration: false });
  });
});

describe('validateCreateForm', () => {
  const base = () => ({ ...initialCreateForm(createDefaults({}, {}, types, today)), event_name: 'Anna' });

  it('honours the Settings requirements', () => {
    const empty = { ...base(), event_name: ' ', event_date: '', expires_at: '' };
    expect(validateCreateForm(empty, all)).toEqual({
      event_name: 'validation.eventNameRequired', event_date: 'validation.eventDateRequired',
      customer_name: 'validation.hostNameRequired', customer_email: 'validation.hostEmailRequired',
      expires_at: 'validation.expiryRequired',
    });
    expect(validateCreateForm({ ...empty, event_name: 'Anna' }, none)).toEqual({});
  });

  it('checks an optional email only when one is typed', () => {
    expect(validateCreateForm({ ...base(), customer_email: 'not-an-email' }, none))
      .toEqual({ customer_email: 'validation.invalidEmailFormat' });
  });

  it('holds both passwords to six characters and not digits only', () => {
    expect(validateCreateForm({ ...base(), password: 'abc' }, none)).toEqual({ password: 'validation.passwordMinLength' });
    expect(validateCreateForm({ ...base(), password: '123456' }, none)).toEqual({ password: 'validation.passwordTooSimple' });
    expect(validateCreateForm({ ...base(), client_access_enabled: true, client_password: '' }, none))
      .toEqual({ client_password: 'validation.passwordRequired' });
    expect(validateCreateForm({ ...base(), client_access_enabled: true, client_password: '48210099' }, none))
      .toEqual({ client_password: 'validation.passwordTooSimple' });
    expect(validateCreateForm({ ...base(), require_password: false, password: '' }, none)).toEqual({});
  });

  it('wants a folder in reference mode', () => {
    expect(validateCreateForm({ ...base(), source_mode: 'reference', external_path: '' }, none))
      .toEqual({ external_path: 'validation.externalFolderRequired' });
  });
});

describe('createThemeFields (spec 5.5)', () => {
  const branding = { headerStyle: 'hero' as const, heroDividerStyle: 'curve' as const };

  it('stores no theme for a default type, and copies the header styles from Branding', () => {
    expect(createThemeFields('default', branding)).toEqual({ header_style: 'hero', hero_divider_style: 'curve' });
    expect(createThemeFields(undefined, null)).toEqual({});
  });

  it('stores the preset name and its header styles for a type with a preset', () => {
    const fields = createThemeFields('elegantWedding', branding);
    expect(fields.color_theme).toBe('elegantWedding');
    expect(fields).not.toHaveProperty('color_theme', expect.stringContaining('{'));
  });

  it('treats a preset this build does not know as no preset', () => {
    expect(createThemeFields('removedPreset', branding)).toEqual({ header_style: 'hero', hero_divider_style: 'curve' });
  });
});

describe('buildCreatePayload', () => {
  const ctx = { phoneFieldEnabled: false, themePreset: 'default', brandingTheme: null };
  const form = () => ({ ...initialCreateForm(createDefaults({}, {}, types, today)), event_name: ' Anna ' });

  it('sends a date for the expiry, never expiration_days, and no theme for a default type', () => {
    const f = form();
    const payload = buildCreatePayload(f, ctx);
    expect(payload).toMatchObject({ event_type: 'wedding', event_name: 'Anna', require_password: true, source_mode: 'managed', expires_at: f.expires_at });
    expect(payload).not.toHaveProperty('expiration_days');
    expect(payload).not.toHaveProperty('color_theme');
    expect(payload).not.toHaveProperty('customer_account_ids');
    expect(payload).not.toHaveProperty('client_password');
  });

  it('sends null for Never and no password when protection is off', () => {
    const payload = buildCreatePayload({ ...form(), expires_at: '', require_password: false, password: 'typed-before' }, ctx);
    expect(payload.expires_at).toBeNull();
    expect(payload).not.toHaveProperty('password');
  });

  it('drops a folder picked before switching back to managed', () => {
    const payload = buildCreatePayload({ ...form(), source_mode: 'managed', external_path: 'a', external_watch: true }, ctx);
    expect(payload.source_mode).toBe('managed');
    expect(payload).not.toHaveProperty('external_path');
    expect(payload).not.toHaveProperty('external_watch');
  });

  it('sends the folder, the mode toggles and the identity mode', () => {
    const payload = buildCreatePayload({
      ...form(), source_mode: 'reference', external_path: ' a/b ', external_watch: true, photo_cap: 0,
      feedback: { feedback_enabled: true, allow_favorites: true, allow_likes: false, allow_ratings: false, allow_comments: false, allow_reactions: false, identity_mode: 'guest' },
    }, ctx);
    expect(payload).toMatchObject({
      external_path: 'a/b', external_watch: true, photo_cap: null, feedback_enabled: true,
      allow_favorites: true, allow_likes: false, identity_mode: 'guest',
    });
    expect(payload).not.toHaveProperty('allow_color_labels');
  });
});
