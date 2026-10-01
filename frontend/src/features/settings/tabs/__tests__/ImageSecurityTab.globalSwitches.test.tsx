/**
 * Right-click, devtools and canvas are one switch each for every gallery.
 * The tab offers all three and says they apply everywhere, not "by default".
 */
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return { ...actual, useTranslation: () => ({ t: (k: string, fb?: unknown) => (typeof fb === 'string' ? fb : k) }) };
});
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const get = vi.fn();
vi.mock('../../../../config/api', () => ({
  api: { get: (...a: unknown[]) => get(...a), put: vi.fn(async () => ({ data: {} })) },
}));

import { ImageSecurityTab } from '../ImageSecurityTab';

const renderTab = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ImageSecurityTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('Image security: switches for every gallery', () => {
  it('shows the stored right-click switch', async () => {
    get.mockResolvedValue({ data: { disable_right_click: false } });
    renderTab();
    const box = (await screen.findByLabelText(/Block right-click in every gallery/)) as HTMLInputElement;
    expect(box.checked).toBe(false);
  });

  it('labels devtools and canvas as applying to every gallery', async () => {
    get.mockResolvedValue({ data: {} });
    renderTab();
    expect(await screen.findByLabelText(/Detect developer tools in every gallery/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Canvas rendering in the lightbox of every gallery/)).toBeInTheDocument();
  });

  it('no longer promises devtools or canvas from the maximum level', async () => {
    get.mockResolvedValue({ data: {} });
    renderTab();
    const option = (await screen.findByRole('option', { name: /^Maximum/ })) as HTMLOptionElement;
    expect(option.textContent).not.toMatch(/canvas|DevTools detection/i);
    // Maximum only leaves the gallery through the devtools detector.
    expect(option.textContent).toMatch(/when developer tools detection is on/);
  });

  it('does not tie right-click to the basic level', async () => {
    get.mockResolvedValue({ data: {} });
    renderTab();
    const option = (await screen.findByRole('option', { name: /^Basic/ })) as HTMLOptionElement;
    expect(option.textContent).not.toMatch(/right-click/i);
  });

  it('says the switches apply to every gallery, not only to new events', async () => {
    get.mockResolvedValue({ data: {} });
    renderTab();
    await screen.findByLabelText(/Block right-click in every gallery/);
    expect(screen.queryByText(/Individual events can override/)).not.toBeInTheDocument();
    expect(screen.getByText(/switches below apply to every gallery/)).toBeInTheDocument();
  });
});
