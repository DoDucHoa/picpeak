import { changesFor, sameValue, type DraftPart, type DraftState } from './eventDraft';
import type { EditFormState, ThemeDraft } from '../types';

const SOURCE = ['source_mode', 'external_path', 'external_watch'];
const PROMO = ['promo_mode', 'promo_markdown'];
const INFO = ['info_mode', 'info_markdown'];
const GROUPED = new Set([...SOURCE, ...PROMO, ...INFO]);

function themePayload(theme: ThemeDraft, server: ThemeDraft): Record<string, unknown> {
  const strip = (c: ThemeDraft['config']) => {
    const { headerStyle: _h, heroDividerStyle: _d, ...rest } = c as Record<string, unknown>;
    return rest;
  };
  const out: Record<string, unknown> = {};
  if (theme.preset !== server.preset || !sameValue(strip(theme.config), strip(server.config))) {
    out.color_theme = theme.preset === 'custom' ? JSON.stringify(theme.config) : theme.preset;
  }
  const c = theme.config as { headerStyle?: string; heroDividerStyle?: string };
  const s = server.config as { headerStyle?: string; heroDividerStyle?: string };
  if ((c.headerStyle || 'standard') !== (s.headerStyle || 'standard')) out.header_style = c.headerStyle || 'standard';
  if ((c.heroDividerStyle || 'wave') !== (s.heroDividerStyle || 'wave')) out.hero_divider_style = c.heroDividerStyle || 'wave';
  return out;
}

/**
 * The event PUT body: only the changed fields (spec 5.2), with the same
 * transforms the old header save applied. Fields that only make sense
 * together are sent together when any one of them changed.
 */
export function buildEventPayload(
  changed: Set<string>, form: EditFormState, theme: ThemeDraft, serverTheme: ThemeDraft,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const any = (group: string[]) => group.some((k) => changed.has(k));
  for (const key of changed) {
    if (GROUPED.has(key)) continue;
    switch (key) {
      case 'new_password': if (form.new_password) out.password = form.new_password; break;
      case 'client_password': if (form.client_password.trim()) out.client_password = form.client_password.trim(); break;
      case 'customer_accounts': out.customer_account_ids = form.customer_accounts.map((c) => c.id); break;
      case 'customer_name': out.customer_name = form.customer_name.trim() || null; break;
      case 'customer_email': out.customer_email = form.customer_email.trim() || null; break;
      case 'customer_phone': out.customer_phone = form.customer_phone.trim() || null; break;
      case 'expires_at': out.expires_at = form.expires_at || null; break;
      case 'photo_cap': out.photo_cap = form.photo_cap > 0 ? form.photo_cap : null; break;
      case '__theme': Object.assign(out, themePayload(theme, serverTheme)); break;
      default: out[key] = (form as unknown as Record<string, unknown>)[key];
    }
  }
  if (any(SOURCE)) {
    const path = form.external_path?.trim() || '';
    out.source_mode = form.source_mode;
    out.external_path = form.source_mode === 'reference' ? path : null;
    out.external_watch = form.source_mode === 'reference' && form.external_watch;
  }
  if (any(PROMO)) {
    out.promo_mode = form.promo_mode;
    out.promo_markdown = form.promo_mode === 'custom' ? form.promo_markdown : null;
  }
  if (any(INFO)) {
    out.info_mode = form.info_mode;
    out.info_markdown = form.info_mode === 'custom' ? form.info_markdown : null;
  }
  return out;
}

/** The old header save's client checks, run only for the fields they guard. */
export function validateDraft(
  changed: Set<string>, form: EditFormState, server: EditFormState,
): { key: string; fallback: string } | null {
  const touchesPassword = ['require_password', 'new_password'].some((k) => changed.has(k));
  if (touchesPassword && form.require_password) {
    if (form.require_password !== server.require_password && !form.new_password) {
      return { key: 'events.newPasswordRequired', fallback: 'Please set a password before enabling protection.' };
    }
    if (form.new_password && form.new_password.length < 6) {
      return { key: 'validation.passwordMinLength', fallback: 'Password must be at least 6 characters' };
    }
  }
  // Client access is a second way into the gallery: the gallery password's
  // floor applies (moved from ClientAccessCard, which used to save at once).
  const candidate = form.client_password?.trim() ?? '';
  if (changed.has('client_password') && candidate) {
    if (candidate.length < 6) {
      return { key: 'validation.passwordMinLength', fallback: 'Password must be at least 6 characters' };
    }
    if (/^\d+$/.test(candidate)) {
      return { key: 'validation.passwordTooSimple', fallback: 'Password cannot be just numbers. Consider using a date format like "04.07.2025"' };
    }
  }
  if (changed.has('event_date') && !form.event_date) {
    return { key: 'events.details.eventDateRequired', fallback: 'The event date cannot be empty.' };
  }
  if (SOURCE.some((k) => changed.has(k)) && form.source_mode === 'reference' && !form.external_path?.trim()) {
    return { key: 'events.externalFolderRequired', fallback: 'Please select an external folder before saving.' };
  }
  return null;
}

export interface SaveApi {
  updateEvent: (payload: Record<string, unknown>) => Promise<unknown>;
  updateFeedback: (payload: Record<string, unknown>) => Promise<unknown>;
  updateQuota: (payload: Record<string, unknown>) => Promise<unknown>;
  updateResolution: (payload: Record<string, unknown>) => Promise<unknown>;
}

export interface SaveResult {
  saved: DraftPart[];
  failed: { part: DraftPart; error: unknown } | null;
}

const ORDER: DraftPart[] = ['event', 'feedback', 'quota', 'resolution'];

/**
 * Event PUT, then feedback PUT, allowance PUT and resolution PATCH (spec
 * 5.2), each only when its part changed. Stops at the first failure; the
 * caller drops the saved parts from the draft and keeps the rest.
 */
export async function runSave(state: DraftState, buildEvent: () => Record<string, unknown>, api: SaveApi): Promise<SaveResult> {
  const saved: DraftPart[] = [];
  for (const part of ORDER) {
    const changes = changesFor(state, part);
    if (Object.keys(changes).length === 0) continue;
    try {
      if (part === 'event') {
        const payload = buildEvent();
        if (Object.keys(payload).length > 0) await api.updateEvent(payload);
      } else if (part === 'feedback') await api.updateFeedback(changes);
      else if (part === 'quota') await api.updateQuota(changes);
      else await api.updateResolution(changes);
      saved.push(part);
    } catch (error) {
      return { saved, failed: { part, error } };
    }
  }
  return { saved, failed: null };
}
