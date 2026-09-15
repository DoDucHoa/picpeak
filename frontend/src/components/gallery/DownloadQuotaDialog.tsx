import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { X, Clock, ChevronRight, AlertCircle } from 'lucide-react';

import { Button, Card } from '../common';
import { downloadPackageLabel, formatPackagePrice } from './downloadQuotaOffer';
import type {
  DownloadOrder,
  DownloadPackage,
  QuotaExceededPayload,
} from '../../services/downloadQuota.service';

interface DownloadQuotaDialogProps {
  slug: string;
  /** The 402 body, when the dialog was raised by a refused download. */
  exceeded: QuotaExceededPayload | null;
  packages: DownloadPackage[];
  currency: string;
  pendingOrder: DownloadOrder | null;
  onClose: () => void;
}

/**
 * Shown when a download runs past the allowance.
 *
 * It offers two ways forward and takes neither on the guest's behalf: buy more
 * slots, or go back and pick fewer photos. Trimming the selection down to what
 * fits was ruled out with the customer before this was built, so the dialog is
 * given no access to the selection at all rather than merely leaving it alone.
 *
 * Every number on screen is printed from the server: the shortfall from
 * `missing_slots`, each price and each saving from the package row.
 */
export const DownloadQuotaDialog: React.FC<DownloadQuotaDialogProps> = ({
  slug,
  exceeded,
  packages,
  currency,
  pendingOrder,
  onClose,
}) => {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const title = t('gallery.downloadQuota.dialogTitle', 'You have reached your download limit');

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <Card className="max-w-md w-full" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            className="text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {exceeded && (
          <div
            data-testid="quota-missing-slots"
            className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-200"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {t(
                'gallery.downloadQuota.missingSlots',
                '{{missing}} more than your allowance covers',
                { missing: exceeded.missing_slots },
              )}
            </span>
          </div>
        )}

        {pendingOrder ? (
          <div data-testid="quota-pending-order" className="py-2">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
              <Clock className="w-4 h-4" aria-hidden="true" />
              {t('gallery.downloadQuota.pendingTitle', 'Your order is waiting for approval')}
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {t(
                'gallery.downloadQuota.pendingHint',
                'Your photographer reviews each order by hand. Contact them directly if it is urgent.',
              )}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
              {t(
                'gallery.downloadQuota.dialogHint',
                'Add downloads to this gallery, or go back and pick fewer photos.',
              )}
            </p>
            <ul className="space-y-2 mb-5">
              {packages.map((pkg) => {
                const label = downloadPackageLabel(pkg, i18n.language, (key, def, vars) =>
                  t(key, def, vars),
                );
                return (
                  <li key={pkg.id}>
                    <Link
                      to={`/gallery/${slug}/order?package=${pkg.id}`}
                      className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {label}
                        </span>
                        {pkg.savings_percent !== null && (
                          <span className="block text-xs text-emerald-700 dark:text-emerald-400">
                            {t('gallery.downloadQuota.savings', 'Save {{percent}}%', {
                              percent: pkg.savings_percent,
                            })}
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {formatPackagePrice(pkg.price, currency, i18n.language)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-neutral-400" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            {t('gallery.downloadQuota.adjustSelection', 'Adjust my selection')}
          </Button>
        </div>
      </Card>
    </div>
  );
};
