/**
 * Settings > General edits the one notification email that decides where
 * admin mail about galleries goes (P3, spec 5.11). When it is empty, the
 * business profile address is offered as a suggestion.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { GeneralTab } from '../GeneralTab';
import type { GeneralSettings } from '../../hooks/useSettingsState';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: unknown) => {
        if (typeof opts === 'string') return opts;
        const email = (opts as { email?: string } | undefined)?.email;
        return email ? `${key} ${email}` : key;
      },
      i18n: { language: 'en' },
    }),
  };
});
vi.mock('../../../../services/businessProfile.service', () => ({
  businessProfileService: { get: vi.fn().mockResolvedValue({ profile: { email: 'studio@example.com' }, bankAccounts: [] }) },
}));
vi.mock('../../components/MfaSettingsCard', () => ({ MfaSettingsCard: () => null }));

const BASE: GeneralSettings = {
  site_url: '',
  site_url_env_pinned: false,
  site_url_stored: '',
  notification_email: '',
  default_expiration_days: 30,
  max_file_size_mb: 50,
  max_video_size_mb: 500,
  max_files_per_upload: 500,
  allowed_file_types: 'jpg,jpeg,png,gif,webp',
  max_upload_batch_size_mb: 95,
  enable_analytics: true,
  enable_registration: false,
  maintenance_mode: false,
  short_gallery_urls: false,
  use_original_filenames_for_downloads: false,
  default_language: 'en',
  date_format: { format: 'dd/MM/yyyy', locale: 'en-GB' },
  time_format: '24h',
};

function renderTab(notification_email: string) {
  const setGeneralSettings = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GeneralTab
        generalSettings={{ ...BASE, notification_email }}
        setGeneralSettings={setGeneralSettings}
        saveGeneralMutation={{ mutate: vi.fn(), isPending: false }}
        isDirty={false}
        onDiscard={vi.fn()}
        accountDirty={false}
        onDiscardAccount={vi.fn()}
        accountForm={{ username: '', email: '' }}
        accountErrors={{}}
        handleAccountChange={() => vi.fn()}
        handleAccountSubmit={vi.fn()}
        updateAdminProfileMutation={{ isPending: false }}
        adminProfileLoading={false}
      />
    </QueryClientProvider>,
  );
  return setGeneralSettings;
}

describe('notification email', () => {
  it('edits general notification_email', async () => {
    const set = renderTab('');
    await userEvent.type(screen.getByLabelText('settings.general.notificationEmail'), 'a');
    const update = set.mock.calls.at(-1)![0];
    expect(update({ ...BASE })).toMatchObject({ notification_email: 'a' });
  });

  it('suggests the business profile address when empty', async () => {
    const set = renderTab('');
    await userEvent.click(await screen.findByRole('button', { name: /studio@example\.com/ }));
    const update = set.mock.calls.at(-1)![0];
    expect(update({ ...BASE })).toMatchObject({ notification_email: 'studio@example.com' });
  });

  it('offers no suggestion once an address is set', async () => {
    renderTab('ops@example.com');
    await screen.findByLabelText('settings.general.notificationEmail');
    expect(screen.queryByRole('button', { name: /studio@example\.com/ })).toBeNull();
  });
});
