import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowLeft, Clock, Loader2, ShoppingBag } from 'lucide-react';

import { Button, Card, Loading } from '../../components/common';
import { useDownloadQuota } from '../../hooks/useDownloadQuota';
import { downloadQuotaService } from '../../services/downloadQuota.service';
import {
  downloadPackageLabel,
  formatPackagePrice,
  formatPackageUnitPrice,
} from '../../components/gallery/downloadQuotaOffer';

/**
 * Confirming a download package.
 *
 * Deliberately a page of its own rather than a second step inside the dialog:
 * the order it creates goes into a photographer's manual approval queue, so it
 * must come from an explicit confirmation. Nothing is sent while the guest is
 * only reading the price, and leaving the page sends nothing either.
 */
export const DownloadOrderPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();

  const packageId = Number(searchParams.get('package'));
  const { packages, currency, pendingOrder, isLoading, refetch } = useDownloadQuota(slug);

  const chosen = packages.find((pkg) => pkg.id === packageId) || null;
  const chosenUnitPrice = chosen
    ? formatPackageUnitPrice(chosen, currency, i18n.language, (key, def, vars) => t(key, def, vars))
    : null;

  const createOrder = useMutation({
    mutationFn: () => downloadQuotaService.createOrder(slug as string, packageId),
    onSuccess: () => { refetch(); },
  });

  // 409 is not a failure to report as one: the guest's earlier order is still
  // with the photographer, and a second one would not speed it up.
  const duplicate =
    (createOrder.error as { response?: { status?: number } } | null)?.response?.status === 409;
  const failed = createOrder.isError && !duplicate;
  const waiting = Boolean(pendingOrder) || createOrder.isSuccess || duplicate;

  const backToGallery = (
    <Link
      to={`/gallery/${slug}`}
      className="inline-flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400 hover:underline"
    >
      <ArrowLeft className="w-4 h-4" aria-hidden="true" />
      {t('gallery.downloadQuota.order.back', 'Back to the gallery')}
    </Link>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-50 dark:bg-neutral-900">
      <Card className="max-w-md w-full">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingBag className="w-5 h-5 text-neutral-500" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {t('gallery.downloadQuota.order.title', 'Add downloads')}
          </h1>
        </div>

        {isLoading && <Loading />}

        {!isLoading && waiting && (
          <div data-testid="order-pending" className="py-2">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
              <Clock className="w-4 h-4" aria-hidden="true" />
              {t('gallery.downloadQuota.pendingTitle', 'Your order is waiting for approval')}
            </div>
            {duplicate && (
              <p
                data-testid="order-duplicate"
                className="text-sm text-amber-700 dark:text-amber-400 mb-2"
              >
                {t(
                  'gallery.downloadQuota.order.duplicate',
                  'You already have an order waiting for approval.',
                )}
              </p>
            )}
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              {t(
                'gallery.downloadQuota.pendingHint',
                'Your photographer reviews each order by hand. Contact them directly if it is urgent.',
              )}
            </p>
            {backToGallery}
          </div>
        )}

        {!isLoading && !waiting && !chosen && (
          <div data-testid="order-unknown-package" className="py-2">
            <div className="flex items-start gap-2 mb-4 text-sm text-neutral-700 dark:text-neutral-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {t(
                  'gallery.downloadQuota.order.unknownPackage',
                  'That package is no longer available.',
                )}
              </span>
            </div>
            {backToGallery}
          </div>
        )}

        {!isLoading && !waiting && chosen && (
          <>
            <div className="flex items-center gap-3 p-3 mb-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {downloadPackageLabel(chosen, i18n.language, (key, def, vars) =>
                    t(key, def, vars),
                  )}
                </span>
                {chosen.savings_percent !== null && (
                  <span className="block text-xs text-emerald-700 dark:text-emerald-400">
                    {t('gallery.downloadQuota.savings', 'Save {{percent}}%', {
                      percent: chosen.savings_percent,
                    })}
                    {chosenUnitPrice && <> · {chosenUnitPrice}</>}
                  </span>
                )}
              </span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {formatPackagePrice(chosen.price, currency, i18n.language)}
              </span>
            </div>

            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              {t(
                'gallery.downloadQuota.order.hint',
                'Your photographer approves the order by hand. The extra downloads appear in this gallery once they do.',
              )}
            </p>

            {failed && (
              <p
                data-testid="order-failed"
                className="flex items-start gap-2 mb-4 text-sm text-red-600 dark:text-red-400"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                {t(
                  'gallery.downloadQuota.order.failed',
                  'Your order could not be placed. Please try again.',
                )}
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              {backToGallery}
              <Button
                variant="primary"
                onClick={() => createOrder.mutate()}
                disabled={createOrder.isPending}
                leftIcon={
                  createOrder.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined
                }
              >
                {t('gallery.downloadQuota.order.confirm', 'Confirm order')}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};
