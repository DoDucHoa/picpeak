import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { publicSettingsService, type PublicSettings } from '../services/publicSettings.service';
import { saveBrandSnapshot } from '../utils/brandSnapshot';

export const PUBLIC_SETTINGS_QUERY_KEY = ['public-settings'] as const;

type PublicSettingsQueryOptions = Omit<
  UseQueryOptions<PublicSettings, Error>,
  'queryKey' | 'queryFn'
>;

export function usePublicSettings(options?: PublicSettingsQueryOptions) {
  return useQuery<PublicSettings, Error>({
    queryKey: PUBLIC_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const settings = await publicSettingsService.getPublicSettings();
      // Kept for the next page load's first paint, see useBrandSettings.
      saveBrandSnapshot(settings);
      return settings;
    },
    staleTime: 60_000,
    ...options,
  });
}
