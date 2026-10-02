import { describe, it, expect, beforeEach } from 'vitest';
import { readUrlState, writeUrlState } from '../state/urlState';

const fallback = { sort: 'capture_date' as const, dir: 'asc' as const };

describe('readUrlState', () => {
  it('uses the event default when the URL says nothing', () => {
    expect(readUrlState('', fallback)).toEqual({ sort: 'capture_date', dir: 'asc', view: 'grid', tab: 'all', photo: null });
  });
  it('reads every param', () => {
    expect(readUrlState('?sort=name&dir=desc&view=list&tab=picked&photo=42', fallback))
      .toEqual({ sort: 'name', dir: 'desc', view: 'list', tab: 'picked', photo: 42 });
  });
  it('ignores garbage values', () => {
    expect(readUrlState('?sort=size&dir=up&view=table&tab=rated&photo=abc', fallback))
      .toEqual({ sort: 'capture_date', dir: 'asc', view: 'grid', tab: 'all', photo: null });
  });
});

describe('writeUrlState', () => {
  beforeEach(() => window.history.replaceState(null, '', '/gallery/s/tok?folder=ceremony'));
  it('keeps unrelated params and drops defaults', () => {
    writeUrlState({ view: 'list', tab: 'all', photo: 7 }, 'replace');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('folder')).toBe('ceremony');
    expect(params.get('view')).toBe('list');
    expect(params.get('photo')).toBe('7');
    expect(params.has('tab')).toBe(false);
  });
  it('removes photo when set to null', () => {
    writeUrlState({ photo: 7 }, 'replace');
    writeUrlState({ photo: null }, 'replace');
    expect(new URLSearchParams(window.location.search).has('photo')).toBe(false);
  });
});
