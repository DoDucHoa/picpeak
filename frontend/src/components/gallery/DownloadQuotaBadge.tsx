import React from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Infinity as InfinityIcon } from 'lucide-react';

import type { DownloadQuotaState } from '../../services/downloadQuota.service';

interface DownloadQuotaBadgeProps {
  quota: DownloadQuotaState | null;
}

/**
 * How many free downloads are left, stated in the gallery header.
 *
 * `remaining` and `total` are printed as the backend sent them. The obvious
 * local alternative, total minus used, is a second place the same number can
 * be produced, and the two drift the moment an order is approved between the
 * two reads. What a guest is told here decides whether they expect to pay.
 */
export const DownloadQuotaBadge: React.FC<DownloadQuotaBadgeProps> = ({ quota }) => {
  const { t } = useTranslation();

  if (!quota || !quota.enabled) return null;

  const unlimited = quota.unlimited;

  return (
    <span
      data-testid="download-quota-badge"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200"
    >
      {unlimited ? (
        <InfinityIcon className="w-3.5 h-3.5" aria-hidden="true" />
      ) : (
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      {unlimited
        ? t('gallery.downloadQuota.unlimited', 'Unlimited downloads')
        : t('gallery.downloadQuota.remaining', '{{remaining}} of {{total}} downloads left', {
            remaining: quota.remaining,
            total: quota.total,
          })}
    </span>
  );
};
