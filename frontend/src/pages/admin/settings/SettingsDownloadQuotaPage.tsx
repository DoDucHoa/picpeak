import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Plus, Save, Trash2, Upload } from 'lucide-react';

import { Button, Card, Input, Loading } from '../../../components/common';
import { useMutationWithToast } from '../../../hooks';
import {
  adminDownloadQuotaService,
  type PackageImportResult,
  type PackageListResponse,
} from '../../../services/adminDownloadQuota.service';
import type { DownloadPackage } from '../../../services/downloadQuota.service';

/** One editable row. Strings, because a half-typed number is still a valid edit. */
interface PackageRow {
  id: number | null;
  kind: 'quantity' | 'unlimited';
  photoCount: string;
  price: string;
  nameI18n: Record<string, string> | null;
  sortOrder: number;
  isActive: boolean;
  /** Straight from the response. Never derived here: see the file header test. */
  savingsPercent: number | null;
}

interface ImportEntry {
  id: number;
  name: Record<string, string>;
}

function toRow(pkg: DownloadPackage & { sort_order?: number; is_active?: boolean }, index: number): PackageRow {
  return {
    id: pkg.id,
    kind: pkg.kind || 'quantity',
    photoCount: pkg.photo_count == null ? '' : String(pkg.photo_count),
    price: pkg.price == null ? '' : String(Number(pkg.price)),
    nameI18n: pkg.name_i18n ?? null,
    sortOrder: Number.isFinite(Number(pkg.sort_order)) ? Number(pkg.sort_order) : index,
    isActive: pkg.is_active !== false,
    savingsPercent: pkg.savings_percent ?? null,
  };
}

/**
 * Blob.text() is missing from the jsdom build the suite runs on, and an
 * unsupported call there rejects silently rather than failing loudly, so the
 * FileReader path is a real fallback rather than belt and braces.
 */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Validates the import file before a single row is sent. The server applies
 * what it can and reports the rest, but a file that is the wrong shape entirely
 * has to fail here with a sentence that says which part is wrong, or the
 * photographer is left guessing at a JSON error.
 */
export function parseImportFile(raw: string): { entries: ImportEntry[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'invalidJson' };
  }

  const packages = (parsed as { packages?: unknown })?.packages;
  if (!Array.isArray(packages)) return { error: 'noPackagesArray' };

  const entries: ImportEntry[] = [];
  for (const entry of packages) {
    const id = Number((entry as { id?: unknown })?.id);
    if (!Number.isInteger(id)) return { error: 'missingId' };
    const name = (entry as { name?: unknown })?.name;
    if (!name || typeof name !== 'object' || Array.isArray(name)) return { error: 'missingName' };
    entries.push({ id, name: name as Record<string, string> });
  }
  return { entries };
}

export const SettingsDownloadQuotaPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<PackageListResponse>({
    queryKey: ['admin-download-packages'],
    queryFn: () => adminDownloadQuotaService.getGlobalPackages(),
  });

  const [rows, setRows] = useState<PackageRow[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<PackageImportResult | null>(null);

  useEffect(() => {
    setRows((data?.packages ?? []).map(toRow));
  }, [data?.packages]);

  const save = useMutationWithToast({
    mutationFn: () =>
      adminDownloadQuotaService.saveGlobalPackages(
        rows.map((row) => ({
          ...(row.id == null ? {} : { id: row.id }),
          kind: row.kind,
          photo_count: row.kind === 'unlimited' ? null : Number(row.photoCount),
          price: Number(row.price),
          name_i18n: row.nameI18n,
          sort_order: row.sortOrder,
          is_active: row.isActive,
        })),
      ),
    successMessage: t('downloadQuotaAdmin.packages.saved', 'Price list saved.'),
    invalidateKeys: [['admin-download-packages']],
    errorMessage: t('downloadQuotaAdmin.packages.saveError', 'Could not save the price list.'),
  });

  const runImport = useMutationWithToast({
    mutationFn: (entries: ImportEntry[]) => adminDownloadQuotaService.importPackageNames(entries),
    invalidateKeys: [['admin-download-packages']],
    errorMessage: t('downloadQuotaAdmin.packages.importError', 'Could not import the package names.'),
    onSuccess: (result: PackageImportResult) => setImportResult(result),
  });

  const onFile = async (file: File | undefined) => {
    setImportError(null);
    setImportResult(null);
    if (!file) return;
    const outcome = parseImportFile(await readFileText(file));
    if ('error' in outcome) {
      setImportError(outcome.error);
      return;
    }
    runImport.mutate(outcome.entries);
  };

  const importErrorText = (code: string): string => {
    if (code === 'invalidJson') {
      return t('downloadQuotaAdmin.packages.errorInvalidJson', 'That file is not valid JSON, so nothing was imported.');
    }
    if (code === 'noPackagesArray') {
      return t('downloadQuotaAdmin.packages.errorNoArray', 'The import file needs a "packages" array at the top level.');
    }
    if (code === 'missingId') {
      return t('downloadQuotaAdmin.packages.errorMissingId', 'Every entry needs a numeric "id" matching a package in this install.');
    }
    return t('downloadQuotaAdmin.packages.errorMissingName', 'Every entry needs a "name" object keyed by locale, for example { "en": "20 photos" }.');
  };

  const patchRow = (index: number, patch: Partial<PackageRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  if (isLoading && !data) {
    return <Loading size="sm" text={t('downloadQuotaAdmin.packages.loading', 'Loading the price list')} />;
  }

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {t('downloadQuotaAdmin.packages.title', 'Download packages')}
            </h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {t(
                'downloadQuotaAdmin.packages.help',
                'What a client can buy once a gallery runs out of free downloads. A gallery with its own price list replaces this one rather than adding to it.',
              )}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => save.mutate()}
            isLoading={save.isPending}
            disabled={save.isPending}
            leftIcon={<Save className="w-4 h-4" />}
          >
            {t('downloadQuotaAdmin.packages.save', 'Save price list')}
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {rows.length === 0 && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {t('downloadQuotaAdmin.packages.empty', 'No package yet. Add one to let clients buy more downloads.')}
            </p>
          )}

          {rows.map((row, index) => (
            <div
              key={row.id ?? `new-${index}`}
              data-testid={row.id == null ? `download-package-new-${index}` : `download-package-${row.id}`}
              className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto_auto] gap-3 items-end rounded-md border border-neutral-200 dark:border-neutral-700 p-3"
            >
              <Input
                type="number"
                min={1}
                aria-label={t('downloadQuotaAdmin.packages.photoCountAria', 'Photos in package {{n}}', {
                  n: index + 1,
                }) as string}
                label={t('downloadQuotaAdmin.packages.photoCountLabel', 'Photos') as string}
                value={row.photoCount}
                disabled={row.kind === 'unlimited'}
                onChange={(e) => patchRow(index, { photoCount: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                aria-label={t('downloadQuotaAdmin.packages.priceAria', 'Price of package {{n}}', {
                  n: index + 1,
                }) as string}
                label={t('downloadQuotaAdmin.packages.priceLabel', 'Price ({{currency}})', {
                  currency: data?.currency ?? '',
                }) as string}
                value={row.price}
                onChange={(e) => patchRow(index, { price: e.target.value })}
              />
              <div>
                <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  {t('downloadQuotaAdmin.packages.nameColumn', 'Name shown to the client')}
                </span>
                <p className="text-sm text-neutral-700 dark:text-neutral-300 truncate">
                  {row.nameI18n?.[i18n.language]
                    || row.nameI18n?.en
                    || t('downloadQuotaAdmin.packages.autoName', 'Generated from the count and price')}
                </p>
              </div>
              <div className="text-sm">
                <span className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
                  {t('downloadQuotaAdmin.packages.savingsColumn', 'Saves')}
                </span>
                {/* Backend figure only. An empty cell means the backend sent
                    none, which is the case for the global list: it has no per
                    photo price to compare against. */}
                <span className="text-neutral-700 dark:text-neutral-300">
                  {row.savingsPercent == null
                    ? t('downloadQuotaAdmin.packages.savingsUnknown', 'Not calculated here')
                    : `${row.savingsPercent}%`}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('downloadQuotaAdmin.packages.removeAria', 'Remove package {{n}}', {
                  n: index + 1,
                }) as string}
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                leftIcon={<Trash2 className="w-4 h-4" />}
              >
                {t('downloadQuotaAdmin.packages.remove', 'Remove')}
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  id: null,
                  kind: 'quantity',
                  photoCount: '',
                  price: '',
                  nameI18n: null,
                  sortOrder: current.length,
                  isActive: true,
                  savingsPercent: null,
                },
              ])
            }
            leftIcon={<Plus className="w-4 h-4" />}
          >
            {t('downloadQuotaAdmin.packages.add', 'Add package')}
          </Button>
        </div>
      </Card>

      <Card padding="lg">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {t('downloadQuotaAdmin.packages.importTitle', 'Import package names')}
        </h2>
        <p className="mt-1 mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          {t(
            'downloadQuotaAdmin.packages.importHelp',
            'Matching is by package id. An id this install does not have is skipped, and both counts are reported below.',
          )}
        </p>
        <pre className="mb-3 overflow-x-auto rounded-md bg-neutral-100 dark:bg-neutral-800 p-3 text-xs text-neutral-700 dark:text-neutral-300">
{`{ "packages": [ { "id": 3, "name": { "en": "20 photos", "de": "20 Fotos", "vi": "20 anh" } } ] }`}
        </pre>

        <label
          htmlFor="download-package-import"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
        >
          {t('downloadQuotaAdmin.packages.importLabel', 'Import package names (JSON)')}
        </label>
        <input
          id="download-package-import"
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="text-sm"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            // Clear the control so re-picking the same file fires again.
            e.target.value = '';
          }}
        />

        {runImport.isPending && (
          <p className="mt-3 flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <Upload className="w-4 h-4" aria-hidden />
            {t('downloadQuotaAdmin.packages.importing', 'Importing...')}
          </p>
        )}

        {importError && (
          <p className="mt-3 flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
            {importErrorText(importError)}
          </p>
        )}

        {importResult && (
          <div className="mt-3 text-sm">
            <p className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
              <CheckCircle2 className="w-4 h-4 text-green-600" aria-hidden />
              {t('downloadQuotaAdmin.packages.importResult', '{{imported}} name imported, {{skipped}} skipped', {
                imported: importResult.imported,
                skipped: importResult.skipped,
              })}
            </p>
            {importResult.skipped_ids?.length > 0 && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {t('downloadQuotaAdmin.packages.importSkippedIds', 'Skipped ids, which this install does not have: {{ids}}', {
                  ids: importResult.skipped_ids.join(', '),
                })}
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default SettingsDownloadQuotaPage;
