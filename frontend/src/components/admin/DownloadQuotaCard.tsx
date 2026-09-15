import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Download, Infinity as InfinityIcon, Save, Clock } from 'lucide-react';

import { Button, Card, Input, Loading } from '../common';
import { useMutationWithToast } from '../../hooks';
import {
  adminDownloadQuotaService,
  InvalidQuotaNumberError,
  toNullableQuotaNumber,
  type AdminQuotaResponse,
  type QuotaPatch,
} from '../../services/adminDownloadQuota.service';

export interface DownloadQuotaCardProps {
  eventId: number;
}

/** Empty string for a NULL column, so "inherit" never renders as a typed number. */
function fieldValue(raw: number | string | null | undefined): string {
  return raw == null ? '' : String(raw);
}

export const DownloadQuotaCard: React.FC<DownloadQuotaCardProps> = ({ eventId }) => {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery<AdminQuotaResponse>({
    queryKey: ['admin-download-quota', eventId],
    queryFn: () => adminDownloadQuotaService.getQuota(eventId),
  });

  const [freeLimit, setFreeLimit] = useState('');
  const [pricePerPhoto, setPricePerPhoto] = useState('');

  useEffect(() => {
    setFreeLimit(fieldValue(data?.settings?.free_limit));
    setPricePerPhoto(fieldValue(data?.settings?.price_per_photo));
  }, [data?.settings?.free_limit, data?.settings?.price_per_photo]);

  const save = useMutationWithToast({
    mutationFn: (patch: QuotaPatch) => adminDownloadQuotaService.saveQuota(eventId, patch),
    successMessage: t('downloadQuotaAdmin.card.saved', 'Download allowance saved.'),
    invalidateKeys: [['admin-download-quota', eventId]],
    errorMessage: (error: unknown) => {
      if (error instanceof InvalidQuotaNumberError) {
        return t(
          'downloadQuotaAdmin.card.invalidNumber',
          'Enter a whole number of zero or more, or leave the field empty to inherit.',
        );
      }
      const server = error as { response?: { data?: { error?: string } }; message?: string };
      return (
        server?.response?.data?.error
        || server?.message
        || t('downloadQuotaAdmin.card.saveError', 'Could not save the download allowance.')
      );
    },
  });

  if (isLoading || !data) {
    return (
      <Card padding="lg" className="mt-4">
        <Loading size="sm" text={t('downloadQuotaAdmin.card.loading', 'Loading download allowance')} />
      </Card>
    );
  }

  const { quota, settings, pending_order: pendingOrder, currency } = data;
  const enabled = !!settings?.quota_enabled;
  const percent = quota.total ? Math.min(100, Math.round((quota.used / quota.total) * 100)) : 0;

  const saveNumbers = () => {
    save.mutate({
      free_limit: toNullableQuotaNumber(freeLimit),
      price_per_photo: toNullableQuotaNumber(pricePerPhoto),
    });
  };

  return (
    <Card padding="lg" className="mt-4">
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5" aria-hidden />
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {t('downloadQuotaAdmin.card.title', 'Download allowance')}
          </h2>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            disabled={save.isPending}
            onChange={(e) => save.mutate({ quota_enabled: e.target.checked })}
          />
          {t('downloadQuotaAdmin.card.enableLabel', 'Meter downloads for this gallery')}
        </label>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
        {t(
          'downloadQuotaAdmin.card.help',
          'The client downloads a set number of photos for free. Past that they order a package and you approve it here. Leave a field empty to inherit the system default.',
        )}
      </p>

      {enabled && (
        <div className="mb-4">
          {quota.unlimited ? (
            <p className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <InfinityIcon className="w-4 h-4" aria-hidden />
              {t('downloadQuotaAdmin.card.progressUnlimited', '{{used}} photos delivered, no limit', {
                used: quota.used,
              })}
            </p>
          ) : (
            <>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                {t('downloadQuotaAdmin.card.progress', '{{used}} of {{total}} photos delivered', {
                  used: quota.used,
                  total: quota.total,
                })}
              </p>
              <div
                className="mt-1.5 h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
                role="progressbar"
                aria-valuenow={quota.used}
                aria-valuemin={0}
                aria-valuemax={quota.total ?? undefined}
              >
                <div className="h-full bg-accent-dark" style={{ width: `${percent}%` }} />
              </div>
            </>
          )}
        </div>
      )}

      {pendingOrder && (
        <p className="mb-4 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <Clock className="w-4 h-4" aria-hidden />
          {t(
            'downloadQuotaAdmin.card.pendingOrder',
            'This gallery has an order waiting for your approval.',
          )}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          id="download-quota-free-limit"
          type="number"
          min={0}
          label={t('downloadQuotaAdmin.card.freeLimitLabel', 'Free downloads for this gallery') as string}
          value={freeLimit}
          onChange={(e) => setFreeLimit(e.target.value)}
          placeholder={t('downloadQuotaAdmin.card.inheritPlaceholder', 'Inherits {{value}}', {
            value: quota.freeLimit,
          }) as string}
          helperText={t(
            'downloadQuotaAdmin.card.freeLimitHelp',
            'Empty inherits the system default. Type 0 to grant no free download at all.',
          ) as string}
        />
        <Input
          id="download-quota-price"
          type="number"
          min={0}
          step="0.01"
          label={t('downloadQuotaAdmin.card.priceLabel', 'Price per extra photo ({{currency}})', {
            currency,
          }) as string}
          value={pricePerPhoto}
          onChange={(e) => setPricePerPhoto(e.target.value)}
          placeholder={t('downloadQuotaAdmin.card.inheritPlaceholder', 'Inherits {{value}}', {
            value: quota.pricePerPhoto,
          }) as string}
          helperText={t(
            'downloadQuotaAdmin.card.priceHelp',
            'Used to work out what a package saves the client. Empty inherits the system default.',
          ) as string}
        />
      </div>

      <div className="mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={saveNumbers}
          isLoading={save.isPending}
          disabled={save.isPending}
          leftIcon={<Save className="w-4 h-4" />}
        >
          {t('downloadQuotaAdmin.card.save', 'Save allowance')}
        </Button>
      </div>
    </Card>
  );
};

export default DownloadQuotaCard;
