import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Gift,
  Inbox,
  Infinity as InfinityIcon,
  ShoppingCart,
  X,
} from 'lucide-react';

import { Button, Card, Input, Loading } from '../../../components/common';
import { useLocalizedDate } from '../../../hooks/useLocalizedDate';
import { useMutationWithToast } from '../../../hooks';
import {
  adminDownloadQuotaService,
  type AdminDownloadOrder,
  type PagedResponse,
} from '../../../services/adminDownloadQuota.service';

const PAGE_SIZE = 25;

const STATUS_FILTERS = ['pending', 'approved', 'rejected', 'expired', 'all'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Spelled out rather than built from the key, so the English fallback reads. */
const FILTER_FALLBACKS: Record<StatusFilter, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
  all: 'All',
};

const STATUS_FALLBACKS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  expired: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300',
};

/**
 * The number the approve dialog opens on. It is what the client actually
 * ordered, never a blank box: the photographer is confirming a figure, not
 * recalling one, and a typo here decides how many photos are handed over.
 */
export function prefilledGrantCount(order: AdminDownloadOrder): string {
  const count = order.requested_photo_count ?? order.package_snapshot?.photo_count ?? null;
  return count == null ? '' : String(count);
}

export const DownloadOrdersPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { formatDateTime } = useLocalizedDate();

  const [status, setStatus] = useState<StatusFilter>('pending');
  const [page, setPage] = useState(1);
  const [approving, setApproving] = useState<AdminDownloadOrder | null>(null);
  const [grantCount, setGrantCount] = useState('');
  const [rejecting, setRejecting] = useState<AdminDownloadOrder | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading } = useQuery<PagedResponse<AdminDownloadOrder>>({
    queryKey: ['admin-download-orders', status, page],
    queryFn: () =>
      adminDownloadQuotaService.listOrders(
        status === 'all' ? { page, limit: PAGE_SIZE } : { status, page, limit: PAGE_SIZE },
      ),
    placeholderData: keepPreviousData,
  });

  // The badge has to stay truthful while the photographer browses the approved
  // or rejected lists, so the count is its own one-row query rather than the
  // total of whatever list happens to be on screen.
  const { data: pendingCount } = useQuery<PagedResponse<AdminDownloadOrder>>({
    queryKey: ['admin-download-orders', 'pending-count'],
    queryFn: () => adminDownloadQuotaService.listOrders({ status: 'pending', page: 1, limit: 1 }),
  });

  const invalidateKeys = [['admin-download-orders'], ['admin-download-quota']];

  const approve = useMutationWithToast({
    mutationFn: (vars: { orderId: number; granted: number | null }) =>
      adminDownloadQuotaService.approveOrder(vars.orderId, vars.granted),
    successMessage: t(
      'downloadQuotaAdmin.orders.approved',
      'Order approved. Tell the client their allowance is topped up.',
    ),
    invalidateKeys,
    errorMessage: t('downloadQuotaAdmin.orders.approveError', 'Could not approve the order.'),
    onSuccess: () => setApproving(null),
  });

  const reject = useMutationWithToast({
    mutationFn: (vars: { orderId: number; reason: string }) =>
      adminDownloadQuotaService.rejectOrder(vars.orderId, vars.reason),
    successMessage: t('downloadQuotaAdmin.orders.rejected', 'Order rejected.'),
    invalidateKeys,
    errorMessage: t('downloadQuotaAdmin.orders.rejectError', 'Could not reject the order.'),
    onSuccess: () => setRejecting(null),
  });

  const openApprove = (order: AdminDownloadOrder) => {
    setGrantCount(prefilledGrantCount(order));
    setApproving(order);
  };

  const openReject = (order: AdminDownloadOrder) => {
    setReason('');
    setRejecting(order);
  };

  const pickStatus = (next: StatusFilter) => {
    setStatus(next);
    setPage(1);
  };

  const packageLabel = (order: AdminDownloadOrder): string => {
    const names = order.package_snapshot?.name_i18n;
    const named = names?.[i18n.language] || names?.en;
    if (named) return named;
    if (order.grants_unlimited || order.package_snapshot?.kind === 'unlimited') {
      return t('downloadQuotaAdmin.orders.unlimitedPackage', 'Unlimited downloads');
    }
    const count = order.requested_photo_count ?? order.package_snapshot?.photo_count ?? 0;
    return t('downloadQuotaAdmin.orders.countPackage', '{{count}} photos', { count });
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const grantsUnlimited = !!(approving?.grants_unlimited || approving?.package_snapshot?.kind === 'unlimited');

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {t('downloadQuotaAdmin.orders.title', 'Download orders')}
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-1">
            {t(
              'downloadQuotaAdmin.orders.subtitle',
              'Approve an order and the gallery allowance grows straight away. Invoicing and telling the client happen outside PicPeak.',
            )}
          </p>
        </div>
        <span
          data-testid="pending-order-count"
          className="inline-flex items-center gap-2 rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 text-sm font-semibold text-amber-800 dark:text-amber-300"
        >
          {t('downloadQuotaAdmin.orders.waitingBadge', '{{count}} waiting', {
            count: pendingCount?.total ?? 0,
          })}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => pickStatus(key)}
            aria-current={status === key ? 'true' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              status === key
                ? 'bg-accent-dark text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            {t(`downloadQuotaAdmin.orders.filters.${key}`, FILTER_FALLBACKS[key])}
          </button>
        ))}
      </div>

      {isLoading && !data ? (
        <Card padding="lg">
          <Loading size="sm" text={t('downloadQuotaAdmin.orders.loading', 'Loading download orders')} />
        </Card>
      ) : items.length === 0 ? (
        <Card padding="lg">
          <div className="py-12 text-center">
            <Inbox className="w-8 h-8 mx-auto mb-3 text-neutral-400" aria-hidden />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {t('downloadQuotaAdmin.orders.empty', 'No download order matches this filter.')}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((order) => {
            const fromClient = order.origin === 'client';
            return (
              <Card key={order.id} padding="md" data-testid={`download-order-${order.id}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={`/admin/events/${order.event_id}`}
                        className="font-semibold text-neutral-900 dark:text-neutral-100 hover:underline"
                      >
                        {order.event_name}
                      </a>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[order.status] ?? STATUS_STYLES.expired
                        }`}
                      >
                        {t(
                          `downloadQuotaAdmin.orders.status.${order.status}`,
                          STATUS_FALLBACKS[order.status] ?? order.status,
                        )}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                      {packageLabel(order)}
                      {order.package_snapshot ? (
                        <span className="ml-2 text-neutral-500 dark:text-neutral-400">
                          {`${order.package_snapshot.price} ${order.package_snapshot.currency}`}
                        </span>
                      ) : null}
                    </p>

                    {/* One of these is money to collect and the other is a
                        goodwill grant. Reading the wrong one means chasing the
                        wrong person for payment. */}
                    <p
                      className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${
                        fromClient
                          ? 'text-blue-700 dark:text-blue-300'
                          : 'text-purple-700 dark:text-purple-300'
                      }`}
                    >
                      {fromClient ? (
                        <ShoppingCart className="w-3.5 h-3.5" aria-hidden />
                      ) : (
                        <Gift className="w-3.5 h-3.5" aria-hidden />
                      )}
                      {fromClient
                        ? t(
                            'downloadQuotaAdmin.orders.originClient',
                            'Client ordered this. Invoice them yourself before approving.',
                          )
                        : t(
                            'downloadQuotaAdmin.orders.originPhotographer',
                            'You added this on the client behalf. Nothing to collect.',
                          )}
                    </p>

                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {t('downloadQuotaAdmin.orders.placedAt', 'Placed {{when}}', {
                        when: formatDateTime(order.created_at),
                      })}
                    </p>

                    {order.reason && (
                      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                        {t('downloadQuotaAdmin.orders.reasonGiven', 'Reason: {{reason}}', {
                          reason: order.reason,
                        })}
                      </p>
                    )}
                  </div>

                  {order.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => openApprove(order)}
                        leftIcon={<Check className="w-4 h-4" />}
                      >
                        {t('downloadQuotaAdmin.orders.approve', 'Approve')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openReject(order)}
                        leftIcon={<X className="w-4 h-4" />}
                      >
                        {t('downloadQuotaAdmin.orders.reject', 'Reject')}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}

          <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('downloadQuotaAdmin.orders.pageOf', 'Page {{page}} of {{lastPage}}, {{total}} orders', {
                page,
                lastPage,
                total,
              })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                leftIcon={<ChevronLeft className="w-4 h-4" />}
              >
                {t('downloadQuotaAdmin.orders.previous', 'Previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= lastPage}
                onClick={() => setPage((current) => current + 1)}
                rightIcon={<ChevronRight className="w-4 h-4" />}
              >
                {t('downloadQuotaAdmin.orders.next', 'Next')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {approving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-lg w-full" role="dialog" aria-modal="true">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              {t('downloadQuotaAdmin.orders.approveTitle', 'Approve this order')}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              {t('downloadQuotaAdmin.orders.approveHelp', 'Approving raises the allowance of {{event}} immediately. Collect the payment and tell the client yourself.', {
                event: approving.event_name,
              })}
            </p>

            {grantsUnlimited ? (
              <p className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 mb-4">
                <InfinityIcon className="w-4 h-4" aria-hidden />
                {t(
                  'downloadQuotaAdmin.orders.grantsUnlimited',
                  'This package lifts the limit entirely, so there is no number to set.',
                )}
              </p>
            ) : (
              <div className="mb-4">
                <Input
                  id="approve-granted-count"
                  type="number"
                  min={0}
                  label={t('downloadQuotaAdmin.orders.grantLabel', 'Photos to grant') as string}
                  value={grantCount}
                  onChange={(e) => setGrantCount(e.target.value)}
                  helperText={t(
                    'downloadQuotaAdmin.orders.grantHelp',
                    'Pre-filled with what the client ordered. Change it to grant a different number.',
                  ) as string}
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setApproving(null)}>
                {t('downloadQuotaAdmin.orders.cancel', 'Cancel')}
              </Button>
              <Button
                isLoading={approve.isPending}
                disabled={approve.isPending || (!grantsUnlimited && grantCount.trim() === '')}
                onClick={() =>
                  approve.mutate({
                    orderId: approving.id,
                    granted: grantsUnlimited ? null : Number(grantCount),
                  })
                }
              >
                {t('downloadQuotaAdmin.orders.approveConfirm', 'Approve order')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-lg w-full" role="dialog" aria-modal="true">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              {t('downloadQuotaAdmin.orders.rejectTitle', 'Reject this order')}
            </h2>
            <label
              htmlFor="download-order-reject-reason"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
            >
              {t('downloadQuotaAdmin.orders.reasonLabel', 'Reason shown to the client')}
            </label>
            <textarea
              id="download-order-reject-reason"
              rows={4}
              className="input w-full text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t(
                'downloadQuotaAdmin.orders.reasonPlaceholder',
                'Say why, in words the client will read.',
              ) as string}
            />

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(null)}>
                {t('downloadQuotaAdmin.orders.cancel', 'Cancel')}
              </Button>
              <Button
                isLoading={reject.isPending}
                disabled={reject.isPending || reason.trim() === ''}
                onClick={() => reject.mutate({ orderId: rejecting.id, reason: reason.trim() })}
              >
                {t('downloadQuotaAdmin.orders.rejectConfirm', 'Reject order')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default DownloadOrdersPage;
