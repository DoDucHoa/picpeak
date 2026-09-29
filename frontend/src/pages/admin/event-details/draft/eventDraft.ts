// frontend/src/pages/admin/event-details/draft/eventDraft.ts
/**
 * The event page's draft (spec 5.2): only the fields the user changed, each
 * with the server value it was based on. Pure functions, so the rules can be
 * tested without React.
 */
export type DraftPart = 'event' | 'feedback' | 'quota' | 'resolution';

export interface DraftEntry {
  base: unknown;
  value: unknown;
}

export type DraftState = Readonly<Record<string, DraftEntry>>;

export const fieldKey = (part: DraftPart, name: string): string => `${part}.${name}`;
export const partOf = (key: string): DraftPart => key.slice(0, key.indexOf('.')) as DraftPart;
export const nameOf = (key: string): string => key.slice(key.indexOf('.') + 1);

/** Deep equality for form values. null and undefined are the same "no value". */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).filter((key) => ra[key] !== undefined);
  const kb = Object.keys(rb).filter((key) => rb[key] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => sameValue(ra[key], rb[key]));
}

/** Record a change. A field set back to its base leaves the draft. */
export function setField(state: DraftState, key: string, value: unknown, serverValue: unknown): DraftState {
  const base = key in state ? state[key].base : serverValue;
  if (sameValue(value, base)) {
    if (!(key in state)) return state;
    const { [key]: _dropped, ...rest } = state;
    return rest;
  }
  return { ...state, [key]: { base, value } };
}

export function currentValue(state: DraftState, key: string, serverValue: unknown): unknown {
  return key in state ? state[key].value : serverValue;
}

/** The server value moved after the user changed the field (spec 5.2). */
export function isChangedElsewhere(state: DraftState, key: string, serverValue: unknown): boolean {
  return key in state && !sameValue(state[key].base, serverValue);
}

export function dropParts(state: DraftState, parts: DraftPart[]): DraftState {
  return Object.fromEntries(Object.entries(state).filter(([key]) => !parts.includes(partOf(key))));
}

export function changesFor(state: DraftState, part: DraftPart): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state).filter(([key]) => partOf(key) === part).map(([key, e]) => [nameOf(key), e.value]),
  );
}

export const draftCount = (state: DraftState): number => Object.keys(state).length;
