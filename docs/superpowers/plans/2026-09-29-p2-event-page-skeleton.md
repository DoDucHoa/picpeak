# P2 Event Page Skeleton and Save Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The event page gets an Overview tab that holds no editable settings and a Settings tab with grouped sections, a left rail, one sticky save bar, and a navigation guard; every setting is edited in exactly one place and saved through one ordered, changed-fields-only save.

**Architecture:** The app moves to a data router (`createBrowserRouter`) so `useBlocker` works. A pure draft module keeps only the fields the user changed, each with the server value it was based on. A `useDraftObject` view gives the existing controls the same `editForm` / `setEditForm` shape they use today, so they move into section components unchanged. One save chain sends the event PUT, then the feedback PUT, the download allowance PUT and the resolution PATCH, each only when that part changed.

**Tech Stack:** React 18, react-router-dom 7, TanStack Query, Vitest + Testing Library, i18next; Node/Express + knex, Jest + supertest; Playwright (`scripts/e2e.sh`, isolated compose stack).

**Spec:** `docs/superpowers/specs/2026-09-28-event-form-redesign-design.md`: 5.1, 5.2, 5.3, finding 14 and 16 in section 4, section 6 "P2", section 10.

## Global Constraints

- Controls move into the section components unchanged (spec P2). The simplified controls (feedback mode, expiry, password controls, Appearance rebuild, type and date in Details) are P4, not here.
- Controls P3 removes live in their section's advanced area until then: guest uploads, upload category, uploader names and reveal under Guest interaction; keybind stays inside the feedback controls; hero logo size, position and password page logo under Appearance.
- The draft holds only fields the user changed. Setting a field back to its base value removes it. Opening the Settings tab on any event produces zero changes.
- Saves run in order: event PUT, feedback PUT, download allowance PUT, resolution PATCH; each only when its part has changes; the chain stops at the first failure. Saved parts leave the draft; the failed and later parts stay.
- Actions (rename, extend, publish, regenerate client link, logo upload or removal, create order, archive, duplicate, reveal now) act immediately and are never part of the draft.
- The navigation guard compares pathnames only, so `?tab=` and `?section=` never prompt; `beforeunload` covers closing the tab.
- Archived events: Settings is read-only and the bar never appears. Without `events.edit`: every section is locked with "needs events.edit". Watch folder keeps its `photos.upload` lock.
- Every new user-facing string gets `en`, `de` and `vi` in the same change; plural keys use `_one` / `_other`. Existing keys are never pruned.
- No em-dash (U+2014) or en-dash (U+2013) in anything written into the repo. Conventional Commits.
- `backend/jest.setup.js` keeps its `DATABASE_CLIENT` pin. Backend Jest from `backend/`, Vitest from `frontend/`. Never edit while a background test run is in flight. Git as plain single commands.

## Rulings made while writing this plan (the spec predates them)

1. **No left rail to extract.** Upstream `2cb6152c` moved the Settings navigation out of `SettingsPage.tsx` into the admin sidebar. A new `SectionRailLayout` component provides the rail the spec describes (sticky on desktop, a `<select>` below `md`).
2. **The page does not register with `UnsavedChangesContext`.** That context guards only sidebar and header clicks; registering as well as using `useBlocker` would ask twice on a sidebar click. The page therefore uses its own `EventSaveBar` (the shared `SettingsSaveBar` registers itself) and one router-level blocker.
3. **"Changed elsewhere" is shown in the save bar by section**, not beside each field, because the moved controls are unchanged components. It covers the event and feedback parts, which the page loads; the allowance and resolution cards own their queries and only this page edits them.
4. **Appearance keeps the full theme customizer visible** and Downloads keeps the allowance card's switches visible, because the controls move unchanged; P4 rebuilds Appearance.
5. **The header style card shows the stored `header_style` / `hero_divider_style`**, overlaid on the theme config, so the draft compares against what is saved. A change to only those two sends only those two, not `color_theme`, so an inherited theme stays inherited.
6. **The chain stops at the first failed request**; later parts stay in the draft and a retry resends them.

## Review Focus

1. **Opening Settings on a legacy event** (NULL theme, legacy preset name, SQLite 0/1 booleans, NULL hero logo fields, no feedback row) shows no save bar. Pinned in Task 15.
2. **Two setters in one handler** (a preset change sets the theme and the preset name; a form control sets two keys) keep both changes, not only the last. Pinned in Task 4.
3. **Extend 7 days, then Save another field** keeps the extended expiry. Pinned in Task 15.
4. **Clearing the customer email** saves it as empty and no customer mail is addressed to an empty string. Pinned in Task 1; the reviewer checks the mail senders.
5. **A sidebar click with unsaved changes** asks exactly once: the page never registers with the sidebar's guard (ruling 2), so only the router blocker asks. Pinned in Task 6 ("asks once before leaving") and Task 16 (a real sidebar click).

---

### Task 1: The event PUT can clear the customer name and email

**Files:**
- Modify: `backend/src/routes/adminEvents/crud.js` (PUT `/:id`: the `customer_email` validator, the `customer_name` and `customer_email` blocks that build `updates`)
- Test: `backend/__tests__/routes/adminEventsClearCustomerContact.test.js`

**Interfaces:**
- Produces: `PUT /api/admin/events/:id` with `customer_name: ''` or `null` stores NULL; with `customer_email: ''` or `null` stores NULL and `host_email` `''`. Either one answers 400 `{ error }` when Settings require that field (`getEventFieldRequirements()`).

- [ ] **Step 1: Write the failing test**

```js
// backend/__tests__/routes/adminEventsClearCustomerContact.test.js
/**
 * The customer name and email could never be cleared: the page only sent a
 * non-empty email, the validator rejected an empty one, and the handler
 * dropped an empty name (spec finding 14). A required field stays required.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'clear-customer-contact-secret-32-chars';

const request = require('supertest');
const { bootCrmDb, seedMinimal, assignAdminRole, mintAdminToken, buildRouteApp } = require('../integration/helpers/crmDb');

let db; let cleanup; let app; let token; let eventId;
const setRequirement = (key, value) => db('app_settings')
  .insert({ setting_key: key, setting_value: JSON.stringify(value), setting_type: 'boolean' })
  .onConflict('setting_key').merge();

beforeAll(async () => {
  ({ db, cleanup } = await bootCrmDb());
  const { adminId } = await seedMinimal(db);
  await assignAdminRole(db, adminId, 'super_admin');
  token = mintAdminToken(adminId);
  require('../../src/middleware/permissions').clearPermissionCache();
  app = buildRouteApp('/events', require('../../src/routes/adminEvents'));
  const [row] = await db('events').insert({
    slug: 'clear-contact', event_type: 'wedding', event_name: 'Clear', event_date: '2026-09-01',
    customer_name: 'Anna', customer_email: 'anna@example.com', host_name: 'Anna', host_email: 'anna@example.com',
    admin_email: 'a@example.com', password_hash: 'x', share_link: 'https://example.com/gallery/clear-contact',
    expires_at: new Date(Date.now() + 86400000), created_by: adminId,
  }).returning('id');
  eventId = typeof row === 'object' ? row.id : row;
}, 120000);
afterAll(async () => { await cleanup(); });

const put = (body) => request(app).put(`/events/${eventId}`).set('Authorization', `Bearer ${token}`).send(body);
const row = () => db('events').where({ id: eventId }).first('customer_name', 'customer_email', 'host_email');

describe('when Settings do not require them', () => {
  beforeAll(async () => {
    await setRequirement('event_require_customer_name', false);
    await setRequirement('event_require_customer_email', false);
  });

  it('clears the customer name', async () => {
    expect((await put({ customer_name: '' })).status).toBe(200);
    expect((await row()).customer_name).toBeNull();
  });

  it('clears the customer email', async () => {
    expect((await put({ customer_email: null })).status).toBe(200);
    const r = await row();
    expect(r.customer_email).toBeNull();
    expect(r.host_email).toBe('');
  });
});

describe('when Settings require them', () => {
  beforeAll(async () => {
    await setRequirement('event_require_customer_name', true);
    await setRequirement('event_require_customer_email', true);
    await put({ customer_name: 'Anna', customer_email: 'anna@example.com' });
  });

  it('refuses to clear a required name', async () => {
    expect((await put({ customer_name: '' })).status).toBe(400);
    expect((await row()).customer_name).toBe('Anna');
  });

  it('refuses to clear a required email', async () => {
    expect((await put({ customer_email: '' })).status).toBe(400);
    expect((await row()).customer_email).toBe('anna@example.com');
  });
});
```

Before running, check the route mount: `buildRouteApp('/events', require('../../src/routes/adminEvents'))` must reach `PUT /:id` in `adminEvents/crud.js` (see how `backend/__tests__/routes/adminEvents.smoke.test.js` mounts it and copy that), and check the `events` insert columns against that smoke test's fixture.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest __tests__/routes/adminEventsClearCustomerContact.test.js --forceExit`
Expected: FAIL: the name stays `Anna` after `''` (200 but unchanged), the email PUT answers 400 when not required.

- [ ] **Step 3: Implement**

1. Validator: change the existing `body('customer_email').optional()` to `body('customer_email').optional({ values: 'falsy' })`, keeping `.isEmail().normalizeEmail(...)`, so `''` and `null` skip validation and reach the handler while a non-empty value is still checked.
2. Import `getEventFieldRequirements` next to the other helpers (it is exported from `backend/src/services/eventSettings.js`; add it to the `./helpers` destructure if `helpers.js` re-exports it, else require it from `../../services/eventSettings`).
3. In the `customer_name` block, replace the `else { delete updates.customer_name; }` with:

```js
        } else {
          // An empty name clears it, unless Settings require one (finding 14).
          const requirements = await getEventFieldRequirements();
          if (requirements.require_customer_name) {
            return res.status(400).json({ error: 'Customer name is required' });
          }
          if (customerColumnsAvailable) updates.customer_name = null;
          else delete updates.customer_name;
          updates.host_name = null;
        }
```

4. In the `customer_email` block, replace its `else` the same way, with `require_customer_email`, `'Customer email is required'`, `updates.customer_email = null` and `updates.host_email = ''` (`host_email` is NOT NULL on installs whose schema predates migration 073's relaxation; `''` is that column's documented empty value).

- [ ] **Step 4: Run it and watch it pass**

Run: `npx jest __tests__/routes/adminEventsClearCustomerContact.test.js __tests__/routes/adminEvents.smoke.test.js __tests__/routes/authzPermissionGaps.test.js --forceExit`, then `npx eslint src/routes/adminEvents/crud.js`
Expected: PASS; lint clean. Then `rg -n "host_email|customer_email" src/services src/jobs src/routes | rg -i "send|mail|to:"` and read each hit: a mail to the customer must skip an empty address. Any sender that would address `''` gets a guard `if (!address) return;` and a line in the ledger.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/adminEvents/crud.js backend/__tests__/routes/adminEventsClearCustomerContact.test.js
git commit -m "fix(events): let the event PUT clear the customer name and email"
```

---

### Task 2: The app runs on a data router

**Files:**
- Create: `frontend/src/components/RootLayout.tsx`
- Modify: `frontend/src/App.tsx` (the `<Router>` ... `</Router>` block)
- Modify: `frontend/src/pages/admin/__tests__/eventDetailsNotFound.test.tsx`, `frontend/src/pages/admin/__tests__/eventDetailsPhotosTab.test.tsx` (mount through `createMemoryRouter`)
- Test: `frontend/src/components/__tests__/RootLayout.test.tsx`, `frontend/src/__tests__/appDataRouter.test.ts`

**Interfaces:**
- Produces: every route renders inside a data router, so `useBlocker` works anywhere under it. `RootLayout` renders `AnalyticsRouteTracker`, then `MaintenanceWrapper` around `SkipLink` and `<Outlet />`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/__tests__/appDataRouter.test.ts
/**
 * useBlocker needs a data router (spec finding 16). The app used
 * <BrowserRouter>, which has none.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const app = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');

describe('App router', () => {
  it('is a data router', () => {
    expect(app).toMatch(/createBrowserRouter\(/);
    expect(app).toMatch(/createRoutesFromElements\(/);
    expect(app).toMatch(/<RouterProvider router=\{router\} \/>/);
  });
  it('no longer uses BrowserRouter', () => {
    expect(app).not.toMatch(/BrowserRouter/);
  });
  it('mounts the tracker, maintenance wrapper and skip link through the root layout', () => {
    expect(app).toMatch(/<Route element=\{<RootLayout \/>\}>/);
  });
});
```

```tsx
// frontend/src/components/__tests__/RootLayout.test.tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

vi.mock('../../services/analytics.service', () => ({ AnalyticsRouteTracker: () => <span>tracker</span> }));
vi.mock('../MaintenanceWrapper', () => ({ MaintenanceWrapper: ({ children }: { children: React.ReactNode }) => <div data-testid="maintenance">{children}</div> }));
vi.mock('../common', () => ({ SkipLink: () => <a href="#main-content">skip</a> }));

import { RootLayout } from '../RootLayout';

it('renders the tracker, then the child route inside the maintenance wrapper with the skip link', async () => {
  const router = createMemoryRouter(
    [{ element: <RootLayout />, children: [{ path: '/', element: <p>child</p> }] }],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  expect(screen.getByText('tracker')).toBeInTheDocument();
  const wrapper = screen.getByTestId('maintenance');
  expect(wrapper).toContainElement(screen.getByText('skip'));
  expect(wrapper).toContainElement(await screen.findByText('child'));
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/__tests__/appDataRouter.test.ts src/components/__tests__/RootLayout.test.tsx`
Expected: FAIL: `createBrowserRouter` absent; `../RootLayout` cannot be resolved.

- [ ] **Step 3: Implement**

```tsx
// frontend/src/components/RootLayout.tsx
import { Outlet } from 'react-router-dom';
import { AnalyticsRouteTracker } from '../services/analytics.service';
import { MaintenanceWrapper } from './MaintenanceWrapper';
import { SkipLink } from './common';

/**
 * The layout every route renders in. These three read the location, so under
 * a data router they must sit inside it, as a layout route, rather than
 * between <Router> and <Routes> as before.
 */
export function RootLayout() {
  return (
    <>
      <AnalyticsRouteTracker />
      <MaintenanceWrapper>
        <SkipLink />
        <Outlet />
      </MaintenanceWrapper>
    </>
  );
}
```

In `App.tsx`:
1. Change the router import to `import { createBrowserRouter, createRoutesFromElements, RouterProvider, Route, Navigate, useParams } from 'react-router-dom';` (keep `Routes` if the `/customer/*` block still uses its descendant `<Routes>`, which it does).
2. Remove `AnalyticsRouteTracker` from the analytics import and `SkipLink` from the `./components/common` import if nothing else in `App.tsx` uses them; import `RootLayout` from `./components/RootLayout`.
3. After `function RedirectCustomerDetail() {...}` and before `function App()`, add:

```tsx
// A data router, created once, so pages can block navigation with
// useBlocker (spec finding 16). The route list is the one that sat inside
// <Routes>, moved verbatim under the root layout.
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RootLayout />}>
      {/* the children of <Routes> go here, verbatim */}
    </Route>,
  ),
);
```

   and move every child of the old `<Routes>` (from the first `<Route path="/gallery/preview" ...>` to `<Route path="*" .../>`) into it, unchanged.
4. Replace the whole `<Router> ... </Router>` block in `App` with `<RouterProvider router={router} />`. Everything outside it (providers, `DynamicFavicon`, `RobotsMetaTags`, `OfflineIndicator`, `ToastContainer`) stays where it is: none of them use router hooks.

In the two EventDetailsPage tests, replace the `MemoryRouter` + `Routes` mount with:

```tsx
const router = createMemoryRouter(
  [
    { path: '/admin/events/:id', element: <EventDetailsPage /> },
    { path: '/admin/events', element: <div>events list</div> },
  ],
  { initialEntries: [entry] },
);
render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
```

keeping each file's own stub text for the list route and its own `entry`.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/__tests__/appDataRouter.test.ts src/components/__tests__/RootLayout.test.tsx src/pages/admin/__tests__`, then `npm run lint`, `npm run build:check`
Expected: PASS; lint clean; build 0.

- [ ] **Step 5: Verify with the e2e suite**

Run from the repo root: `npm ci` (installs Playwright for the root config), `npx playwright install chromium`, then `bash scripts/e2e.sh --project=chromium` in the background (it builds the isolated `docker-compose.e2e.yml` stack, seeds it, runs every spec and tears down).
Expected: every spec passes. If the machine cannot run it (memory pressure stopped the backend gates once in this project), record that in the ledger and run the `E2E` workflow with `workflow_dispatch` after the user pushes; the router commit is then verified before P2 is called done.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/RootLayout.tsx frontend/src/components/__tests__/RootLayout.test.tsx frontend/src/__tests__/appDataRouter.test.ts frontend/src/pages/admin/__tests__/eventDetailsNotFound.test.tsx frontend/src/pages/admin/__tests__/eventDetailsPhotosTab.test.tsx
git commit -m "refactor(router): move the app to a data router"
```

---

### Task 3: The draft rules, as pure functions

**Files:**
- Create: `frontend/src/pages/admin/event-details/draft/eventDraft.ts`
- Test: `frontend/src/pages/admin/event-details/draft/__tests__/eventDraft.test.ts`

**Interfaces:**
- Produces: `DraftPart = 'event' | 'feedback' | 'quota' | 'resolution'`; `DraftEntry { base; value }`; `DraftState = Readonly<Record<string, DraftEntry>>` keyed `"<part>.<name>"`; `fieldKey`, `partOf`, `nameOf`, `sameValue`, `setField`, `currentValue`, `isChangedElsewhere`, `dropParts`, `changesFor`, `draftCount`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/pages/admin/event-details/draft/__tests__/eventDraft.test.ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/pages/admin/event-details/draft/__tests__/eventDraft.test.ts`
Expected: FAIL: cannot resolve `../eventDraft`.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run it and watch it pass**

Run: the Step 2 command
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/event-details/draft
git commit -m "feat(events): the event page draft rules"
```

---

### Task 4: React hooks over the draft

**Files:**
- Create: `frontend/src/pages/admin/event-details/draft/useEventDraft.ts`
- Test: `frontend/src/pages/admin/event-details/draft/__tests__/useEventDraft.test.tsx`

**Interfaces:**
- Consumes: Task 3.
- Produces:
  - `useEventDraft(): EventDraft` with `state`, `count`, `isDirty`, `set(part, name, value, serverValue)`, `update(part, name, fn: (current) => next, serverValue)`, `discard()`, `dropParts(parts)`. `set` and `update` are stable across renders.
  - `useDraftObject<T>(draft, part, server: T): [T, (action: SetStateAction<T>) => void]`: the server object with the draft on top, and a setter shaped like a `useState` setter.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/admin/event-details/draft/__tests__/useEventDraft.test.tsx
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDraftObject, useEventDraft } from '../useEventDraft';

const server = { welcome_message: 'Hello', photo_cap: 0, customer_accounts: [{ id: 1 }] };

const setup = () => renderHook(() => {
  const draft = useEventDraft();
  const [form, setForm] = useDraftObject(draft, 'event', server);
  return { draft, form, setForm };
});

describe('useDraftObject', () => {
  it('starts with the server values and no changes', () => {
    const { result } = setup();
    expect(result.current.form).toEqual(server);
    expect(result.current.draft.count).toBe(0);
  });

  it('records only the keys that changed, from a spread update', () => {
    const { result } = setup();
    act(() => result.current.setForm((prev) => ({ ...prev, welcome_message: 'Hi' })));
    expect(result.current.draft.count).toBe(1);
    expect(result.current.form.welcome_message).toBe('Hi');
  });

  it('keeps both changes when one handler calls the setter twice', () => {
    const { result } = setup();
    act(() => {
      result.current.setForm((prev) => ({ ...prev, welcome_message: 'Hi' }));
      result.current.setForm((prev) => ({ ...prev, photo_cap: 50 }));
    });
    expect(result.current.form).toMatchObject({ welcome_message: 'Hi', photo_cap: 50 });
    expect(result.current.draft.count).toBe(2);
  });

  it('forgets a field typed back to its saved value', () => {
    const { result } = setup();
    act(() => result.current.setForm((prev) => ({ ...prev, welcome_message: 'Hi' })));
    act(() => result.current.setForm((prev) => ({ ...prev, welcome_message: 'Hello' })));
    expect(result.current.draft.isDirty).toBe(false);
  });

  it('discards everything', () => {
    const { result } = setup();
    act(() => result.current.setForm((prev) => ({ ...prev, photo_cap: 5 })));
    act(() => result.current.draft.discard());
    expect(result.current.form).toEqual(server);
  });
});

describe('useEventDraft.update', () => {
  it('builds on the latest value, so two updates in one handler both land', () => {
    const { result } = renderHook(() => useEventDraft());
    const base = { config: { a: 1 }, preset: 'default' };
    act(() => {
      result.current.update('event', '__theme', (cur) => ({ ...(cur as typeof base), config: { a: 2 } }), base);
      result.current.update('event', '__theme', (cur) => ({ ...(cur as typeof base), preset: 'custom' }), base);
    });
    expect(result.current.state['event.__theme'].value).toEqual({ config: { a: 2 }, preset: 'custom' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/pages/admin/event-details/draft/__tests__/useEventDraft.test.tsx`
Expected: FAIL: cannot resolve `../useEventDraft`.

- [ ] **Step 3: Implement**

```ts
// frontend/src/pages/admin/event-details/draft/useEventDraft.ts
import { useCallback, useMemo, useState, type SetStateAction } from 'react';
import {
  currentValue, draftCount, dropParts as dropDraftParts, fieldKey, nameOf, partOf, sameValue, setField,
  type DraftPart, type DraftState,
} from './eventDraft';

export interface EventDraft {
  state: DraftState;
  count: number;
  isDirty: boolean;
  set: (part: DraftPart, name: string, value: unknown, serverValue: unknown) => void;
  update: (part: DraftPart, name: string, fn: (current: unknown) => unknown, serverValue: unknown) => void;
  discard: () => void;
  dropParts: (parts: DraftPart[]) => void;
}

export function useEventDraft(): EventDraft {
  const [state, setState] = useState<DraftState>({});
  const set = useCallback((part: DraftPart, name: string, value: unknown, serverValue: unknown) => {
    setState((s) => setField(s, fieldKey(part, name), value, serverValue));
  }, []);
  // Reads the latest draft inside the state update, so two calls in one
  // handler (a preset change sets config and preset name) both land.
  const update = useCallback((part: DraftPart, name: string, fn: (current: unknown) => unknown, serverValue: unknown) => {
    setState((s) => {
      const key = fieldKey(part, name);
      return setField(s, key, fn(currentValue(s, key, serverValue)), serverValue);
    });
  }, []);
  const discard = useCallback(() => setState({}), []);
  const dropParts = useCallback((parts: DraftPart[]) => setState((s) => dropDraftParts(s, parts)), []);
  const count = draftCount(state);
  return { state, count, isDirty: count > 0, set, update, discard, dropParts };
}

/**
 * One draft part seen as a whole object: the server values with the draft on
 * top. The setter takes what a useState setter takes, so a control written
 * for editForm / setEditForm works unchanged (spec P2). Every key whose new
 * value differs from the current view becomes a draft field; a stale view
 * cannot undo a sibling key, because unchanged keys are never written.
 */
export function useDraftObject<T extends Record<string, unknown>>(
  draft: EventDraft,
  part: DraftPart,
  server: T,
): [T, (action: SetStateAction<T>) => void] {
  const view = useMemo(() => {
    const out: Record<string, unknown> = { ...server };
    for (const [key, entry] of Object.entries(draft.state)) {
      if (partOf(key) === part) out[nameOf(key)] = entry.value;
    }
    return out as T;
  }, [draft.state, part, server]);

  const { set } = draft;
  const setView = useCallback((action: SetStateAction<T>) => {
    const next = typeof action === 'function' ? (action as (prev: T) => T)(view) : action;
    for (const name of Object.keys(next)) {
      if (!sameValue(next[name], view[name])) set(part, name, next[name], server[name]);
    }
  }, [set, part, server, view]);

  return [view, setView];
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: the Step 2 command
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/event-details/draft
git commit -m "feat(events): hooks that let existing controls edit the draft"
```

---

### Task 5: Server values and the ordered save

**Files:**
- Create: `frontend/src/pages/admin/event-details/draft/serverValues.ts`
- Create: `frontend/src/pages/admin/event-details/draft/saveDraft.ts`
- Modify: `frontend/src/pages/admin/event-details/types.ts` (`EditFormState` and `INITIAL_EDIT_FORM` gain `client_access_enabled: boolean` and `client_password: string`; add `ThemeDraft`)
- Test: `frontend/src/pages/admin/event-details/draft/__tests__/serverValues.test.ts`, `frontend/src/pages/admin/event-details/draft/__tests__/saveDraft.test.ts`

**Interfaces:**
- Consumes: Task 3 (`DraftState`, `changesFor`, `fieldKey`, `sameValue`), Task 1 (the PUT accepts `null` to clear the customer name and email).
- Produces:
  - `type ThemeDraft = { config: ThemeConfig; preset: string }` in `types.ts`.
  - `eventFormValues(event: Event): EditFormState`: the values the page used to seed its edit form, plus the two client access fields.
  - `themeValue(event: Event, brandingTheme: ThemeConfig | undefined): ThemeDraft`.
  - `buildEventPayload(changed: Set<string>, form: EditFormState, theme: ThemeDraft, serverTheme: ThemeDraft): Record<string, unknown>`.
  - `validateDraft(changed: Set<string>, form: EditFormState, server: EditFormState): { key: string; fallback: string } | null`.
  - `runSave(state: DraftState, buildEvent: () => Record<string, unknown>, api: SaveApi): Promise<SaveResult>` with `SaveApi { updateEvent, updateFeedback, updateQuota, updateResolution }` (each `(payload) => Promise<unknown>`) and `SaveResult { saved: DraftPart[]; failed: { part: DraftPart; error: unknown } | null }`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/pages/admin/event-details/draft/__tests__/serverValues.test.ts
import { describe, expect, it } from 'vitest';
import { eventFormValues, themeValue } from '../serverValues';
import { GALLERY_THEME_PRESETS } from '../../../../../types/theme.types';
import type { Event } from '../../../../../types';

const legacy = {
  id: 1, slug: 's', event_name: 'Legacy', event_type: 'wedding', event_date: '2020-01-01',
  color_theme: null, hero_logo_visible: null, hero_logo_size: null, login_logo_visible: 0,
  allow_downloads: 1, external_watch: 0, og_image_share_enabled: 0, client_access_enabled: 0,
  header_style: 'hero', hero_divider_style: 'curve',
} as unknown as Event;

describe('eventFormValues', () => {
  it('is stable: two reads of the same event are equal', () => {
    expect(eventFormValues(legacy)).toEqual(eventFormValues(legacy));
  });
  it('keeps NULL hero logo fields as inherit', () => {
    const v = eventFormValues(legacy);
    expect(v.hero_logo_visible).toBeNull();
    expect(v.hero_logo_size).toBeNull();
  });
  it('folds SQLite 0/1 into booleans', () => {
    const v = eventFormValues(legacy);
    expect(v.external_watch).toBe(false);
    expect(v.login_logo_visible).toBe(false);
    expect(v.client_access_enabled).toBe(false);
  });
  it('never carries a password', () => {
    const v = eventFormValues(legacy);
    expect(v.new_password).toBe('');
    expect(v.confirm_new_password).toBe('');
    expect(v.client_password).toBe('');
  });
});

describe('themeValue', () => {
  it('shows the branding theme for a NULL theme, as a custom look', () => {
    const branding = GALLERY_THEME_PRESETS.default.config;
    expect(themeValue(legacy, branding).preset).toBe('custom');
  });
  it('resolves a legacy preset name', () => {
    const name = Object.keys(GALLERY_THEME_PRESETS)[0];
    const t = themeValue({ ...legacy, color_theme: name } as Event, undefined);
    expect(t.preset).toBe(name);
  });
  it('overlays the stored header style and divider', () => {
    const t = themeValue(legacy, undefined);
    expect(t.config.headerStyle).toBe('hero');
    expect(t.config.heroDividerStyle).toBe('curve');
  });
});
```

```ts
// frontend/src/pages/admin/event-details/draft/__tests__/saveDraft.test.ts
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/pages/admin/event-details/draft/__tests__/serverValues.test.ts src/pages/admin/event-details/draft/__tests__/saveDraft.test.ts`
Expected: FAIL: cannot resolve `../serverValues` and `../saveDraft`.

- [ ] **Step 3: Implement**

`types.ts`: add `client_access_enabled: boolean;` and `client_password: string;` to `EditFormState`, `client_access_enabled: false,` and `client_password: '',` to `INITIAL_EDIT_FORM`, and

```ts
import type { ThemeConfig } from '../../../types/theme.types';
/** The theme picker's state in the draft: the look and the preset it came from. */
export interface ThemeDraft { config: ThemeConfig; preset: string }
```

(if `types.ts` already imports from `theme.types`, reuse that import).

`serverValues.ts`:

```ts
// frontend/src/pages/admin/event-details/draft/serverValues.ts
import { format } from 'date-fns';
import type { Event } from '../../../../types';
import type { CustomerGroup } from '../../../../types';
import { GALLERY_THEME_PRESETS, type ThemeConfig } from '../../../../types/theme.types';
import type { EditFormState, ThemeDraft } from '../types';
import { normalizeRequirePassword, safeParseDate } from '../utils';

/**
 * What the Settings tab shows for a saved event. Moved from the page's old
 * handleStartEdit, value for value, so the controls see exactly what they saw
 * in edit mode; the draft compares against it, so opening the tab changes
 * nothing (spec 5.2).
 */
export function eventFormValues(event: Event): EditFormState {
  const expiresAtDate = safeParseDate(event.expires_at);
  return {
    // PASTE: the object literal passed to setEditForm in the old
    // handleStartEdit (EventDetailsPage.tsx, "const handleStartEdit"),
    // unchanged, then these two:
    client_access_enabled: Boolean((event as { client_access_enabled?: unknown }).client_access_enabled),
    client_password: '',
  } as EditFormState;
}

/** The theme picker's state for a saved event (old handleStartEdit, theme half). */
export function themeValue(event: Event, brandingTheme: ThemeConfig | undefined): ThemeDraft {
  let config: ThemeConfig = GALLERY_THEME_PRESETS.default.config;
  let preset = 'default';
  if (event.color_theme) {
    try {
      if (event.color_theme.startsWith('{')) {
        config = JSON.parse(event.color_theme);
        const match = Object.entries(GALLERY_THEME_PRESETS)
          .find(([, p]) => JSON.stringify(p.config) === JSON.stringify(config));
        preset = match ? match[0] : 'custom';
      } else if (GALLERY_THEME_PRESETS[event.color_theme]) {
        config = GALLERY_THEME_PRESETS[event.color_theme].config;
        preset = event.color_theme;
      }
    } catch {
      config = GALLERY_THEME_PRESETS.default.config;
      preset = 'default';
    }
  } else if (brandingTheme) {
    // NULL = inherit Branding; shown as a custom look (#550 follow-up).
    config = brandingTheme;
    preset = 'custom';
  }
  // The header style card edits the stored columns, so show those.
  const stored = event as { header_style?: string | null; hero_divider_style?: string | null };
  return {
    config: {
      ...config,
      ...(stored.header_style ? { headerStyle: stored.header_style } : {}),
      ...(stored.hero_divider_style ? { heroDividerStyle: stored.hero_divider_style } : {}),
    } as ThemeConfig,
    preset,
  };
}
```

The "PASTE" line is a move instruction, not a placeholder: cut the literal from `handleStartEdit` (it is shown in full in the old file, starting `welcome_message: event.welcome_message || '',` and ending `og_image_share_enabled: event.og_image_share_enabled === true,`) into this return, and delete the comment. Its `expiresAtDate` now comes from the line above; `CustomerGroup` is the type its `customer_accounts` mapping names. Check that `normalizeRequirePassword` and `safeParseDate` are exported from `event-details/utils.ts`; if either lives elsewhere, import it from where `EventDetailsPage.tsx` imports it. Check the client access field name against `ClientAccessCard.tsx` and use the same one.

`saveDraft.ts`:

```ts
// frontend/src/pages/admin/event-details/draft/saveDraft.ts
import { changesFor, sameValue, type DraftPart, type DraftState } from './eventDraft';
import type { EditFormState, ThemeDraft } from '../types';

const REVEAL = ['allow_user_uploads', 'reveal_mode', 'reveal_at'];
const SOURCE = ['source_mode', 'external_path', 'external_watch'];
const PROMO = ['promo_mode', 'promo_markdown'];
const INFO = ['info_mode', 'info_markdown'];
const GROUPED = new Set([...REVEAL, ...SOURCE, ...PROMO, ...INFO]);

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
      case 'confirm_new_password': break;
      case 'client_password': if (form.client_password) out.client_password = form.client_password; break;
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
  if (any(REVEAL)) {
    out.allow_user_uploads = form.allow_user_uploads;
    out.reveal_mode = form.allow_user_uploads && form.reveal_mode;
    out.reveal_at = form.allow_user_uploads && form.reveal_mode && form.reveal_at
      ? new Date(form.reveal_at).toISOString() : null;
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
  const touchesPassword = ['require_password', 'new_password', 'confirm_new_password'].some((k) => changed.has(k));
  if (touchesPassword && form.require_password) {
    if (form.require_password !== server.require_password && !form.new_password) {
      return { key: 'events.newPasswordRequired', fallback: 'Please set a password before enabling protection.' };
    }
    if (form.new_password && form.new_password.length < 6) {
      return { key: 'validation.passwordMinLength', fallback: 'Password must be at least 6 characters' };
    }
    if (form.new_password && form.new_password !== form.confirm_new_password) {
      return { key: 'validation.passwordsDoNotMatch', fallback: 'Passwords do not match' };
    }
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
```

Check the fallbacks of `validation.passwordMinLength` and `validation.passwordsDoNotMatch` against `en.json` and copy them.

- [ ] **Step 4: Run them and watch them pass**

Run: the Step 2 command, then `npm run lint` and `npm run build:check`
Expected: PASS; lint clean; build 0 (the page still compiles: `EditFormState` only gained fields).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/event-details/draft frontend/src/pages/admin/event-details/types.ts
git commit -m "feat(events): server values and the ordered, changed-fields-only save"
```

---

### Task 6: The navigation guard

**Files:**
- Create: `frontend/src/hooks/useNavigationGuard.ts`
- Test: `frontend/src/hooks/__tests__/useNavigationGuard.test.tsx`

**Interfaces:**
- Consumes: the data router (Task 2), `useConfirm` from `components/common`, the existing keys `settings.saveBar.leaveTitle`, `leaveMessage`, `leaveConfirm`, `leaveCancel`.
- Produces: `useNavigationGuard(isDirty: boolean): { allowNextNavigation: () => void }`. Blocks a pathname change while dirty and asks once; lets search-only changes through; `allowNextNavigation()` lets the page's own next redirect through; adds a `beforeunload` listener only while dirty.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/hooks/__tests__/useNavigationGuard.test.tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { createMemoryRouter, Link, RouterProvider, useNavigate } from 'react-router-dom';

const confirmMock = vi.fn();
vi.mock('../../components/common', () => ({ useConfirm: () => confirmMock }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, fb: string) => fb }) }));

import { useNavigationGuard } from '../useNavigationGuard';

let allowNext: () => void = () => {};
function Page({ dirty }: { dirty: boolean }) {
  const { allowNextNavigation } = useNavigationGuard(dirty);
  allowNext = allowNextNavigation;
  const navigate = useNavigate();
  return (
    <>
      <Link to="/events/1?tab=settings">tab</Link>
      <Link to="/events">leave</Link>
      <button onClick={() => { allowNextNavigation(); navigate('/events/2'); }}>redirect</button>
    </>
  );
}

const mount = (dirty: boolean) => {
  const router = createMemoryRouter(
    [{ path: '/events/:id', element: <Page dirty={dirty} /> }, { path: '/events', element: <p>list</p> }],
    { initialEntries: ['/events/1'] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

beforeEach(() => confirmMock.mockReset());

it('never asks for a tab or section change', async () => {
  const router = mount(true);
  await userEvent.click(screen.getByText('tab'));
  expect(confirmMock).not.toHaveBeenCalled();
  expect(router.state.location.search).toBe('?tab=settings');
});

it('asks once before leaving and stays when the user cancels', async () => {
  confirmMock.mockResolvedValue(false);
  const router = mount(true);
  await userEvent.click(screen.getByText('leave'));
  expect(confirmMock).toHaveBeenCalledTimes(1);
  expect(router.state.location.pathname).toBe('/events/1');
});

it('leaves when the user confirms', async () => {
  confirmMock.mockResolvedValue(true);
  mount(true);
  await userEvent.click(screen.getByText('leave'));
  expect(await screen.findByText('list')).toBeInTheDocument();
});

it('lets the page\'s own redirect through', async () => {
  const router = mount(true);
  await userEvent.click(screen.getByText('redirect'));
  expect(confirmMock).not.toHaveBeenCalled();
  expect(router.state.location.pathname).toBe('/events/2');
});

it('does not ask when nothing is unsaved', async () => {
  mount(false);
  await userEvent.click(screen.getByText('leave'));
  expect(confirmMock).not.toHaveBeenCalled();
});

it('guards closing the tab only while dirty', () => {
  const add = vi.spyOn(window, 'addEventListener');
  mount(false);
  expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(false);
  act(() => { mount(true); });
  expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true);
  add.mockRestore();
  void allowNext;
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/hooks/__tests__/useNavigationGuard.test.tsx`
Expected: FAIL: cannot resolve `../useNavigationGuard`.

- [ ] **Step 3: Implement**

```ts
// frontend/src/hooks/useNavigationGuard.ts
import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../components/common';

/**
 * Ask before leaving a page with unsaved changes (spec 5.2). Only a pathname
 * change counts, so ?tab= and ?section= never prompt. The page calls
 * allowNextNavigation() before its own post-save or post-create redirect.
 * Needs the data router (App.tsx).
 */
export function useNavigationGuard(isDirty: boolean): { allowNextNavigation: () => void } {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const bypass = useRef(false);
  const asking = useRef(false);

  const blocker = useBlocker(useCallback(({ currentLocation, nextLocation }) => {
    if (bypass.current) {
      bypass.current = false;
      return false;
    }
    return isDirty && currentLocation.pathname !== nextLocation.pathname;
  }, [isDirty]));

  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return;
    asking.current = true;
    void confirm({
      title: t('settings.saveBar.leaveTitle', 'Leave without saving?'),
      message: t('settings.saveBar.leaveMessage', 'You have unsaved changes. They will be lost if you leave.'),
      confirmLabel: t('settings.saveBar.leaveConfirm', 'Leave'),
      cancelLabel: t('settings.saveBar.leaveCancel', 'Stay'),
      variant: 'warning',
    }).then((ok) => {
      asking.current = false;
      if (ok) blocker.proceed?.();
      else blocker.reset?.();
    });
  }, [blocker, confirm, t]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const allowNextNavigation = useCallback(() => { bypass.current = true; }, []);
  return { allowNextNavigation };
}
```

Copy the four fallbacks from the `settings.saveBar.leave*` values in `en.json`.

- [ ] **Step 4: Run it and watch it pass**

Run: the Step 2 command
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useNavigationGuard.ts frontend/src/hooks/__tests__/useNavigationGuard.test.tsx
git commit -m "feat(admin): a router-level guard for unsaved changes"
```

---

### Task 7: The event save bar

**Files:**
- Create: `frontend/src/pages/admin/event-details/EventSaveBar.tsx`
- Modify: `frontend/src/index.css` (toast offset while the bar shows)
- Modify: `frontend/src/i18n/locales/en.json`, `de.json`, `vi.json` (`events.saveBar.*`)
- Test: `frontend/src/pages/admin/event-details/__tests__/EventSaveBar.test.tsx`

**Interfaces:**
- Produces: `EventSaveBar({ count, isSaving, error, changedElsewhere, onSave, onDiscard })`: renders nothing when `count` is 0; otherwise a labelled region with a polite live count, Discard and Save; an `error` string is shown in an alert that takes focus; `changedElsewhere: string[]` (section labels) is listed as a warning. While shown it sets `document.body.dataset.saveBar = 'on'`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/admin/event-details/__tests__/EventSaveBar.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fb: string | { count?: number }, opts?: { count?: number; sections?: string }) => {
      if (k === 'events.saveBar.count') return `${(opts ?? (fb as { count: number })).count} unsaved`;
      if (k === 'events.saveBar.changedElsewhere') return `elsewhere: ${opts?.sections}`;
      return typeof fb === 'string' ? fb : k;
    },
  }),
}));

import { EventSaveBar } from '../EventSaveBar';

const props = { count: 2, isSaving: false, error: null, changedElsewhere: [], onSave: vi.fn(), onDiscard: vi.fn() };

it('is absent with nothing to save', () => {
  render(<EventSaveBar {...props} count={0} />);
  expect(screen.queryByRole('region')).toBeNull();
  expect(document.body.dataset.saveBar).toBeUndefined();
});

it('is a labelled region with a polite count', () => {
  render(<EventSaveBar {...props} />);
  expect(screen.getByRole('region', { name: 'Unsaved changes' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('2 unsaved');
  expect(document.body.dataset.saveBar).toBe('on');
});

it('saves and discards', async () => {
  render(<EventSaveBar {...props} />);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(props.onSave).toHaveBeenCalled();
  expect(props.onDiscard).toHaveBeenCalled();
});

it('moves focus to a failed save', () => {
  render(<EventSaveBar {...props} error="Feedback settings did not save." />);
  expect(screen.getByRole('alert')).toHaveFocus();
});

it('names the sections changed elsewhere', () => {
  render(<EventSaveBar {...props} changedElsewhere={['Details', 'Access']} />);
  expect(screen.getByText('elsewhere: Details, Access')).toBeInTheDocument();
});

it('disables both buttons while saving', () => {
  render(<EventSaveBar {...props} isSaving />);
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/pages/admin/event-details/__tests__/EventSaveBar.test.tsx`
Expected: FAIL: cannot resolve `../EventSaveBar`.

- [ ] **Step 3: Implement**

```tsx
// frontend/src/pages/admin/event-details/EventSaveBar.tsx
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/common';

interface EventSaveBarProps {
  count: number;
  isSaving: boolean;
  error: string | null;
  changedElsewhere: string[];
  onSave: () => void;
  onDiscard: () => void;
}

/**
 * The one save bar of the event page (spec 5.2). Sticky, so it pads the page
 * by its own height; toasts move above it through data-save-bar on <body>
 * (index.css). Not the shared SettingsSaveBar: that one registers with the
 * sidebar guard, and this page guards at the router instead.
 */
export const EventSaveBar: React.FC<EventSaveBarProps> = ({ count, isSaving, error, changedElsewhere, onSave, onDiscard }) => {
  const { t } = useTranslation();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const visible = count > 0;

  useEffect(() => {
    if (!visible) return undefined;
    document.body.dataset.saveBar = 'on';
    return () => { delete document.body.dataset.saveBar; };
  }, [visible]);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  if (!visible) return null;
  return (
    <section
      role="region"
      aria-label={t('events.saveBar.label', 'Unsaved changes')}
      className="sticky bottom-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 mt-6 px-4 sm:px-6 lg:px-8 py-3 bg-shell border-t border-line"
    >
      {error && (
        <p ref={errorRef} role="alert" tabIndex={-1} className="mb-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {changedElsewhere.length > 0 && (
        <p className="mb-2 text-sm text-amber-700 dark:text-amber-300">
          {t('events.saveBar.changedElsewhere', 'Changed elsewhere since you started: {{sections}}', { sections: changedElsewhere.join(', ') })}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        <span role="status" aria-live="polite" className="mr-auto text-sm text-body">
          {t('events.saveBar.count', { count })}
        </span>
        <Button variant="outline" onClick={onDiscard} disabled={isSaving}>
          {t('events.saveBar.discard', 'Discard')}
        </Button>
        <Button variant="primary" onClick={onSave} disabled={isSaving} isLoading={isSaving}>
          {t('events.saveBar.save', 'Save')}
        </Button>
      </div>
    </section>
  );
};
```

Check `Button`'s prop for a spinner (`isLoading` or `loading`) in `components/common/Button.tsx` and use its name; if it also changes the accessible name while loading, the "disables both buttons" test still finds it by `name: 'Save'` only if the label stays: keep the label text inside the button.

`index.css`, at the end:

```css
/* Keep toasts clear of the event page save bar (EventSaveBar). */
body[data-save-bar='on'] .Toastify__toast-container--bottom-right {
  bottom: 5rem;
}
```

Locales, a new `saveBar` object inside `events` in each file:
- `en`: `"label": "Unsaved changes"`, `"count_one": "{{count}} unsaved change"`, `"count_other": "{{count}} unsaved changes"`, `"discard": "Discard"`, `"save": "Save"`, `"changedElsewhere": "Changed elsewhere since you started: {{sections}}"`, `"failed": "Not saved: {{parts}}. Your other changes were saved."`, `"partEvent": "event details"`, `"partFeedback": "guest feedback"`, `"partQuota": "download allowance"`, `"partResolution": "download resolution"`
- `de`: `"label": "Ungespeicherte Änderungen"`, `"count_one": "{{count}} ungespeicherte Änderung"`, `"count_other": "{{count}} ungespeicherte Änderungen"`, `"discard": "Verwerfen"`, `"save": "Speichern"`, `"changedElsewhere": "Inzwischen anderswo geändert: {{sections}}"`, `"failed": "Nicht gespeichert: {{parts}}. Deine anderen Änderungen wurden gespeichert."`, `"partEvent": "Veranstaltungsdaten"`, `"partFeedback": "Gäste-Feedback"`, `"partQuota": "Download-Kontingent"`, `"partResolution": "Download-Auflösung"`
- `vi`: `"label": "Thay đổi chưa lưu"`, `"count_other": "{{count}} thay đổi chưa lưu"`, `"discard": "Bỏ thay đổi"`, `"save": "Lưu"`, `"changedElsewhere": "Đã bị thay đổi ở nơi khác từ lúc bạn bắt đầu: {{sections}}"`, `"failed": "Chưa lưu được: {{parts}}. Các thay đổi khác đã được lưu."`, `"partEvent": "thông tin sự kiện"`, `"partFeedback": "phản hồi của khách"`, `"partQuota": "hạn mức tải"`, `"partResolution": "độ phân giải tải về"`

Check whether `de.json` addresses the admin with "du" or "Sie" (search an existing admin string such as `settings.saveBar.leaveMessage`) and match it in `failed`.

- [ ] **Step 4: Run it and watch it pass**

Run: the Step 2 command, then `npm run lint`, `npm run build:check`
Expected: PASS, 6 tests; lint clean; build 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/event-details/EventSaveBar.tsx frontend/src/pages/admin/event-details/__tests__/EventSaveBar.test.tsx frontend/src/index.css frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json frontend/src/i18n/locales/vi.json
git commit -m "feat(events): the event page save bar"
```

---

### Task 8: Section rail, advanced areas and expert mode

**Files:**
- Create: `frontend/src/components/admin/SectionRailLayout.tsx`
- Create: `frontend/src/pages/admin/event-details/settings/AdvancedArea.tsx` (with `useExpertMode`)
- Modify: `frontend/src/i18n/locales/en.json`, `de.json`, `vi.json` (`events.settings.*`)
- Test: `frontend/src/components/admin/__tests__/SectionRailLayout.test.tsx`, `frontend/src/pages/admin/event-details/settings/__tests__/AdvancedArea.test.tsx`

**Interfaces:**
- Produces:
  - `SectionRailLayout({ label, sections: { id, label, dirty? }[], active, onSelect, children })`: a sticky rail from `md` up, a `<select>` below; a dirty section shows a dot with an accessible "unsaved changes" name; `aria-current="true"` on the active item.
  - `useExpertMode(): [boolean, (on: boolean) => void]`: stored in `localStorage` under `picpeak.eventSettings.expertMode`, every access in try/catch.
  - `AdvancedArea({ expert, children })`: a "Show advanced options" toggle (`aria-expanded`); the content shows when toggled open or when `expert` is on.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/admin/__tests__/SectionRailLayout.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, fb: string) => fb }) }));
import { SectionRailLayout } from '../SectionRailLayout';

const sections = [{ id: 'details', label: 'Details' }, { id: 'access', label: 'Access', dirty: true }];

it('marks the active section and a section with unsaved changes', () => {
  render(<SectionRailLayout label="Event settings" sections={sections} active="details" onSelect={vi.fn()}><p>body</p></SectionRailLayout>);
  const nav = screen.getByRole('navigation', { name: 'Event settings' });
  expect(nav.querySelector('[aria-current="true"]')).toHaveTextContent('Details');
  expect(screen.getAllByLabelText('unsaved changes').length).toBeGreaterThan(0);
  expect(screen.getByText('body')).toBeInTheDocument();
});

it('selects from the rail and from the mobile select', async () => {
  const onSelect = vi.fn();
  render(<SectionRailLayout label="Event settings" sections={sections} active="details" onSelect={onSelect}><p /></SectionRailLayout>);
  await userEvent.click(screen.getByRole('button', { name: /Access/ }));
  await userEvent.selectOptions(screen.getByRole('combobox'), 'access');
  expect(onSelect).toHaveBeenNthCalledWith(1, 'access');
  expect(onSelect).toHaveBeenNthCalledWith(2, 'access');
});
```

```tsx
// frontend/src/pages/admin/event-details/settings/__tests__/AdvancedArea.test.tsx
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, fb: string) => fb }) }));
import { AdvancedArea, useExpertMode } from '../AdvancedArea';

beforeEach(() => localStorage.clear());

it('is collapsed until opened', async () => {
  render(<AdvancedArea expert={false}><p>hidden stuff</p></AdvancedArea>);
  expect(screen.queryByText('hidden stuff')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Show advanced options' }));
  expect(screen.getByText('hidden stuff')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Hide advanced options' })).toHaveAttribute('aria-expanded', 'true');
});

it('is open in expert mode', () => {
  render(<AdvancedArea expert><p>shown</p></AdvancedArea>);
  expect(screen.getByText('shown')).toBeInTheDocument();
});

it('remembers expert mode per browser', () => {
  const { result } = renderHook(() => useExpertMode());
  act(() => result.current[1](true));
  expect(renderHook(() => useExpertMode()).result.current[0]).toBe(true);
});

it('survives a browser that refuses storage', () => {
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  const { result } = renderHook(() => useExpertMode());
  expect(result.current[0]).toBe(false);
  act(() => result.current[1](true));
  expect(result.current[0]).toBe(true);
  get.mockRestore(); set.mockRestore();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/components/admin/__tests__/SectionRailLayout.test.tsx src/pages/admin/event-details/settings/__tests__/AdvancedArea.test.tsx`
Expected: FAIL: modules cannot be resolved.

- [ ] **Step 3: Implement**

```tsx
// frontend/src/components/admin/SectionRailLayout.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

export interface RailSection { id: string; label: string; dirty?: boolean }

interface SectionRailLayoutProps {
  label: string;
  sections: RailSection[];
  active: string;
  onSelect: (id: string) => void;
  children: React.ReactNode;
}

/**
 * One section at a time with a grouped left rail (spec 5.1): sticky from md
 * up, a native select below. The Settings page's own rail moved into the
 * admin sidebar upstream (2cb6152c), so this is the shared layout now.
 */
export const SectionRailLayout: React.FC<SectionRailLayoutProps> = ({ label, sections, active, onSelect, children }) => {
  const { t } = useTranslation();
  const dot = <span aria-label={t('events.settings.unsaved', 'unsaved changes')} className="ml-2 inline-block h-2 w-2 rounded-full bg-accent" />;
  return (
    <div className="md:flex md:gap-6">
      <select
        className="md:hidden mb-4 w-full px-3 py-2 border border-line-strong rounded-lg bg-panel text-heading"
        value={active}
        onChange={(e) => onSelect(e.target.value)}
        aria-label={label}
      >
        {sections.map((s) => <option key={s.id} value={s.id}>{s.dirty ? `${s.label} *` : s.label}</option>)}
      </select>
      <nav aria-label={label} className="hidden md:block w-56 shrink-0 self-start sticky top-4">
        <ul className="space-y-1">
          {sections.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={s.id === active ? 'true' : undefined}
                className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-sm text-left ${
                  s.id === active ? 'bg-inset text-heading font-medium' : 'text-body hover:bg-inset'
                }`}
              >
                <span>{s.label}</span>
                {s.dirty && dot}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};
```

```tsx
// frontend/src/pages/admin/event-details/settings/AdvancedArea.tsx
import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

const EXPERT_KEY = 'picpeak.eventSettings.expertMode';

/** Expert mode opens every section's advanced controls; stored per browser (spec 5.3). */
export function useExpertMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => {
    try { return localStorage.getItem(EXPERT_KEY) === '1'; } catch { return false; }
  });
  const set = (next: boolean) => {
    setOn(next);
    try { localStorage.setItem(EXPERT_KEY, next ? '1' : '0'); } catch { /* storage refused: keep it for this visit */ }
  };
  return [on, set];
}

/** A section's "Show advanced options" row (spec 5.3). */
export const AdvancedArea: React.FC<{ expert: boolean; children: React.ReactNode }> = ({ expert, children }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const id = useId();
  const shown = expert || open;
  return (
    <div className="mt-6 border-t border-line pt-4">
      {!expert && (
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="text-sm font-medium text-accent">
          {open ? t('events.settings.hideAdvanced', 'Hide advanced options') : t('events.settings.showAdvanced', 'Show advanced options')}
        </button>
      )}
      {shown && <div id={id} className="mt-4 space-y-4">{children}</div>}
    </div>
  );
};
```

Locales, a new `settings` object inside `events` (check first that `events.settings` does not exist; if it does, add the keys to it):
- `en`: `"unsaved": "unsaved changes"`, `"showAdvanced": "Show advanced options"`, `"hideAdvanced": "Hide advanced options"`, `"expertMode": "Expert mode"`, `"expertModeHelp": "Show every section's advanced options"`, `"railLabel": "Event settings"`, `"tab": "Settings"`, `"sectionDetails": "Details"`, `"sectionAccess": "Access"`, `"sectionAppearance": "Appearance"`, `"sectionGuests": "Guest interaction"`, `"sectionDownloads": "Downloads"`, `"sectionAdvanced": "Advanced"`, `"sectionExtra": "Extra features"`, `"lockedPermission": "Locked: needs the {{permission}} permission"`, `"lockedArchived": "This event is archived. Its settings are read-only."`
- `de`: `"unsaved": "ungespeicherte Änderungen"`, `"showAdvanced": "Erweiterte Optionen anzeigen"`, `"hideAdvanced": "Erweiterte Optionen ausblenden"`, `"expertMode": "Expertenmodus"`, `"expertModeHelp": "Die erweiterten Optionen aller Bereiche anzeigen"`, `"railLabel": "Veranstaltungseinstellungen"`, `"tab": "Einstellungen"`, `"sectionDetails": "Details"`, `"sectionAccess": "Zugang"`, `"sectionAppearance": "Erscheinungsbild"`, `"sectionGuests": "Gäste-Interaktion"`, `"sectionDownloads": "Downloads"`, `"sectionAdvanced": "Erweitert"`, `"sectionExtra": "Zusatzfunktionen"`, `"lockedPermission": "Gesperrt: benötigt die Berechtigung {{permission}}"`, `"lockedArchived": "Diese Veranstaltung ist archiviert. Ihre Einstellungen sind schreibgeschützt."`
- `vi`: `"unsaved": "thay đổi chưa lưu"`, `"showAdvanced": "Hiện tùy chọn nâng cao"`, `"hideAdvanced": "Ẩn tùy chọn nâng cao"`, `"expertMode": "Chế độ chuyên gia"`, `"expertModeHelp": "Hiện tùy chọn nâng cao của mọi mục"`, `"railLabel": "Cài đặt sự kiện"`, `"tab": "Cài đặt"`, `"sectionDetails": "Thông tin"`, `"sectionAccess": "Truy cập"`, `"sectionAppearance": "Giao diện"`, `"sectionGuests": "Tương tác của khách"`, `"sectionDownloads": "Tải về"`, `"sectionAdvanced": "Nâng cao"`, `"sectionExtra": "Tính năng bổ sung"`, `"lockedPermission": "Đã khóa: cần quyền {{permission}}"`, `"lockedArchived": "Sự kiện này đã được lưu trữ. Cài đặt chỉ xem được."`

- [ ] **Step 4: Run them and watch them pass**

Run: the Step 2 command, `npm run lint`, `npm run build:check`
Expected: PASS; lint clean; build 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/SectionRailLayout.tsx frontend/src/components/admin/__tests__/SectionRailLayout.test.tsx frontend/src/pages/admin/event-details/settings frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json frontend/src/i18n/locales/vi.json
git commit -m "feat(admin): a section rail, advanced areas and expert mode"
```

---

### Task 9: The Settings tab, wired to the draft, with Details, Access and Advanced

This is the task that retires edit mode. The controls of the three sections it builds move out of `EventInformationCard`'s edit branch unchanged; the controls of the other sections stay in that branch, unreachable, until Tasks 10 to 13 move them, and Task 14 deletes what is left.

**Files:**
- Create: `frontend/src/pages/admin/event-details/settings/sectionFields.ts`
- Create: `frontend/src/pages/admin/event-details/settings/EventSettingsContext.tsx`
- Create: `frontend/src/pages/admin/event-details/settings/EventSettingsTab.tsx`
- Create: `frontend/src/pages/admin/event-details/settings/DetailsSection.tsx`, `AccessSection.tsx`, `AdvancedSection.tsx`
- Modify: `frontend/src/pages/admin/event-details/types.ts` (`EventDetailsTab` gains `'settings'`)
- Modify: `frontend/src/pages/admin/EventDetailsPage.tsx` (`ALL_TAB_KEYS`, the draft, the guard, the save handler, the Settings tab; edit mode removed)
- Modify: `frontend/src/pages/admin/event-details/EventTabs.tsx` (a Settings tab, last; the bar scrolls horizontally below `sm`)
- Modify: `frontend/src/pages/admin/event-details/EventDetailsHeader.tsx` (Edit, Save and Cancel removed; Manage feedback keyed on the saved feedback settings)
- Modify: `frontend/src/pages/admin/event-details/EventInformationCard.tsx` (the moved blocks leave its edit branch)
- Modify: `frontend/src/pages/admin/event-details/__tests__/noPerEventProtection.test.ts`, `publicGalleryWarningCopy.test.ts` (the file that now holds `allow_downloads` and the public gallery warning)
- Test: `frontend/src/pages/admin/event-details/settings/__tests__/EventSettingsTab.test.tsx`

**Interfaces:**
- Consumes: Tasks 3 to 8.
- Produces:
  - `SectionId = 'details' | 'access' | 'appearance' | 'guests' | 'downloads' | 'advanced' | 'extra'`; `SECTION_FIELDS: Record<SectionId, string[]>` (draft keys like `'event.welcome_message'`); `NOT_EDITABLE: string[]`; `sectionOf(key): SectionId | null`.
  - `EventSettingsContext` value `EventSettingsValue { event, editForm, setEditForm, feedbackSettings, setFeedbackSettings, theme, setTheme, draft, readOnly, expert, refetchEvent, categories }` and `useEventSettings()`.
  - `EventSettingsTab({ section, onSection })`: rail, expert mode switch, lock notice, the active section inside `<fieldset disabled={readOnly}>`.
  - `?tab=settings&section=<SectionId>` deep links.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/admin/event-details/settings/__tests__/EventSettingsTab.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { EventSettingsContext, type EventSettingsValue } from '../EventSettingsContext';
import { SECTION_FIELDS, sectionOf } from '../sectionFields';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, fb: string) => fb }) }));
vi.mock('../../../../../components/admin/CustomerAccountPicker', () => ({ CustomerAccountPicker: () => null }));
vi.mock('../../ExternalFolderPicker', () => ({ ExternalFolderPicker: () => null }));

import { EventSettingsTab } from '../EventSettingsTab';

const base = (over: Partial<EventSettingsValue> = {}): EventSettingsValue => ({
  event: { id: 1, customer_name: 'Anna' } as never,
  editForm: { customer_name: 'Anna', customer_email: '', customer_phone: '', expires_at: '', welcome_message: '', customer_accounts: [], require_password: true, new_password: '', confirm_new_password: '', source_mode: 'managed', external_path: '', external_watch: false, photo_cap: 0, default_photo_sort: 'upload_date_desc' } as never,
  setEditForm: vi.fn(),
  feedbackSettings: {} as never, setFeedbackSettings: vi.fn(),
  theme: { config: {} as never, preset: 'default' }, setTheme: vi.fn(),
  draft: { state: {}, count: 0, isDirty: false } as never,
  readOnly: false, lockReason: null, expert: false, setExpert: vi.fn(), refetchEvent: vi.fn(), categories: [],
  ...over,
});

const mount = (value: EventSettingsValue, section = 'details', onSection = vi.fn()) => render(
  <EventSettingsContext.Provider value={value}><EventSettingsTab section={section as never} onSection={onSection} /></EventSettingsContext.Provider>,
);

it('shows one section at a time', () => {
  mount(base());
  expect(screen.getByDisplayValue('Anna')).toBeInTheDocument();
  expect(screen.queryByText('Photo source')).toBeNull();
});

it('routes a change through the draft setter', async () => {
  const value = base();
  mount(value);
  await userEvent.type(screen.getByDisplayValue('Anna'), 'x');
  expect(value.setEditForm).toHaveBeenCalled();
});

it('switches section through the rail', async () => {
  const onSection = vi.fn();
  mount(base(), 'details', onSection);
  await userEvent.click(screen.getByRole('button', { name: /Advanced/ }));
  expect(onSection).toHaveBeenCalledWith('advanced');
});

it('puts a dot on a section with unsaved changes', () => {
  mount(base({ draft: { state: { 'event.photo_cap': { base: 0, value: 5 } }, count: 1, isDirty: true } as never }));
  expect(sectionOf('event.photo_cap')).toBe('advanced');
  expect(screen.getAllByLabelText('unsaved changes').length).toBeGreaterThan(0);
});

it('locks every control and says why', () => {
  mount(base({ readOnly: true, lockReason: 'Locked: needs the events.edit permission' }));
  expect(screen.getByText('Locked: needs the events.edit permission')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Anna')).toBeDisabled();
});

it('assigns every field to exactly one section', () => {
  const all = Object.values(SECTION_FIELDS).flat();
  expect(new Set(all).size).toBe(all.length);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/pages/admin/event-details/settings/__tests__/EventSettingsTab.test.tsx`
Expected: FAIL: modules cannot be resolved.

- [ ] **Step 3: Implement the registry and the context**

```ts
// frontend/src/pages/admin/event-details/settings/sectionFields.ts
/**
 * Every editable field and the one section that edits it (spec 5.1, "every
 * setting has exactly one place"). Keys are draft keys: "<part>.<field>".
 * The inventory test (Task 15) holds the page to this list.
 */
export type SectionId = 'details' | 'access' | 'appearance' | 'guests' | 'downloads' | 'advanced' | 'extra';

export const SECTION_ORDER: SectionId[] = ['details', 'access', 'appearance', 'guests', 'downloads', 'advanced', 'extra'];

const FEEDBACK = [
  'feedback_enabled', 'allow_ratings', 'allow_likes', 'allow_comments', 'allow_favorites', 'allow_reactions',
  'allow_color_labels', 'require_name_email', 'moderate_comments', 'show_feedback_to_guests', 'keybind_mode',
  'identity_mode', 'max_favorites_per_guest', 'max_likes_per_guest',
].map((f) => `feedback.${f}`);

export const SECTION_FIELDS: Record<SectionId, string[]> = {
  details: ['customer_name', 'customer_email', 'customer_phone', 'customer_accounts', 'expires_at', 'welcome_message'].map((f) => `event.${f}`),
  access: ['require_password', 'new_password', 'confirm_new_password', 'client_access_enabled', 'client_password'].map((f) => `event.${f}`),
  appearance: [
    '__theme', 'css_template_id', 'hero_photo_id', 'og_image_share_enabled', 'hero_image_anchor', 'hero_logo_visible',
    'hero_logo_size', 'hero_logo_position', 'login_logo_visible', 'promo_mode', 'promo_markdown', 'info_mode', 'info_markdown',
  ].map((f) => `event.${f}`),
  guests: [
    ...['allow_user_uploads', 'upload_category_id', 'guest_name_mode', 'show_credits_to_guests', 'reveal_mode', 'reveal_at'].map((f) => `event.${f}`),
    ...FEEDBACK,
  ],
  downloads: [
    'event.allow_downloads', 'quota.quota_enabled', 'quota.auto_approve', 'quota.free_limit', 'quota.price_per_photo',
    'resolution.download_standard_resolution', 'resolution.download_resolution_picker_enabled', 'resolution.download_allow_original',
  ],
  advanced: ['source_mode', 'external_path', 'external_watch', 'photo_cap', 'default_photo_sort'].map((f) => `event.${f}`),
  extra: [],
};

/** In the form state but edited nowhere: no UI (protection_level) or replaced by the theme draft (color_theme). */
export const NOT_EDITABLE = ['event.protection_level', 'event.color_theme'];

export function sectionOf(key: string): SectionId | null {
  return SECTION_ORDER.find((id) => SECTION_FIELDS[id].includes(key)) ?? null;
}
```

```tsx
// frontend/src/pages/admin/event-details/settings/EventSettingsContext.tsx
import { createContext, useContext, type SetStateAction } from 'react';
import type { Event, FeedbackSettings } from '../../../../types';
import type { EditFormState, ThemeDraft } from '../types';
import type { EventDraft } from '../draft/useEventDraft';

export interface EventSettingsValue {
  event: Event;
  editForm: EditFormState;
  setEditForm: (action: SetStateAction<EditFormState>) => void;
  feedbackSettings: FeedbackSettings;
  setFeedbackSettings: (action: SetStateAction<FeedbackSettings>) => void;
  theme: ThemeDraft;
  setTheme: (fn: (current: ThemeDraft) => ThemeDraft) => void;
  draft: EventDraft;
  readOnly: boolean;
  lockReason: string | null;
  expert: boolean;
  setExpert: (on: boolean) => void;
  refetchEvent: () => void;
  categories: Array<{ id: number; name: string; slug: string; is_folder?: boolean }>;
}

export const EventSettingsContext = createContext<EventSettingsValue | null>(null);

export function useEventSettings(): EventSettingsValue {
  const value = useContext(EventSettingsContext);
  if (!value) throw new Error('useEventSettings must be used inside the event Settings tab');
  return value;
}
```

Import `FeedbackSettings` from wherever `EventInformationCard.tsx` imports its `FeedbackSettingsType` today, and use that type. Tasks 10 to 13 add the fields their sections need (hero photos, CSS templates, quota and resolution draft callbacks) to `EventSettingsValue`.

- [ ] **Step 4: Implement the tab and the three sections**

```tsx
// frontend/src/pages/admin/event-details/settings/EventSettingsTab.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { SectionRailLayout } from '../../../../components/admin/SectionRailLayout';
import { useEventSettings } from './EventSettingsContext';
import { SECTION_FIELDS, SECTION_ORDER, type SectionId } from './sectionFields';
import { DetailsSection } from './DetailsSection';
import { AccessSection } from './AccessSection';
import { AdvancedSection } from './AdvancedSection';

const LABELS: Record<SectionId, [string, string]> = {
  details: ['events.settings.sectionDetails', 'Details'],
  access: ['events.settings.sectionAccess', 'Access'],
  appearance: ['events.settings.sectionAppearance', 'Appearance'],
  guests: ['events.settings.sectionGuests', 'Guest interaction'],
  downloads: ['events.settings.sectionDownloads', 'Downloads'],
  advanced: ['events.settings.sectionAdvanced', 'Advanced'],
  extra: ['events.settings.sectionExtra', 'Extra features'],
};

// Tasks 10 to 14 add their section here as they build it.
const SECTIONS: Partial<Record<SectionId, React.FC>> = {
  details: DetailsSection,
  access: AccessSection,
  advanced: AdvancedSection,
};

export const useSectionLabel = () => {
  const { t } = useTranslation();
  return (id: SectionId) => t(LABELS[id][0], LABELS[id][1]);
};

export const EventSettingsTab: React.FC<{ section: SectionId; onSection: (id: SectionId) => void }> = ({ section, onSection }) => {
  const { t } = useTranslation();
  const label = useSectionLabel();
  const { draft, readOnly, lockReason, expert, setExpert } = useEventSettings();
  const available = SECTION_ORDER.filter((id) => SECTIONS[id]);
  const active = available.includes(section) ? section : available[0];
  const Active = SECTIONS[active] as React.FC;
  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <label className="flex items-center gap-2 text-sm text-body">
          <input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} />
          <span>{t('events.settings.expertMode', 'Expert mode')}</span>
        </label>
      </div>
      {lockReason && <p className="mb-4 rounded-md bg-inset px-3 py-2 text-sm text-body">{lockReason}</p>}
      <SectionRailLayout
        label={t('events.settings.railLabel', 'Event settings')}
        sections={available.map((id) => ({ id, label: label(id), dirty: SECTION_FIELDS[id].some((k) => k in draft.state) }))}
        active={active}
        onSelect={(id) => onSection(id as SectionId)}
      >
        <fieldset disabled={readOnly} className="min-w-0">
          <Active />
        </fieldset>
      </SectionRailLayout>
    </div>
  );
};
```

Each section is a small component that reads the context and holds the moved JSX. The pattern, shown for Details:

```tsx
// frontend/src/pages/admin/event-details/settings/DetailsSection.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../../components/common';
import { useEventSettings } from './EventSettingsContext';
import { AdvancedArea } from './AdvancedArea';

export const DetailsSection: React.FC = () => {
  const { t } = useTranslation();
  const { event, editForm, setEditForm, expert } = useEventSettings();
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionDetails', 'Details')}</h2>
      <div className="space-y-4">
        {/* MOVED from EventInformationCard's edit branch, unchanged, in this order:
            the customer_name input block (label t('events.hostName')),
            the customer_email input block (t('events.hostEmail')),
            the customer_phone block with its event_phone_field_enabled condition (t('events.customerPhone')),
            the CustomerAccountPicker,
            the expires_at block (t('events.expirationDate')). */}
      </div>
      <AdvancedArea expert={expert}>
        {/* MOVED: the welcome_message block (t('events.welcomeMessageLabel')). */}
      </AdvancedArea>
    </Card>
  );
};
```

The two `MOVED` comments are cut-and-paste instructions: find each block in `EventInformationCard.tsx`'s edit branch by the i18n key named, cut the whole block (its wrapping `<div>`), paste it where the comment is, and delete the comment. The pasted JSX keeps reading `editForm.x` and calling `setEditForm(prev => ...)`, which the context now provides; any other identifier it uses (`event`, `t`, a helper, an icon) is imported or read from the context the same way. Nothing inside a moved block is edited.

`AccessSection.tsx`, same pattern, heading `events.settings.sectionAccess`: MOVED the `require_password` toggle with its public gallery warning (`t('events.requirePasswordToggle')`, `t('events.publicGalleryWarning', ...)`), and the new / confirm password block (`t('events.newPasswordLabel')`, `t('events.confirmPassword')`) with its show-password toggle; the section keeps a local `const [showNewPassword, setShowNewPassword] = useState(false);` since the page no longer owns it. No advanced area. (Client access joins this section in Task 13.)

`AdvancedSection.tsx`, heading `events.settings.sectionAdvanced`, everything inside one `AdvancedArea` (the spec lists no visible controls for Advanced): MOVED the source mode block (`t('events.sourceMode')`), the external folder picker (`t('events.externalFolder')`), the watch folder block with its `photos.upload` lock (`t('events.externalWatch')`), the photo limit (`t('events.photoCap')`), and the default sort (`t('photoSort.defaultSort')`).

- [ ] **Step 5: Wire the page and retire edit mode**

`types.ts`: `export type EventDetailsTab = 'overview' | 'photos' | 'categories' | 'guests' | 'downloads' | 'settings';`.

`EventTabs.tsx`: add a Settings tab button after Downloads, label `t('events.settings.tab', 'Settings')`, same markup as the others; add `overflow-x-auto` (and `whitespace-nowrap` on the buttons) to the tab bar container so it scrolls below `sm`.

`EventDetailsPage.tsx`:
1. Add `'settings'` to `ALL_TAB_KEYS`.
2. Delete `isEditing`, the `editForm` `useState`, the `feedbackSettings` `useState` and the effect that copies the server feedback into it, `showNewPassword`, `currentTheme`, `currentPresetName`, `themeChanged`, `handleStartEdit` and `handleSaveEdit`. Keep `updateMutation` only if another caller still uses it (`rg -n "updateMutation" src/pages/admin/EventDetailsPage.tsx`).
3. After the queries, add:

```tsx
  const draft = useEventDraft();
  const serverForm = useMemo(() => (event ? eventFormValues(event) : INITIAL_EDIT_FORM), [event]);
  const [editForm, setEditForm] = useDraftObject(draft, 'event', serverForm);
  const serverFeedback = useMemo(() => (eventFeedbackSettings ?? {}) as FeedbackSettingsType, [eventFeedbackSettings]);
  const [feedbackSettings, setFeedbackSettings] = useDraftObject(draft, 'feedback', serverFeedback);
  const serverTheme = useMemo(
    () => (event ? themeValue(event, publicSettings?.theme_config as ThemeConfig | undefined) : { config: GALLERY_THEME_PRESETS.default.config, preset: 'default' }),
    [event, publicSettings?.theme_config],
  );
  const theme = (draft.state['event.__theme']?.value as ThemeDraft | undefined) ?? serverTheme;
  const setTheme = useCallback(
    (fn: (current: ThemeDraft) => ThemeDraft) => draft.update('event', '__theme', (cur) => fn(cur as ThemeDraft), serverTheme),
    [draft.update, serverTheme],
  );
  const { allowNextNavigation } = useNavigationGuard(draft.isDirty);
  const [expert, setExpert] = useExpertMode();
  const { hasPermission } = usePermissions();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const section = (searchParams.get('section') as SectionId | null) ?? 'details';
  const setSection = (id: SectionId) => {
    const next = new URLSearchParams(searchParams);
    next.set('section', id);
    setSearchParams(next, { replace: true });
  };
```

   (use the page's existing `searchParams` / `setSearchParams`; add the imports.)
4. The save handler:

```tsx
  const PART_LABEL: Record<DraftPart, [string, string]> = {
    event: ['events.saveBar.partEvent', 'event details'],
    feedback: ['events.saveBar.partFeedback', 'guest feedback'],
    quota: ['events.saveBar.partQuota', 'download allowance'],
    resolution: ['events.saveBar.partResolution', 'download resolution'],
  };

  const handleSave = async () => {
    if (!event) return;
    const changed = new Set(Object.keys(changesFor(draft.state, 'event')));
    const invalid = validateDraft(changed, editForm, serverForm);
    if (invalid) { toast.error(t(invalid.key, invalid.fallback)); return; }
    setIsSaving(true);
    setSaveError(null);
    const result = await runSave(draft.state, () => buildEventPayload(changed, editForm, theme, serverTheme), {
      updateEvent: (payload) => eventsService.updateEvent(event.id, payload),
      updateFeedback: (payload) => feedbackService.updateEventFeedbackSettings(String(event.id), payload),
      updateQuota: (payload) => api.put(`/admin/events/${event.id}/download-quota`, payload),
      updateResolution: (payload) => api.patch(`/admin/events/${event.id}/download-resolutions`, payload),
    });
    setIsSaving(false);
    draft.dropParts(result.saved);
    if (result.saved.includes('event')) queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    if (result.saved.includes('feedback')) queryClient.invalidateQueries({ queryKey: ['admin-event-feedback-settings', id] });
    if (result.saved.includes('quota')) queryClient.invalidateQueries({ queryKey: ['admin-download-quota', event.id] });
    if (result.saved.includes('resolution')) {
      queryClient.invalidateQueries({ queryKey: ['event-download-resolutions', event.id] });
      refetchEvent();
    }
    if (result.failed) {
      const [key, fallback] = PART_LABEL[result.failed.part];
      setSaveError(t('events.saveBar.failed', 'Not saved: {{parts}}. Your other changes were saved.', { parts: t(key, fallback) }));
    } else {
      toast.success(t('events.eventUpdated', 'Event updated successfully'));
    }
  };
```

   Check the success key the old `updateMutation.onSuccess` toasted and use it; check whether `feedbackService.updateEventFeedbackSettings` types its payload as a full settings object and widen it to `Partial<...>` if so (the backend accepts a partial body, `pickSettingsColumns`); check the quota and resolution query keys against `DownloadQuotaCard.tsx` and `DownloadResolutionCard.tsx` (numeric `eventId`).
5. `lockReason`: `event.is_archived ? t('events.settings.lockedArchived', ...) : !hasPermission('events.edit') ? t('events.settings.lockedPermission', 'Locked: needs the {{permission}} permission', { permission: 'events.edit' }) : null`; `readOnly = lockReason !== null`.
6. Render, next to the other tabs:

```tsx
      {activeTab === 'settings' && (
        <EventSettingsContext.Provider value={{
          event, editForm, setEditForm, feedbackSettings, setFeedbackSettings, theme, setTheme, draft,
          readOnly, lockReason, expert, setExpert, refetchEvent, categories: categories ?? [],
        }}>
          <EventSettingsTab section={section} onSection={setSection} />
        </EventSettingsContext.Provider>
      )}
      {!readOnly && (
        <EventSaveBar
          count={draft.count}
          isSaving={isSaving}
          error={saveError}
          changedElsewhere={changedElsewhereSections}
          onSave={handleSave}
          onDiscard={() => { draft.discard(); setSaveError(null); }}
        />
      )}
```

   with

```tsx
  const sectionLabel = useSectionLabel();
  const changedElsewhereSections = useMemo(() => {
    const server: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(serverForm)) server[`event.${k}`] = v;
    for (const [k, v] of Object.entries(serverFeedback)) server[`feedback.${k}`] = v;
    server['event.__theme'] = serverTheme;
    const ids = new Set<SectionId>();
    for (const key of Object.keys(draft.state)) {
      if (key in server && isChangedElsewhere(draft.state, key, server[key])) {
        const id = sectionOf(key);
        if (id) ids.add(id);
      }
    }
    return [...ids].map(sectionLabel);
  }, [draft.state, serverForm, serverFeedback, serverTheme, sectionLabel]);
```

   The bar sits outside the tab so it stays while the user looks at another tab.
7. Every place the page navigates away on its own (the duplicate mutation's `navigate` to the new event, a post-delete or post-archive redirect if any) calls `allowNextNavigation()` just before `navigate(...)`.
8. `EventDetailsHeader`: delete the Edit button, the Cancel and Save buttons and their props (`isEditing`, `setIsEditing`, `handleStartEdit`, `handleSaveEdit`, `updateMutation`); Manage feedback reads the saved `eventFeedbackSettings?.feedback_enabled` (pass `eventFeedbackSettings` instead of the local state); View gallery is no longer hidden while editing.
9. `OverviewTab` and `EventInformationCard`: pass `isEditing={false}` for now and drop `showNewPassword` / `setShowNewPassword` from their props; Task 14 removes the rest of the edit branch.

In `noPerEventProtection.test.ts`, the "keeps Allow downloads" case reads `EventInformationCard.tsx` until Task 12 moves the control; leave it. In `publicGalleryWarningCopy.test.ts`, point the event page case at `src/pages/admin/event-details/settings/AccessSection.tsx`.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run src/pages/admin/event-details src/pages/admin/__tests__`, `npm run lint`, `npm run build:check`
Expected: PASS; lint clean; build 0. `eventDetailsPhotosTab.test.tsx` mocks `feedbackService`; if the page now also needs `usePermissions` or `useSearchParams` values it does not mock, add them to its mocks rather than changing the page.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/admin
git commit -m "feat(events): a Settings tab with one save bar replaces edit mode"
```

---

### Task 10: Appearance

**Files:**
- Create: `frontend/src/pages/admin/event-details/settings/AppearanceSection.tsx`
- Modify: `frontend/src/pages/admin/event-details/settings/EventSettingsContext.tsx` (`heroPhotos`, `cssTemplates`)
- Modify: `frontend/src/pages/admin/event-details/settings/EventSettingsTab.tsx` (register `appearance`)
- Modify: `frontend/src/pages/admin/event-details/EventThemeSection.tsx` (driven by the theme draft)
- Modify: `frontend/src/pages/admin/EventDetailsPage.tsx` (CSS templates as a query, an unfiltered hero picker photos query, both enabled on the Settings tab)
- Modify: `frontend/src/pages/admin/event-details/EventInformationCard.tsx` (the logo handlers invalidate `['admin-event', id]`; moved blocks leave the edit branch)
- Test: `frontend/src/pages/admin/event-details/settings/__tests__/AppearanceSection.test.tsx`

**Interfaces:**
- Consumes: `theme` / `setTheme` from the context (Task 9), `themePayload` behaviour (Task 5).
- Produces: `EventSettingsValue` gains `heroPhotos: Photo[]` and `cssTemplates: EnabledTemplate[]`. `EventThemeSection` props become `{ event, theme, setTheme, editForm, setEditForm, cssTemplates }`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/admin/event-details/settings/__tests__/AppearanceSection.test.tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, fb: string) => fb }) }));
let themeProps: { onChange: (t: unknown) => void; onPresetChange?: (p: string) => void } | null = null;
vi.mock('../../../../../components/admin/ThemeCustomizerEnhanced', () => ({
  ThemeCustomizerEnhanced: (p: typeof themeProps) => { themeProps = p; return <p>customizer</p>; },
}));
vi.mock('../../../../../components/admin/HeroPhotoSelector', () => ({ HeroPhotoSelector: () => <p>hero picker</p> }));

import { EventSettingsContext } from '../EventSettingsContext';
import { AppearanceSection } from '../AppearanceSection';

const setTheme = vi.fn();
const mount = () => render(
  <EventSettingsContext.Provider value={{
    event: { id: 1 } as never, editForm: { promo_mode: 'inherit', info_mode: 'inherit' } as never, setEditForm: vi.fn(),
    feedbackSettings: {} as never, setFeedbackSettings: vi.fn(),
    theme: { config: { primaryColor: '#111' } as never, preset: 'default' }, setTheme,
    draft: { state: {} } as never, readOnly: false, lockReason: null, expert: true, setExpert: vi.fn(),
    refetchEvent: vi.fn(), categories: [], heroPhotos: [], cssTemplates: [],
  }}><AppearanceSection /></EventSettingsContext.Provider>,
);

it('shows the hero picker and the theme customizer', () => {
  mount();
  expect(screen.getByText('hero picker')).toBeInTheDocument();
  expect(screen.getByText('customizer')).toBeInTheDocument();
});

it('sends theme and preset changes through the draft updater', () => {
  mount();
  themeProps?.onChange({ primaryColor: '#222' });
  themeProps?.onPresetChange?.('custom');
  expect(setTheme).toHaveBeenCalledTimes(2);
  const [first, second] = setTheme.mock.calls.map(([fn]) => fn);
  const start = { config: { primaryColor: '#111' }, preset: 'default' };
  expect(second(first(start))).toEqual({ config: { primaryColor: '#222' }, preset: 'custom' });
});

it('refreshes the page query after a logo upload or removal', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../AppearanceSection.tsx'), 'utf8');
  expect(src).not.toMatch(/queryKey: \['event', /);
  expect(src).toMatch(/queryKey: \['admin-event', /);
});
```

Check the import paths of `ThemeCustomizerEnhanced` and `HeroPhotoSelector` in `EventThemeSection.tsx` / `EventInformationCard.tsx` and match the mocks to them.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/pages/admin/event-details/settings/__tests__/AppearanceSection.test.tsx`
Expected: FAIL: `../AppearanceSection` cannot be resolved.

- [ ] **Step 3: Implement**

`EventThemeSection.tsx`: replace the props `isEditing`, `currentTheme`, `setCurrentTheme`, `currentPresetName`, `setCurrentPresetName`, `setThemeChanged` with `theme: ThemeDraft` and `setTheme: (fn: (c: ThemeDraft) => ThemeDraft) => void`; render only the customizer branch (the `ThemeDisplay` branch goes with edit mode), wired as:

```tsx
        <ThemeCustomizerEnhanced
          value={theme.config}
          onChange={(config) => setTheme((c) => ({ ...c, config }))}
          presetName={theme.preset}
          onPresetChange={(preset) => setTheme((c) => ({ ...c, preset }))}
          /* every other prop it passes today, unchanged */
        />
```

   Keep its CSS template wiring (`css_template_id` through `editForm` / `setEditForm`) as it is.

`AppearanceSection.tsx`, the Task 9 pattern, heading `events.settings.sectionAppearance`:
- visible: MOVED the `HeroPhotoSelector` block (`t('events.heroPhoto')`), fed `heroPhotos` from the context where it took the page's photos; then `<EventThemeSection event={event} theme={theme} setTheme={setTheme} editForm={editForm} setEditForm={setEditForm} cssTemplates={cssTemplates} />`.
- `AdvancedArea`: MOVED, in order: hero crop (`t('events.heroImageAnchor')`), hero as social preview (`t('events.ogShare.title')`), logo in hero (`t('events.heroLogoVisible')`), hero logo size (`t('events.heroLogoSize')`), hero logo position (`t('events.heroLogoPosition')`), the event logo upload / replace / remove block (`t('events.uploadEventLogo')`) with its two handlers, the password page logo (`t('events.loginLogoVisible')`), the promotional banner (`t('events.promoBanner.*')`), the info banner (`t('events.infoBanner.*')`).
- The moved logo handlers change one thing each, per finding 14: `queryClient.invalidateQueries({ queryKey: ['event', id] })` becomes `queryClient.invalidateQueries({ queryKey: ['admin-event', String(event.id)] })`. They stay actions (they upload or delete at once).

`EventDetailsPage.tsx`:
- CSS templates: replace the `useEffect` that loads them in edit mode with `const { data: cssTemplates = [] } = useQuery({ queryKey: ['css-templates-enabled'], queryFn: <the same call the effect made>, enabled: activeTab === 'settings' });`.
- Hero picker photos, not filtered by the Photos tab (spec P2): `const { data: heroPhotosData } = useQuery({ queryKey: ['admin-event-photos', id, 'hero-picker'], queryFn: () => photosService.getEventPhotos(<id>, {}), enabled: activeTab === 'settings' && !!id });` using the same service call as the filtered query with no filters; pass its photo list as `heroPhotos`. The filtered photos query stays enabled for the Photos tab only (drop its `|| isEditing`).
- Add `heroPhotos` and `cssTemplates` to the context value; add both fields to `EventSettingsValue`; register `appearance: AppearanceSection` in `SECTIONS`. Add `heroPhotos: [], cssTemplates: []` to the `base()` fixture of the Task 9 test, since `build:check` type-checks test files.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/pages/admin/event-details src/pages/admin/__tests__`, `npm run lint`, `npm run build:check`
Expected: PASS; lint clean; build 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin
git commit -m "feat(events): the Appearance section, and logo changes refresh the page"
```

---

### Task 11: Guest interaction, and the feedback page loses its Settings tab

**Files:**
- Create: `frontend/src/pages/admin/event-details/settings/GuestInteractionSection.tsx`
- Modify: `frontend/src/pages/admin/event-details/settings/EventSettingsTab.tsx` (register `guests`)
- Modify: `frontend/src/pages/admin/EventFeedbackPage.tsx` (no Settings tab; default tab Feedback; one query key; a link to Settings > Guest interaction)
- Modify: `frontend/src/pages/admin/event-details/EventInformationCard.tsx` (moved blocks leave the edit branch)
- Test: `frontend/src/pages/admin/event-details/settings/__tests__/GuestInteractionSection.test.tsx`, `frontend/src/pages/admin/__tests__/eventFeedbackPageNoSettings.test.ts`

**Interfaces:**
- Consumes: `feedbackSettings` / `setFeedbackSettings` from the context.
- Produces: feedback settings are edited only in Settings > Guest interaction and saved by the bar; the one query key for them is `['admin-event-feedback-settings', id]`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/pages/admin/event-details/settings/__tests__/GuestInteractionSection.test.tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, fb: string) => fb }) }));
let fbProps: { settings: unknown; onChange: (s: unknown) => void } | null = null;
vi.mock('../../../../../components/admin/FeedbackSettings', () => ({
  FeedbackSettings: (p: typeof fbProps) => { fbProps = p; return <p>feedback controls</p>; },
}));

import { EventSettingsContext } from '../EventSettingsContext';
import { GuestInteractionSection } from '../GuestInteractionSection';

it('edits the feedback settings through the draft, not a request', () => {
  const setFeedbackSettings = vi.fn();
  render(
    <EventSettingsContext.Provider value={{
      event: { id: 1 } as never, editForm: { allow_user_uploads: false } as never, setEditForm: vi.fn(),
      feedbackSettings: { feedback_enabled: false } as never, setFeedbackSettings,
      theme: { config: {} as never, preset: 'default' }, setTheme: vi.fn(), draft: { state: {} } as never,
      readOnly: false, lockReason: null, expert: false, setExpert: vi.fn(), refetchEvent: vi.fn(), categories: [],
      heroPhotos: [], cssTemplates: [],
    }}><GuestInteractionSection /></EventSettingsContext.Provider>,
  );
  expect(screen.getByText('feedback controls')).toBeInTheDocument();
  fbProps?.onChange({ feedback_enabled: true });
  expect(setFeedbackSettings).toHaveBeenCalledWith({ feedback_enabled: true });
  expect(screen.queryByText(/allowUserUploads|Allow guest uploads/)).toBeNull();
});
```

```ts
// frontend/src/pages/admin/__tests__/eventFeedbackPageNoSettings.test.ts
/**
 * Feedback settings have one home, Settings > Guest interaction (spec 5.1),
 * and one query key; the feedback page keeps moderation and links there.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.resolve(__dirname, '../EventFeedbackPage.tsx'), 'utf8');

describe('EventFeedbackPage', () => {
  it('no longer edits feedback settings', () => {
    expect(src).not.toMatch(/<FeedbackSettings\b/);
    expect(src).not.toMatch(/updateSettingsMutation/);
  });
  it('reads the settings under the event page key', () => {
    expect(src).not.toMatch(/\['feedback-settings', /);
    expect(src).toMatch(/\['admin-event-feedback-settings', /);
  });
  it('links to Settings > Guest interaction', () => {
    expect(src).toMatch(/tab=settings&section=guests/);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/pages/admin/event-details/settings/__tests__/GuestInteractionSection.test.tsx src/pages/admin/__tests__/eventFeedbackPageNoSettings.test.ts`
Expected: FAIL: the section cannot be resolved; the page still renders `<FeedbackSettings` and uses `['feedback-settings', `.

- [ ] **Step 3: Implement**

`GuestInteractionSection.tsx`, heading `events.settings.sectionGuests`:
- visible: MOVED the feedback settings block (the `<FeedbackSettings settings={feedbackSettings} onChange={setFeedbackSettings} />` usage in the edit branch), now fed from the context.
- `AdvancedArea`, the controls P3 removes: MOVED guest uploads (`t('events.allowUserUploads')`), upload category (`t('events.uploadCategory')`, reads `categories` from the context), `UploaderNameSettings` (`t('events.uploaderNames.label')`), reveal mode and reveal time (`t('events.revealMode')`, `t('events.revealAt')`), each with its existing condition.

Register `guests: GuestInteractionSection`.

`EventFeedbackPage.tsx`:
- Delete the Settings tab button and panel, `updateSettingsMutation`, and the `FeedbackSettings` import; the default tab becomes `'feedback'` (the `activeTab` initial state).
- Change `['feedback-settings', id]` to `['admin-event-feedback-settings', id]` wherever the page queries the settings (keep the query if the page still reads `feedback_enabled` or another value from it; delete it if nothing reads it).
- In the header, next to Back, a link: `<Link to={`/admin/events/${id}?tab=settings&section=guests`} className="text-sm font-medium text-accent">{t('feedback.editSettingsLink', 'Feedback settings')}</Link>`; add `feedback.editSettingsLink` to `en` ("Feedback settings"), `de` ("Feedback-Einstellungen"), `vi` ("Cài đặt phản hồi").

- [ ] **Step 4: Run them and watch them pass**

Run: the Step 2 command, `npx vitest run src/pages/admin src/components/admin/__tests__/FeedbackSettings.identityMode.test.tsx src/components/admin/__tests__/FeedbackSettings.noRateLimitControls.test.tsx`, `npm run lint`, `npm run build:check`
Expected: PASS; lint clean; build 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json frontend/src/i18n/locales/vi.json
git commit -m "feat(events): feedback settings live in Settings, saved by the bar"
```

---

### Task 12: Downloads, with the allowance and the resolution in the draft

**Files:**
- Create: `frontend/src/pages/admin/event-details/settings/DownloadsSection.tsx`
- Modify: `frontend/src/components/admin/DownloadQuotaCard.tsx` (a `part` prop and draft props)
- Modify: `frontend/src/components/admin/DownloadResolutionCard.tsx` (draft props)
- Modify: `frontend/src/pages/admin/event-details/settings/EventSettingsTab.tsx` (register `downloads`)
- Modify: `frontend/src/pages/admin/event-details/EventInformationCard.tsx` (the Allow downloads block leaves the edit branch)
- Modify: `frontend/src/pages/admin/event-details/__tests__/noPerEventProtection.test.ts` (Allow downloads now lives in `DownloadsSection.tsx`)
- Rewrite: `frontend/src/components/admin/__tests__/DownloadQuotaCard.test.tsx`, `frontend/src/components/admin/__tests__/DownloadCards.downloadsDisabled.test.tsx`

**Interfaces:**
- Consumes: `draft` from the context; `runSave` sends `quota.*` to `PUT /admin/events/:id/download-quota` and `resolution.*` to `PATCH /admin/events/:id/download-resolutions` (Task 9).
- Produces:
  - `DownloadQuotaCard` props gain `part?: 'status' | 'switches' | 'amounts'` (absent = today's whole card) and `draftValues?: Record<string, unknown>`, `onDraftChange?: (name: string, value: unknown, serverValue: unknown) => void`. With `onDraftChange`, the enable and auto-approve switches and the free limit and price fields call it instead of saving, show `draftValues[name]` over the server value, and the "Save allowance" button is not rendered. Create order stays an action in every mode.
  - `DownloadResolutionCard` props gain the same two draft props; with `onDraftChange` its three controls call it and its own Save button is not rendered.

- [ ] **Step 1: Rewrite the pinned tests (they fail against today's cards)**

In `DownloadQuotaCard.test.tsx`, keep the file's mocks and fixtures, keep the "a saved zero stays visible" and the create order cases, and replace the save cases with:

```tsx
describe('in the event Settings draft', () => {
  const onDraftChange = vi.fn();
  beforeEach(() => onDraftChange.mockReset());

  it('puts the enable switch in the draft instead of saving', async () => {
    renderCard({ part: 'switches', onDraftChange, draftValues: {} });
    await userEvent.click(await screen.findByRole('switch', { name: /enable/i }));
    expect(onDraftChange).toHaveBeenCalledWith('quota_enabled', true, false);
    expect(apiPut).not.toHaveBeenCalled();
  });

  it('puts auto-approve in the draft', async () => {
    renderCard({ part: 'switches', onDraftChange, draftValues: {} });
    await userEvent.click(await screen.findByRole('switch', { name: /auto-approve|automatically/i }));
    expect(onDraftChange).toHaveBeenCalledWith('auto_approve', true, false);
  });

  it('shows a drafted value over the saved one', async () => {
    renderCard({ part: 'amounts', onDraftChange, draftValues: { free_limit: 12 } });
    expect(await screen.findByDisplayValue('12')).toBeInTheDocument();
  });

  it('keeps an empty free limit as null, a typed 0 as 0', async () => {
    renderCard({ part: 'amounts', onDraftChange, draftValues: {} });
    const field = await screen.findByLabelText(/free/i);
    await userEvent.clear(field);
    expect(onDraftChange).toHaveBeenLastCalledWith('free_limit', null, expect.anything());
    await userEvent.type(field, '0');
    expect(onDraftChange).toHaveBeenLastCalledWith('free_limit', 0, expect.anything());
  });

  it('has no save button of its own', async () => {
    renderCard({ part: 'amounts', onDraftChange, draftValues: {} });
    await screen.findByLabelText(/free/i);
    expect(screen.queryByRole('button', { name: /save allowance/i })).toBeNull();
  });
});
```

   where `renderCard(props)` is the file's existing mount helper extended to pass extra props (add the parameter if it has none) and `apiPut` is the file's existing mock of `api.put`. Match the switch and field labels to the ones the file already queries (`downloadQuotaAdmin.card.enableLabel`, `autoApproveLabel`, `freeLimitLabel`).

In `DownloadCards.downloadsDisabled.test.tsx`, add a case per card in draft mode: with `downloadsDisabled` and `onDraftChange`, every control is still disabled.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/components/admin/__tests__/DownloadQuotaCard.test.tsx src/components/admin/__tests__/DownloadCards.downloadsDisabled.test.tsx`
Expected: FAIL: the switches save at once (`apiPut` called); `part` and `onDraftChange` are ignored.

- [ ] **Step 3: Implement**

`DownloadQuotaCard.tsx`:
- Read the server values into `const server = { quota_enabled, auto_approve, free_limit, price_per_photo }` from the card's query data, the way the card reads them today.
- `const draftMode = typeof onDraftChange === 'function';` and `const shown = (name: keyof typeof server) => (draftValues && name in draftValues ? draftValues[name] : server[name]);`.
- Each of the four controls: in draft mode its value is `shown(name)` and its change calls `onDraftChange(name, next, server[name])` (the free limit and price keep their empty-to-null and typed-zero rules); outside draft mode it does exactly what it does today.
- In draft mode the "Save allowance" button is not rendered.
- `part`: `'status'` renders only the delivered-so-far and pending-order summary; `'switches'` only the two switches; `'amounts'` only the free limit, the price and Create order with its modal; absent renders everything, as today. Wrap the existing JSX blocks in `{(!part || part === '...') && (...)}` without editing them.

`DownloadResolutionCard.tsx`: the same draft props for `download_standard_resolution`, `download_resolution_picker_enabled`, `download_allow_original`; in draft mode no Save button.

`DownloadsSection.tsx`, heading `events.settings.sectionDownloads`:

```tsx
export const DownloadsSection: React.FC = () => {
  const { t } = useTranslation();
  const { event, editForm, setEditForm, draft, expert } = useEventSettings();
  const values = (part: 'quota' | 'resolution') => changesFor(draft.state, part);
  const onChange = (part: 'quota' | 'resolution') => (name: string, value: unknown, serverValue: unknown) =>
    draft.set(part, name, value, serverValue);
  const downloadsDisabled = !editForm.allow_downloads;
  return (
    <Card padding="md">
      <h2 className="text-lg font-semibold text-heading mb-4">{t('events.settings.sectionDownloads', 'Downloads')}</h2>
      {/* MOVED: the Allow downloads block (t('events.allowDownloads')) and the
          t('events.protectionInfo') paragraph from the edit branch. */}
      <PermissionGate permission={['events.view', 'events.edit']}>
        <DownloadQuotaCard eventId={event.id} part="switches" downloadsDisabled={downloadsDisabled}
          draftValues={values('quota')} onDraftChange={onChange('quota')} />
      </PermissionGate>
      <AdvancedArea expert={expert}>
        <DownloadQuotaCard eventId={event.id} part="amounts" downloadsDisabled={downloadsDisabled}
          draftValues={values('quota')} onDraftChange={onChange('quota')} />
        <DownloadResolutionCard eventId={event.id} downloadsDisabled={downloadsDisabled}
          draftValues={values('resolution')} onDraftChange={onChange('resolution')} />
      </AdvancedArea>
    </Card>
  );
};
```

   Copy the `PermissionGate` props from the `DownloadQuotaCard` usage in `OverviewTab.tsx`. `downloadsDisabled` follows the drafted Allow downloads switch, so turning it off greys the cards before saving.

Register `downloads: DownloadsSection`. Remove `DownloadResolutionCard` from `OverviewTab`, and change the Overview's `DownloadQuotaCard` to `part="status"`. Point the "keeps Allow downloads" case of `noPerEventProtection.test.ts` at `src/pages/admin/event-details/settings/DownloadsSection.tsx`.

- [ ] **Step 4: Run them and watch them pass**

Run: the Step 2 command, `npx vitest run src/pages/admin`, `npm run lint`, `npm run build:check`
Expected: PASS; lint clean; build 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin frontend/src/pages/admin
git commit -m "feat(events): the download allowance and resolution join the save bar"
```

---

### Task 13: Access gets client access; the Overview links to it

**Files:**
- Modify: `frontend/src/pages/admin/event-details/ClientAccessCard.tsx` (a `mode` prop)
- Modify: `frontend/src/pages/admin/event-details/settings/AccessSection.tsx` (client access settings)
- Modify: `frontend/src/pages/admin/event-details/ShareLinkCard.tsx` ("Change password" goes to Settings > Access)
- Modify: `frontend/src/pages/admin/EventDetailsPage.tsx` (the `PasswordResetModal` and its state go)
- Modify: `frontend/src/pages/admin/event-details/draft/saveDraft.ts` (`validateDraft` checks a new client password)
- Rewrite: `frontend/src/pages/admin/event-details/__tests__/ClientAccessCard.password.test.tsx`
- Modify: `frontend/src/pages/admin/event-details/__tests__/ShareLinkCard.ownerOnly.test.tsx`, `ShareLinkCard.recoverablePassword.test.tsx` (the prop rename)
- Modify: `frontend/src/pages/admin/event-details/draft/__tests__/saveDraft.test.ts` (client password rules)

**Interfaces:**
- Consumes: `editForm.client_access_enabled`, `editForm.client_password` (Task 5).
- Produces:
  - `ClientAccessCard({ event, refetchEvent, mode = 'overview', editForm?, setEditForm? })`: `'overview'` shows the client link with Copy and Regenerate (an action, as today) and whether client access is on; `'settings'` shows the enable toggle and the client password field with its generator, bound to `editForm` / `setEditForm`, never saving on its own.
  - `ShareLinkCard` prop `setShowPasswordReset` becomes `onChangePassword: () => void`.
  - `validateDraft` returns `{ key: <the key ClientAccessCard's applyPassword shows today>, ... }` for a changed, non-empty client password shorter than 6 or made of digits only.

- [ ] **Step 1: Write the failing tests**

Rewrite `ClientAccessCard.password.test.tsx` around the settings mode, keeping its mocks:

```tsx
describe('ClientAccessCard in Settings > Access', () => {
  const setEditForm = vi.fn();
  const form = { client_access_enabled: false, client_password: '' };
  beforeEach(() => setEditForm.mockReset());

  it('puts the enable toggle in the draft and saves nothing', async () => {
    render(<ClientAccessCard event={event} refetchEvent={vi.fn()} mode="settings" editForm={form as never} setEditForm={setEditForm} />);
    await userEvent.click(screen.getByRole('switch'));
    const next = setEditForm.mock.calls[0][0];
    expect((typeof next === 'function' ? next(form) : next).client_access_enabled).toBe(true);
    expect(eventsService.updateEvent).not.toHaveBeenCalled();
  });

  it('puts a typed and a generated password in the draft', async () => {
    render(<ClientAccessCard event={event} refetchEvent={vi.fn()} mode="settings" editForm={{ ...form, client_access_enabled: true } as never} setEditForm={setEditForm} />);
    await userEvent.type(screen.getByLabelText(/password/i), 'W');
    await userEvent.click(screen.getByRole('button', { name: /generate/i }));
    expect(setEditForm).toHaveBeenCalled();
    expect(eventsService.updateEvent).not.toHaveBeenCalled();
  });
});

describe('ClientAccessCard on the Overview', () => {
  it('shows the link and has no password field', () => {
    render(<ClientAccessCard event={{ ...event, client_access_enabled: true } as never} refetchEvent={vi.fn()} />);
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });
});
```

   Match the switch, field and generator names to the ones the file queries today (`clientAccess.enableToggle`, `clientAccess.passwordLabel`, the generator button).

Add to `saveDraft.test.ts`:

```ts
  it('rejects a short or digits-only client password', () => {
    expect(validateDraft(new Set(['client_password']), { ...server, client_password: 'abc' }, server)).not.toBeNull();
    expect(validateDraft(new Set(['client_password']), { ...server, client_password: '12345678' }, server)).not.toBeNull();
    expect(validateDraft(new Set(['client_password']), { ...server, client_password: 'Wedding-2026' }, server)).toBeNull();
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/pages/admin/event-details/__tests__/ClientAccessCard.password.test.tsx src/pages/admin/event-details/draft/__tests__/saveDraft.test.ts`
Expected: FAIL: the toggle still calls `updateEvent`; `mode` is ignored; the client password is not validated.

- [ ] **Step 3: Implement**

`ClientAccessCard.tsx`: add `mode?: 'overview' | 'settings'`, `editForm?: EditFormState`, `setEditForm?: (a: SetStateAction<EditFormState>) => void`. In `'settings'` the toggle's checked state is `editForm.client_access_enabled` and its change is `setEditForm((p) => ({ ...p, client_access_enabled: next }))`; the password field shows `editForm.client_password` and writes it the same way; the generator writes the generated value into it; `applyPassword` and every direct `eventsService.updateEvent` call are not used in this mode. In `'overview'` the card renders what it renders today minus the toggle and the password block (the link, Copy, Regenerate, and an on/off status line reading `t('clientAccess.enableToggle', ...)` with a yes or no). Move the password rules from `applyPassword` into `validateDraft` in `saveDraft.ts`, returning the same i18n key and fallback `applyPassword` toasts today.

`AccessSection.tsx`: after the password blocks, `<ClientAccessCard event={event} refetchEvent={refetchEvent} mode="settings" editForm={editForm} setEditForm={setEditForm} />`.

`ShareLinkCard.tsx`: rename the prop to `onChangePassword`; the "Reset password" button calls it and reads `t('events.changePasswordLink', 'Change password')` (new key: `en` "Change password", `de` "Passwort ändern", `vi` "Đổi mật khẩu"). In `OverviewTab`, pass `onChangePassword={() => setSearchParams({ tab: 'settings', section: 'access' })}` (thread `setSearchParams` or an `openSettings(section)` callback from the page). In `EventDetailsPage.tsx`, delete `showPasswordReset`, the `PasswordResetModal` render and its import (spec 5.4: the password has one home, Access). Update the two ShareLinkCard tests to pass `onChangePassword={vi.fn()}`.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/pages/admin`, `npm run lint`, `npm run build:check`
Expected: PASS; lint clean; build 0. `rg -n "PasswordResetModal" src` lists only the component file and its index export.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin frontend/src/i18n/locales/en.json frontend/src/i18n/locales/de.json frontend/src/i18n/locales/vi.json
git commit -m "feat(events): client access and the gallery password live in Settings > Access"
```

---

### Task 14: The Overview holds no settings; Extra features

**Files:**
- Create: `frontend/src/pages/admin/event-details/settings/ExtraFeaturesSection.tsx`
- Modify: `frontend/src/pages/admin/event-details/OverviewTab.tsx`, `EventInformationCard.tsx`, `EventDetailsPage.tsx`, `settings/EventSettingsTab.tsx`
- Test: `frontend/src/pages/admin/event-details/__tests__/overviewReadOnly.test.ts`

**Interfaces:**
- Produces: the Overview renders, per spec 5.1: the summary (`EventInformationCard`, read only), `ShareLinkCard`, `ShortUrlsCard`, `ClientAccessCard` (overview mode), `DownloadQuotaCard part="status"`, `PhotoStatisticsCard`, `FeedbackModerationPanel` (when the saved feedback is on), `ArchiveStatusCard`, `EventActionsCard`. The slideshow, reminder override and face recognition cards move to Settings > Extra features, shown only when at least one of their flags is on, each keeping its own save button. `EventInformationCard` has no edit branch and no `isEditing` prop.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/pages/admin/event-details/__tests__/overviewReadOnly.test.ts
/**
 * The Overview is for daily use and holds no editable settings (spec 5.1);
 * edit mode is gone, and the flagged cards moved to Extra features.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const dir = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(dir, rel), 'utf8');

describe('event page without edit mode', () => {
  it.each(['OverviewTab.tsx', 'EventInformationCard.tsx', 'EventDetailsHeader.tsx', '../EventDetailsPage.tsx'])(
    '%s has no edit mode', (rel) => {
      expect(read(rel)).not.toMatch(/\bisEditing\b|\bsetIsEditing\b|handleStartEdit|handleSaveEdit/);
    },
  );
  it('the summary card writes nothing', () => {
    expect(read('EventInformationCard.tsx')).not.toMatch(/setEditForm|editForm\./);
  });
  it('the Overview no longer renders the flagged cards or the theme section', () => {
    const src = read('OverviewTab.tsx');
    for (const name of ['SlideshowSettingsCard', 'EventReminderOverrideCard', 'FaceRecognitionCard', 'EventThemeSection', 'DownloadResolutionCard']) {
      expect(src).not.toMatch(new RegExp(`<${name}\\b`));
    }
  });
  it('Extra features holds them behind their flags', () => {
    const src = read('settings/ExtraFeaturesSection.tsx');
    expect(src).toMatch(/flags\.slideshow/);
    expect(src).toMatch(/flags\.reminderEmails/);
    expect(src).toMatch(/flags\.faces/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/pages/admin/event-details/__tests__/overviewReadOnly.test.ts`
Expected: FAIL: `isEditing` is still threaded through; the flagged cards are on the Overview.

- [ ] **Step 3: Implement**

- `ExtraFeaturesSection.tsx`, heading `events.settings.sectionExtra`: MOVED from `OverviewTab.tsx`, unchanged with their conditions, the `FaceRecognitionCard` (`flags.faces`), `SlideshowSettingsCard` (`flags.slideshow`) and `EventReminderOverrideCard` (`flags.reminderEmails`) blocks; `useFeatureFlags()` the way `OverviewTab` reads the flags; `refetchEvent` from the context. In `EventSettingsTab`, register `extra: ExtraFeaturesSection` and hide it from the rail when none of the three flags is on (filter `available` with the same flags).
- `OverviewTab.tsx`: remove the three flagged cards, `EventThemeSection`, and every edit prop (`isEditing`, `editForm`, `setEditForm`, `feedbackSettings`, `setFeedbackSettings` and anything only the edit branch used); `FeedbackModerationPanel` shows on the saved `eventFeedbackSettings?.feedback_enabled`.
- `EventInformationCard.tsx`: delete the edit branch that is left (every control in it has moved) and the props only it used; the view branch, including Reveal now, stays unchanged.
- `EventDetailsPage.tsx`: drop the props it no longer passes; `rg -n "isEditing|editForm" src/pages/admin/EventDetailsPage.tsx` shows only the draft view names from Task 9.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/pages/admin src/components/admin`, `npm run lint`, `npm run build:check`
Expected: PASS; lint clean (no unused imports left behind); build 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin
git commit -m "refactor(events): the Overview holds no settings; flagged cards move to Extra features"
```

---

### Task 15: Page behaviour and the control inventory

**Files:**
- Test: `frontend/src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx`
- Test: `frontend/src/pages/admin/event-details/settings/__tests__/controlInventory.test.ts`

These tests pin behaviour the earlier tasks built; each is watched failing by the mutation named under it before the task is closed.

- [ ] **Step 1: Write the page tests**

Mount `EventDetailsPage` through `createMemoryRouter` exactly as `eventDetailsPhotosTab.test.tsx` does after Task 2, copying that file's `vi.mock` block (events, photos, feedback and CSS template services, flags, permissions), with a `ConfirmDialogProvider` around the router, and these fixtures:

```tsx
const legacyEvent = {
  id: 7, slug: 'legacy', event_name: 'Legacy', event_type: 'wedding', event_date: '2020-06-01',
  expires_at: '2030-01-01T00:00:00.000Z', color_theme: null, header_style: 'standard', hero_divider_style: 'wave',
  hero_logo_visible: null, hero_logo_size: null, login_logo_visible: 0, allow_downloads: 1, external_watch: 0,
  og_image_share_enabled: 0, require_password: 1, customer_name: 'Anna', customer_email: 'anna@example.com',
  is_archived: 0, client_access_enabled: 0,
};
```

   `getEvent` resolves `legacyEvent`; `getEventFeedbackSettings` resolves the defaults the backend returns for a missing row (`feedback_enabled: false` and the rest from `feedbackService.js`); `updateEvent` and `updateEventFeedbackSettings` are `vi.fn` resolving `{}`; `hasPermission` returns true unless a case says otherwise.

```tsx
const open = async (entry = '/admin/events/7?tab=settings') => { /* createMemoryRouter + render, return router */ };
const bar = () => screen.queryByRole('region', { name: /unsaved changes/i });

it('opens every section of a legacy event with zero changes', async () => {
  await open();
  for (const name of [/Details/, /Access/, /Appearance/, /Guest interaction/, /Downloads/, /Advanced/]) {
    await userEvent.click(await screen.findByRole('button', { name }));
    expect(bar()).toBeNull();
  }
});
// Mutation: make serverValues.eventFormValues return a fresh object whose
// hero_logo_size is 'medium' when the event has NULL; the bar appears.

it('sends only the changed field and never customer_account_ids', async () => {
  await open();
  await userEvent.click(await screen.findByRole('button', { name: /Advanced/ }));
  await userEvent.click(screen.getByRole('button', { name: /show advanced options/i }));
  await userEvent.clear(screen.getByLabelText(/photo limit/i));
  await userEvent.type(screen.getByLabelText(/photo limit/i), '40');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(eventsService.updateEvent).toHaveBeenCalledWith(7, { photo_cap: 40 }));
  expect(feedbackService.updateEventFeedbackSettings).not.toHaveBeenCalled();
});

it('keeps an extended expiry when another field is saved', async () => {
  vi.mocked(eventsService.getEvent)
    .mockResolvedValueOnce(legacyEvent as never)
    .mockResolvedValue({ ...legacyEvent, expires_at: '2030-01-08T00:00:00.000Z' } as never);
  const router = await open();
  // the Extend action refetches; simulate its refetch through the query client
  await act(async () => { await queryClient.invalidateQueries({ queryKey: ['admin-event', '7'] }); });
  await userEvent.type(await screen.findByLabelText(/host name|customer name/i), 'x');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(eventsService.updateEvent).toHaveBeenCalled());
  expect(vi.mocked(eventsService.updateEvent).mock.calls[0][1]).not.toHaveProperty('expires_at');
  void router;
});

it('keeps only the failed part after a failing second request', async () => {
  vi.mocked(feedbackService.updateEventFeedbackSettings).mockRejectedValueOnce(new Error('500'));
  await open('/admin/events/7?tab=settings&section=guests');
  await userEvent.click((await screen.findAllByRole('checkbox'))[0]);
  await userEvent.click(screen.getByRole('button', { name: /Advanced/ }));
  await userEvent.click(screen.getByRole('button', { name: /show advanced options/i }));
  await userEvent.clear(screen.getByLabelText(/photo limit/i));
  await userEvent.type(screen.getByLabelText(/photo limit/i), '40');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(eventsService.updateEvent).toHaveBeenCalledWith(7, { photo_cap: 40 }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/guest feedback/i);
  expect(screen.getByRole('status')).toHaveTextContent(/1/);
});

it('restores the feedback toggles on Discard', async () => {
  await open('/admin/events/7?tab=settings&section=guests');
  const toggle = (await screen.findAllByRole('checkbox'))[0] as HTMLInputElement;
  const before = toggle.checked;
  await userEvent.click(toggle);
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(toggle.checked).toBe(before);
  expect(bar()).toBeNull();
});

it('asks before leaving the page, not before changing tab', async () => {
  const router = await open();
  await userEvent.type(await screen.findByLabelText(/host name|customer name/i), 'x');
  await act(async () => { await router.navigate('/admin/events/7?tab=photos'); });
  expect(screen.queryByRole('dialog')).toBeNull();
  await act(async () => { await router.navigate('/admin/events'); });
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});

it.each([
  ['a viewer', { permissions: false, archived: 0 }],
  ['an archived event', { permissions: true, archived: 1 }],
])('is read-only for %s', async (_label, { permissions, archived }) => {
  hasPermissionMock.mockReturnValue(permissions);
  vi.mocked(eventsService.getEvent).mockResolvedValue({ ...legacyEvent, is_archived: archived } as never);
  await open();
  expect(await screen.findByLabelText(/host name|customer name/i)).toBeDisabled();
});
```

   Name the mocks after the ones copied from `eventDetailsPhotosTab.test.tsx` (`eventsService`, `feedbackService`, a `hasPermissionMock` behind the mocked `usePermissions`), and create the `QueryClient` at module scope as `queryClient` so a case can invalidate it.

- [ ] **Step 2: Write the inventory test**

```ts
// frontend/src/pages/admin/event-details/settings/__tests__/controlInventory.test.ts
/**
 * Every setting has exactly one place where it is edited (spec 2, 5.1).
 * Every field the form carries is assigned to one section or declared not
 * editable, and each section's source actually names its fields.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { NOT_EDITABLE, SECTION_FIELDS, type SectionId } from '../sectionFields';
import { eventFormValues } from '../../draft/serverValues';

const FILES: Record<SectionId, string> = {
  details: 'DetailsSection.tsx', access: 'AccessSection.tsx', appearance: 'AppearanceSection.tsx',
  guests: 'GuestInteractionSection.tsx', downloads: 'DownloadsSection.tsx', advanced: 'AdvancedSection.tsx',
  extra: 'ExtraFeaturesSection.tsx',
};
// Fields a section edits through a component it renders, not in its own source.
const VIA_COMPONENT: Record<string, string> = {
  'event.__theme': 'EventThemeSection', 'event.css_template_id': 'EventThemeSection',
  'event.client_access_enabled': 'ClientAccessCard', 'event.client_password': 'ClientAccessCard',
  'event.customer_accounts': 'CustomerAccountPicker', 'event.guest_name_mode': 'UploaderNameSettings',
  'event.show_credits_to_guests': 'UploaderNameSettings', 'event.hero_photo_id': 'HeroPhotoSelector',
};

describe('control inventory', () => {
  const assigned = Object.values(SECTION_FIELDS).flat();

  it('assigns each field once', () => {
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('covers every field of the event form', () => {
    const keys = Object.keys(eventFormValues({ id: 1 } as never)).map((k) => `event.${k}`);
    const missing = keys.filter((k) => !assigned.includes(k) && !NOT_EDITABLE.includes(k));
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(FILES))('%s edits the fields assigned to it', (id, file) => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    for (const key of SECTION_FIELDS[id as SectionId]) {
      const [part, name] = [key.slice(0, key.indexOf('.')), key.slice(key.indexOf('.') + 1)];
      if (VIA_COMPONENT[key]) expect(src, key).toMatch(new RegExp(`<${VIA_COMPONENT[key]}\\b`));
      else if (part === 'event') expect(src, key).toMatch(new RegExp(`\\b${name}\\b`));
      else if (part === 'feedback') expect(src, key).toMatch(/<FeedbackSettings\b/);
      else if (part === 'quota') expect(src, key).toMatch(/<DownloadQuotaCard\b/);
      else expect(src, key).toMatch(/<DownloadResolutionCard\b/);
    }
  });

  it('leaves nothing editable on the Overview', () => {
    const overview = fs.readFileSync(path.resolve(__dirname, '../../OverviewTab.tsx'), 'utf8');
    expect(overview).not.toMatch(/setEditForm|onDraftChange|mode="settings"/);
  });
});
```

- [ ] **Step 3: Run them**

Run: `npx vitest run src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx src/pages/admin/event-details/settings/__tests__/controlInventory.test.ts`
Expected: PASS. Then watch each fail once: apply the mutation noted under the zero-changes case (bar appears); change `buildEventPayload`'s default branch to copy the whole form (the "only the changed field" case fails); remove `event.photo_cap` from `SECTION_FIELDS` (the inventory fails). Restore each and re-run green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/__tests__/eventSettingsSaveModel.test.tsx frontend/src/pages/admin/event-details/settings/__tests__/controlInventory.test.ts
git commit -m "test(events): pin the save model and the control inventory"
```

---

### Task 16: One e2e spec for the save bar

**Files:**
- Create: `tests/e2e/event-settings-save-bar.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/event-settings-save-bar.spec.ts
import { test, expect } from '@playwright/test';
import { adminApiToken, ADMIN_EMAIL } from './_helpers/admin';

test.describe('event Settings save bar @smoke', () => {
  test('edit, Discard, Save, and a blocked leave', async ({ page }) => {
    const token = await adminApiToken(page.request);
    const created = await page.request.post('/api/admin/events', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        event_type: 'wedding', event_name: `E2E save bar ${Date.now()}`,
        event_date: new Date().toISOString().slice(0, 10), customer_name: 'E2E Host',
        customer_email: 'host@example.com', admin_email: ADMIN_EMAIL,
        password: 'PlaywrightGallery123!', expiration_days: 30,
      },
    });
    expect(created.ok()).toBeTruthy();
    const { id } = await created.json();

    await page.goto(`/admin/events/${id}?tab=settings&section=details`);
    const bar = page.getByRole('region', { name: /unsaved changes/i });
    await expect(bar).toHaveCount(0);

    const name = page.getByLabel(/host name|customer name/i);
    await name.fill('E2E Host Edited');
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: /discard/i }).click();
    await expect(name).toHaveValue('E2E Host');
    await expect(bar).toHaveCount(0);

    await name.fill('E2E Host Saved');
    await bar.getByRole('button', { name: /^save$/i }).click();
    await expect(bar).toHaveCount(0);
    const saved = await page.request.get(`/api/admin/events/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    expect((await saved.json()).customer_name).toBe('E2E Host Saved');

    await name.fill('Not saved');
    await page.getByRole('link', { name: /dashboard/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /stay|cancel/i }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/events/${id}`));
  });
});
```

   Check the create payload against `admin-create-event-ui.spec.ts` or `header-hero-fixes.spec.ts` (`createEventWithStyle`) and copy any field the create route requires that is missing here; check the sidebar's dashboard link name; check whether `GET /api/admin/events/:id` answers the event at the top level or under a key and read `customer_name` from there.

- [ ] **Step 2: Run it**

Run from the repo root: `bash scripts/e2e.sh --project=chromium --grep "save bar"` (the stack from Task 2).
Expected: PASS. If the machine cannot run the stack, record it in the ledger; the `E2E` workflow runs it (`@smoke` is in the pull request subset).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/event-settings-save-bar.spec.ts
git commit -m "test(e2e): the event Settings save bar"
```

---

### Task 17: Full gates, e2e, and the spec record

- [ ] **Step 1: Run every gate against the baseline**

Run the scratch gate script in the background (`bash $S/gates.sh p2`).
Expected: lint and build exit 0; both "new failures" lists empty.

- [ ] **Step 2: Run the whole e2e suite**

Run: `bash scripts/e2e.sh --project=chromium` in the background, after the gates finish (both are heavy on this machine).
Expected: every spec passes, including `header-hero-fixes.spec.ts`, the only existing spec that opens the event page. If it cannot run here, the ledger says so and the `E2E` workflow is run with `workflow_dispatch` after the push; P2 is not reported done to the user without one of the two.

- [ ] **Step 3: Record P2**

Under "### P2: Event page skeleton and save model" in the spec, add `Done <date>: <first commit>..<last commit>.` Commit with `docs(spec): record P2`.
