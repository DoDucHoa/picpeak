// The part of the gallery's view state that the address bar carries, so a
// sort, a view, a tab or an open photo survives a reload and can be shared.
// `folder` and `token` ride on the same URL and are owned elsewhere, so the
// writer below only ever touches its own keys.
export type GalleryTab = 'all' | 'liked' | 'picked';
export type SortField = 'capture_date' | 'name' | 'date';
export type ViewMode = 'grid' | 'list';
export interface UrlState { sort: SortField; dir: 'asc' | 'desc'; view: ViewMode; tab: GalleryTab; photo: number | null }

const SORTS: SortField[] = ['capture_date', 'name', 'date'];
const TABS: GalleryTab[] = ['all', 'liked', 'picked'];

export function readUrlState(search: string, fallback: { sort: SortField; dir: 'asc' | 'desc' }): UrlState {
  const p = new URLSearchParams(search);
  const sort = SORTS.includes(p.get('sort') as SortField) ? (p.get('sort') as SortField) : fallback.sort;
  const dirParam = p.get('dir');
  const dir = dirParam === 'asc' || dirParam === 'desc' ? dirParam : fallback.dir;
  const view: ViewMode = p.get('view') === 'list' ? 'list' : 'grid';
  const tab = TABS.includes(p.get('tab') as GalleryTab) ? (p.get('tab') as GalleryTab) : 'all';
  const photoNum = Number(p.get('photo'));
  const photo = Number.isInteger(photoNum) && photoNum > 0 ? photoNum : null;
  return { sort, dir, view, tab, photo };
}

// Values that are the default anyway stay out of the URL, so a plain gallery
// link stays plain.
const DEFAULTS: Partial<Record<keyof UrlState, string>> = { view: 'grid', tab: 'all' };

export function writeUrlState(state: Partial<UrlState>, mode: 'push' | 'replace' = 'replace'): void {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(state) as [keyof UrlState, unknown][]) {
    if (value === null || value === undefined || DEFAULTS[key] === String(value)) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (mode === 'push') window.history.pushState(window.history.state, '', next);
  else window.history.replaceState(window.history.state, '', next);
}
