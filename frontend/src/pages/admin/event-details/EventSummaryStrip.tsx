import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { CalendarClock, Download, Image, ShoppingCart } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Event } from '../../../types';
import { Card } from '../../../components/common';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { adminDownloadQuotaService, type AdminQuotaResponse } from '../../../services/adminDownloadQuota.service';
import { mediaSplitLabel, splitMediaCount } from '../../../utils/mediaCounts';
import type { EventDetailsTab } from './types';

/** Same window the page header uses to call an event "expiring". */
const EXPIRING_DAYS = 7;

/** Written out whole so Tailwind sees each class. An odd last cell spans the row on a phone. */
const COLUMNS: Record<number, string> = {
  2: '',
  3: 'md:grid-cols-3 [&>li:last-child]:col-span-2 md:[&>li:last-child]:col-span-1',
  4: 'md:grid-cols-4',
};

interface Cell {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: 'warn' | 'danger';
  onClick: () => void;
}

interface EventSummaryStripProps {
  event: Event;
  daysUntilExpiration: number | null;
  setActiveTab: (tab: EventDetailsTab) => void;
  openSettings: (section: string) => void;
}

/**
 * The four numbers an admin opens an event to check, in one line above the
 * Overview cards. Every figure is one the server sent: the allowance comes
 * from the same quota query the Download allowance card reads, never from
 * arithmetic done here. Each cell opens the place where that number is acted on.
 */
export const EventSummaryStrip: React.FC<EventSummaryStripProps> = ({ event, daysUntilExpiration, setActiveTab, openSettings }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  // The same read the backend and the allowance card's PermissionGate apply.
  const canSeeQuota = hasPermission('events.view') || hasPermission('events.edit');
  const { data: quotaData } = useQuery<AdminQuotaResponse>({
    queryKey: ['admin-download-quota', event.id],
    queryFn: () => adminDownloadQuotaService.getQuota(event.id),
    enabled: canSeeQuota,
  });

  const media = splitMediaCount(event.photo_count, event.video_count);
  const cells: Cell[] = [{
    key: 'media',
    icon: Image,
    label: media.hasVideos ? t('events.summary.media', 'Photos and videos') : t('events.summary.photos', 'Photos'),
    value: mediaSplitLabel(t, media),
    onClick: () => setActiveTab('photos'),
  }];

  // An allowance only means something while downloads are allowed and limited.
  const quota = quotaData?.quota;
  if (quota && quotaData?.settings?.quota_enabled && event.allow_downloads) {
    cells.push({
      key: 'downloads',
      icon: Download,
      label: t('events.summary.downloads', 'Downloads used'),
      value: quota.unlimited
        ? t('events.summary.downloadsUnlimited', '{{used}}, no limit', { used: quota.used })
        : t('events.summary.downloadsOf', '{{used}} of {{total}}', { used: quota.used, total: quota.total }),
      tone: !quota.unlimited && quota.total && quota.used >= quota.total ? 'warn' : undefined,
      onClick: () => openSettings('downloads'),
    });
  }

  const expired = daysUntilExpiration !== null && daysUntilExpiration <= 0;
  cells.push({
    key: 'expiry',
    icon: CalendarClock,
    label: t('events.summary.expires', 'Expires'),
    value: daysUntilExpiration === null
      ? t('events.summary.noExpiry', 'Never')
      : expired
        ? t('events.summary.expired', 'Expired')
        : t('events.summary.daysLeft', '{{count}} days left', { count: daysUntilExpiration }),
    tone: expired ? 'danger' : daysUntilExpiration !== null && daysUntilExpiration <= EXPIRING_DAYS ? 'warn' : undefined,
    onClick: () => openSettings('details'),
  });

  if (quotaData?.pending_order) {
    cells.push({
      key: 'order',
      icon: ShoppingCart,
      label: t('events.summary.order', 'Download order'),
      value: t('events.summary.orderWaiting', 'Waiting for approval'),
      tone: 'warn',
      onClick: () => navigate('/admin/download-orders'),
    });
  }

  return (
    <Card padding="none" className="overflow-hidden">
      {/* The one-pixel gap over a line-coloured list draws the dividers, so
          they stay right whether two, three or four cells are shown. */}
      <ul
        aria-label={t('events.summary.label', 'Event summary')}
        className={clsx('grid grid-cols-2 gap-px bg-line', COLUMNS[cells.length])}
      >
        {cells.map((cell) => {
          const Icon = cell.icon;
          return (
            <li key={cell.key} className="min-w-0 bg-panel">
              <button
                type="button"
                onClick={cell.onClick}
                className="flex h-full w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-xs text-muted">{cell.label}</span>
                  <span
                    className={clsx(
                      'block truncate text-sm font-semibold tabular-nums',
                      cell.tone === 'danger' && 'text-red-700 dark:text-red-300',
                      cell.tone === 'warn' && 'text-amber-700 dark:text-amber-300',
                      !cell.tone && 'text-heading',
                    )}
                  >
                    {cell.value}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};
