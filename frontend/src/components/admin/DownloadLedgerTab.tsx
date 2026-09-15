import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ImageOff, Inbox } from 'lucide-react';

import { Button, Card, Loading } from '../common';
import { useLocalizedDate } from '../../hooks/useLocalizedDate';
import {
  adminDownloadQuotaService,
  type DownloadLedgerEntry,
  type PagedResponse,
} from '../../services/adminDownloadQuota.service';

const PAGE_SIZE = 50;

export interface DownloadLedgerTabProps {
  eventId: number;
}

/**
 * Every photo this gallery has delivered at least once, which is the record a
 * dispute over a count is settled against. Paging is server side: the ledger
 * outlives the photos and can grow past anything worth holding in memory.
 */
export const DownloadLedgerTab: React.FC<DownloadLedgerTabProps> = ({ eventId }) => {
  const { t } = useTranslation();
  const { formatDateTime } = useLocalizedDate();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<PagedResponse<DownloadLedgerEntry>>({
    queryKey: ['admin-download-ledger', eventId, page],
    queryFn: () => adminDownloadQuotaService.getLedger(eventId, { page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  if (isLoading && !data) {
    return (
      <Card padding="lg">
        <Loading size="sm" text={t('downloadQuotaAdmin.ledger.loading', 'Loading the download ledger')} />
      </Card>
    );
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card padding="lg">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {t('downloadQuotaAdmin.ledger.title', 'Delivered photos')}
      </h2>
      <p className="mt-1 mb-4 text-xs text-neutral-500 dark:text-neutral-400">
        {t(
          'downloadQuotaAdmin.ledger.help',
          'One row per photo that has left this gallery at least once. A photo already listed here costs no further allowance, however often it is downloaded again.',
        )}
      </p>

      {items.length === 0 ? (
        <div className="py-12 text-center">
          <Inbox className="w-8 h-8 mx-auto mb-3 text-neutral-400" aria-hidden />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t(
              'downloadQuotaAdmin.ledger.empty',
              'No photo has been downloaded from this gallery yet.',
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">
                  <th className="py-2 pr-4 font-semibold">
                    {t('downloadQuotaAdmin.ledger.photo', 'Photo')}
                  </th>
                  <th className="py-2 pr-4 font-semibold">
                    {t('downloadQuotaAdmin.ledger.firstDownloaded', 'First downloaded')}
                  </th>
                  <th className="py-2 font-semibold">
                    {t('downloadQuotaAdmin.ledger.accessLevel', 'Downloaded by')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-neutral-100 dark:border-neutral-800 last:border-0"
                  >
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        {entry.filename ? (
                          <span className="text-neutral-900 dark:text-neutral-100">{entry.filename}</span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                            <ImageOff className="w-4 h-4" aria-hidden />
                            {t('downloadQuotaAdmin.ledger.deletedPhoto', 'Photo deleted, slot still spent')}
                          </span>
                        )}
                        <span className="text-xs text-neutral-400">{`#${entry.photo_id}`}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-neutral-700 dark:text-neutral-300">
                      {formatDateTime(entry.first_downloaded_at)}
                    </td>
                    <td className="py-2 text-neutral-700 dark:text-neutral-300">
                      {entry.access_level
                        || t('downloadQuotaAdmin.ledger.unknownAccess', 'Unknown')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('downloadQuotaAdmin.ledger.pageOf', 'Page {{page}} of {{lastPage}}, {{total}} photos', {
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
                {t('downloadQuotaAdmin.ledger.previous', 'Previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= lastPage}
                onClick={() => setPage((current) => current + 1)}
                rightIcon={<ChevronRight className="w-4 h-4" />}
              >
                {t('downloadQuotaAdmin.ledger.next', 'Next')}
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
};

export default DownloadLedgerTab;
