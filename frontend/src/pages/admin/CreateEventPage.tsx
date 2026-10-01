import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { settingsService } from '../../services/settings.service';
import { usePublicSettings } from '../../hooks/usePublicSettings';
import { useActiveEventTypes } from '../../hooks/useActiveEventTypes';
import { CreateEventForm } from './create-event/CreateEventForm';
import { FALLBACK_EVENT_TYPES, toCreateType } from './create-event/EventTypeTiles';

const settled = (query: { data?: unknown; isError?: boolean }) => query.data !== undefined || query.isError === true;

/**
 * The create screen (spec 5.5). Its defaults come from Settings and the type
 * catalog, so the form mounts once all three have loaded or failed; a failed
 * read falls back (30 days, the built-in types) instead of blocking.
 */
export const CreateEventPage: React.FC = () => {
  const { t } = useTranslation();
  const publicQuery = usePublicSettings();
  // Needs settings.view; staff without it get the 30-day default.
  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: () => settingsService.getAllSettings(), retry: false });
  const typesQuery = useActiveEventTypes();
  if (!settled(publicQuery) || !settled(settingsQuery) || !settled(typesQuery)) {
    return <div className="max-w-4xl mx-auto py-12 text-center text-muted">{t('common.loading')}</div>;
  }
  const types = typesQuery.data?.length ? typesQuery.data.map(toCreateType) : FALLBACK_EVENT_TYPES;
  return (
    <CreateEventForm
      publicSettings={publicQuery.data as Record<string, unknown> | undefined}
      adminSettings={settingsQuery.data as Record<string, unknown> | undefined}
      types={types}
    />
  );
};
