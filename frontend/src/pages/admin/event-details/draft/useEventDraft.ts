import { useCallback, useMemo, useState, type SetStateAction } from 'react';
import {
  draftCount, dropParts as dropDraftParts, fieldKey, nameOf, partOf, sameValue, setField,
  type DraftPart, type DraftState,
} from './eventDraft';

export interface EventDraft {
  state: DraftState;
  count: number;
  isDirty: boolean;
  set: (part: DraftPart, name: string, value: unknown, serverValue: unknown) => void;
  discard: () => void;
  dropParts: (parts: DraftPart[]) => void;
}

export function useEventDraft(): EventDraft {
  const [state, setState] = useState<DraftState>({});
  const set = useCallback((part: DraftPart, name: string, value: unknown, serverValue: unknown) => {
    setState((s) => setField(s, fieldKey(part, name), value, serverValue));
  }, []);
  const discard = useCallback(() => setState({}), []);
  const dropParts = useCallback((parts: DraftPart[]) => setState((s) => dropDraftParts(s, parts)), []);
  const count = draftCount(state);
  return { state, count, isDirty: count > 0, set, discard, dropParts };
}

/**
 * One draft part seen as a whole object: the server values with the draft on
 * top. The setter takes what a useState setter takes, so a control written
 * for editForm / setEditForm works unchanged (spec P2). Every key whose new
 * value differs from the current view becomes a draft field; a stale view
 * cannot undo a sibling key, because unchanged keys are never written.
 */
export function useDraftObject<T extends object>(
  draft: EventDraft,
  part: DraftPart,
  server: T,
): [T, (action: SetStateAction<T>) => void] {
  const view = useMemo(() => {
    const out: Record<string, unknown> = { ...(server as Record<string, unknown>) };
    for (const [key, entry] of Object.entries(draft.state)) {
      if (partOf(key) === part) out[nameOf(key)] = entry.value;
    }
    return out as T;
  }, [draft.state, part, server]);

  const { set } = draft;
  const setView = useCallback((action: SetStateAction<T>) => {
    const next = (typeof action === 'function' ? (action as (prev: T) => T)(view) : action) as Record<string, unknown>;
    const now = view as Record<string, unknown>;
    const saved = server as Record<string, unknown>;
    for (const name of Object.keys(next)) {
      if (!sameValue(next[name], now[name])) set(part, name, next[name], saved[name]);
    }
  }, [set, part, server, view]);

  return [view, setView];
}
