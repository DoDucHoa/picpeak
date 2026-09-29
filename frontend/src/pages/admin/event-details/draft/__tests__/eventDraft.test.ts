import { describe, expect, it } from 'vitest';
import {
  changesFor, currentValue, draftCount, dropParts, fieldKey, isChangedElsewhere, sameValue, setField,
  type DraftState,
} from '../eventDraft';

const k = fieldKey('event', 'welcome_message');

describe('sameValue', () => {
  it('treats null and undefined as the same empty value', () => expect(sameValue(null, undefined)).toBe(true));
  it('compares arrays and objects by content', () => {
    expect(sameValue([{ id: 1 }], [{ id: 1 }])).toBe(true);
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
  });
  it('does not equate 0 and false or "" and null', () => {
    expect(sameValue(0, false)).toBe(false);
    expect(sameValue('', null)).toBe(false);
  });
});

describe('setField', () => {
  it('records the server value the change was based on', () => {
    const s = setField({}, k, 'Hi', 'Hello');
    expect(s[k]).toEqual({ base: 'Hello', value: 'Hi' });
  });
  it('keeps the first base across later edits', () => {
    const s = setField(setField({}, k, 'Hi', 'Hello'), k, 'Hey', 'Changed on server');
    expect(s[k]).toEqual({ base: 'Hello', value: 'Hey' });
  });
  it('drops the field when it goes back to its base', () => {
    const s = setField(setField({}, k, 'Hi', 'Hello'), k, 'Hello', 'Hello');
    expect(k in s).toBe(false);
    expect(draftCount(s)).toBe(0);
  });
  it('never records a value equal to the server value', () => {
    expect(draftCount(setField({}, k, 'Hello', 'Hello'))).toBe(0);
  });
});

describe('reading and splitting the draft', () => {
  const s: DraftState = {
    [fieldKey('event', 'welcome_message')]: { base: 'a', value: 'b' },
    [fieldKey('feedback', 'allow_likes')]: { base: false, value: true },
    [fieldKey('quota', 'auto_approve')]: { base: false, value: true },
  };
  it('prefers the draft value over the server value', () => {
    expect(currentValue(s, k, 'server')).toBe('b');
    expect(currentValue(s, fieldKey('event', 'photo_cap'), 5)).toBe(5);
  });
  it('lists the changes of one part by field name', () => {
    expect(changesFor(s, 'feedback')).toEqual({ allow_likes: true });
  });
  it('drops whole parts', () => {
    expect(Object.keys(dropParts(s, ['event', 'quota']))).toEqual([fieldKey('feedback', 'allow_likes')]);
  });
  it('marks a field whose server value moved since the change', () => {
    expect(isChangedElsewhere(s, k, 'a')).toBe(false);
    expect(isChangedElsewhere(s, k, 'moved')).toBe(true);
    expect(isChangedElsewhere(s, fieldKey('event', 'photo_cap'), 1)).toBe(false);
  });
});
