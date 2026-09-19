import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Download, Infinity as InfinityIcon, Save, Clock, Gift } from 'lucide-react';

import { Button, Card, Input, Loading } from '../common';
import { Switch } from '../../features/settings/components/Switch';
import { useMutationWithToast } from '../../hooks';
import {
  adminDownloadQuotaService,
  InvalidQuotaNumberError,
  toNullableQuotaNumber,
  type AdminQuotaResponse,
  type QuotaPatch,
} from '../../services/adminDownloadQuota.service';
import type { DownloadPackage } from '../../services/downloadQuota.service';
import { DownloadsDisabledNotice } from './DownloadsDisabledNotice';

export interface DownloadQuotaCardProps {
  eventId: number;
  /** The gallery's master "Allow photo downloads" switch is off (#downloads-off). */
  downloadsDisabled?: boolean;
}

/** Empty string for a NULL column, so "inherit" never renders as a typed number. */
function fieldValue(raw: number | string | null | undefined): string {
  return raw == null ? '' : String(raw);
}

/**
 * What a package reads as inside the create-order dropdown: the
 * photographer's own name where there is one, the auto label otherwise, and
 * always the price, so the same figure the client would have seen is the one
 * being handed to them for free.
 */
function packageOptionLabel(
  pkg: DownloadPackage,
  currency: string,
  language: string,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const names = pkg.name_i18n || {};
  const named = names[language] || names.en || Object.values(names)[0];
  const label = named
    || (pkg.kind === 'unlimited' || pkg.auto_label.count === null
      ? t('downloadQuotaAdmin.card.createOrder.unlimitedPackage', 'Unlimited downloads')
      : t('downloadQuotaAdmin.card.createOrder.countPackage', '{{count}} photos', {
          count: pkg.auto_label.count,
        }));
  const amount = typeof pkg.price === 'number' ? pkg.price : Number(pkg.price);
  const priceText = Number.isFinite(amount) ? `${amount} ${currency}` : String(pkg.price);
  return `${label} · ${priceText}`;
}

export const DownloadQuotaCard: React.FC<DownloadQuotaCardProps> = ({ eventId, downloadsDisabled = false }) => {
  const { t, i18n } = useTranslation();

  const { data, isLoading } = useQuery<AdminQuotaResponse>({
    queryKey: ['admin-download-quota', eventId],
    queryFn: () => adminDownloadQuotaService.getQuota(eventId),
  });

  const [freeLimit, setFreeLimit] = useState('');
  const [pricePerPhoto, setPricePerPhoto] = useState('');

  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [orderPackageId, setOrderPackageId] = useState('');
  const [orderReason, setOrderReason] = useState('');

  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ['admin-download-packages-for-order', eventId],
    queryFn: () => adminDownloadQuotaService.getAvailablePackagesForOrder(eventId),
    enabled: showCreateOrder,
  });

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

  const createOrder = useMutationWithToast({
    mutationFn: (vars: { packageId: number; reason: string }) =>
      adminDownloadQuotaService.createOrderForEvent(eventId, vars.packageId, vars.reason),
    successMessage: t('downloadQuotaAdmin.card.createOrder.success', 'Order created for the client.'),
    invalidateKeys: [['admin-download-quota', eventId], ['admin-download-orders']],
    errorMessage: (error: unknown) => {
      const server = error as {
        response?: { data?: { code?: string; error?: string } };
        message?: string;
      };
      const code = server?.response?.data?.code;
      if (code === 'REASON_REQUIRED') {
        return t(
          'downloadQuotaAdmin.card.createOrder.reasonRequiredError',
          'Say why you are creating this order.',
        );
      }
      if (code === 'PENDING_ORDER_EXISTS') {
        return t(
          'downloadQuotaAdmin.card.createOrder.pendingExistsError',
          'This gallery already has an order waiting for approval.',
        );
      }
      if (code === 'UNKNOWN_PACKAGE') {
        return t(
          'downloadQuotaAdmin.card.createOrder.unknownPackageError',
          'Pick a package from the list.',
        );
      }
      return (
        server?.response?.data?.error
        || server?.message
        || t('downloadQuotaAdmin.card.createOrder.error', 'Could not create the order.')
      );
    },
    onSuccess: () => {
      setShowCreateOrder(false);
      setOrderPackageId('');
      setOrderReason('');
    },
  });

  const openCreateOrder = () => {
    setOrderPackageId('');
    setOrderReason('');
    setShowCreateOrder(true);
  };

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
    <>
      <Card padding="lg" className="mt-4">
      {/* The whole card, switch included: an allowance is meaningless on a
          gallery whose download routes all answer 403, and letting it be
          configured anyway is how a gallery ends up with priced packages
          nobody can ever use. */}
      <fieldset disabled={downloadsDisabled} className={downloadsDisabled ? 'opacity-60' : undefined}>
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5" aria-hidden />
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {t('downloadQuotaAdmin.card.title', 'Download allowance')}
          </h2>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Switch
            checked={enabled}
            disabled={save.isPending}
            onChange={(next) => save.mutate({ quota_enabled: next })}
            ariaLabel={t('downloadQuotaAdmin.card.enableLabel', 'Limit downloads for this gallery') as string}
          />
          {t('downloadQuotaAdmin.card.enableLabel', 'Limit downloads for this gallery')}
        </div>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
        {t(
          'downloadQuotaAdmin.card.help',
          'The client downloads a set number of photos for free. Past that they order a package and you approve it here. Leave a field empty to inherit the system default.',
        )}
      </p>

      {downloadsDisabled && <DownloadsDisabledNotice />}

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

      <div className="mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={openCreateOrder}
          leftIcon={<Gift className="w-4 h-4" />}
        >
          {t('downloadQuotaAdmin.card.createOrder.button', 'Create order for client')}
        </Button>
      </div>

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
      </fieldset>
      </Card>

      {showCreateOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-lg w-full" role="dialog" aria-modal="true">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              {t('downloadQuotaAdmin.card.createOrder.title', 'Create an order for the client')}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              {t(
                'downloadQuotaAdmin.card.createOrder.help',
                'Placed on the client behalf, for instance after agreeing an extension over the phone. Nothing is charged automatically: approve it yourself once you are ready to grant the photos.',
              )}
            </p>

            <label
              htmlFor="create-order-package"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
            >
              {t('downloadQuotaAdmin.card.createOrder.packageLabel', 'Package')}
            </label>
            {packagesLoading ? (
              <Loading
                size="sm"
                text={t('downloadQuotaAdmin.card.createOrder.loadingPackages', 'Loading packages')}
              />
            ) : (packagesData?.packages ?? []).length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                {t(
                  'downloadQuotaAdmin.card.createOrder.noPackages',
                  'No package is set up yet. Add one under Download packages first.',
                )}
              </p>
            ) : (
              <select
                id="create-order-package"
                className="input w-full text-sm mb-4"
                value={orderPackageId}
                onChange={(e) => setOrderPackageId(e.target.value)}
              >
                <option value="">
                  {t('downloadQuotaAdmin.card.createOrder.packagePlaceholder', 'Choose a package')}
                </option>
                {(packagesData?.packages ?? []).map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {packageOptionLabel(pkg, packagesData?.currency ?? currency, i18n?.language ?? 'en', t)}
                  </option>
                ))}
              </select>
            )}

            <label
              htmlFor="create-order-reason"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
            >
              {t('downloadQuotaAdmin.card.createOrder.reasonLabel', 'Reason (kept with the order)')}
            </label>
            <textarea
              id="create-order-reason"
              rows={3}
              className="input w-full text-sm"
              value={orderReason}
              onChange={(e) => setOrderReason(e.target.value)}
              placeholder={t(
                'downloadQuotaAdmin.card.createOrder.reasonPlaceholder',
                'Say why you are granting this, for your own record.',
              ) as string}
            />

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateOrder(false)}>
                {t('downloadQuotaAdmin.card.createOrder.cancel', 'Cancel')}
              </Button>
              <Button
                isLoading={createOrder.isPending}
                disabled={createOrder.isPending || !orderPackageId || orderReason.trim() === ''}
                onClick={() =>
                  createOrder.mutate({
                    packageId: Number(orderPackageId),
                    reason: orderReason.trim(),
                  })
                }
              >
                {t('downloadQuotaAdmin.card.createOrder.submit', 'Create order')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

export default DownloadQuotaCard;
