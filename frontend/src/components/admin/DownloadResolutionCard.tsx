/**
 * <DownloadResolutionCard>
 *
 * Per-event override for the download-resolution settings (#858). The globals
 * live in Settings → Download resolutions; this card lets one gallery differ.
 *
 * Every field is tri-state — "Inherit" writes NULL and the gallery follows the
 * global, matching the show_watermark / show_qr convention. The card shows the
 * inherited value inline so an admin can see what "Inherit" currently means
 * without leaving the page.
 *
 * Reads GET /api/admin/events/:id/download-resolutions (which returns the raw
 * overrides, the globals, and the resolved effective policy) and saves through
 * PATCH on the same path.
 */
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Download, Save } from 'lucide-react';

import { Button, Card, Loading } from '../common';
import { DownloadsDisabledNotice } from './DownloadsDisabledNotice';
import { api } from '../../config/api';
import type { DownloadResolutionChoice } from '../../types';

const INHERIT = '__inherit__';
const ORIGINAL = 'original';

interface Payload {
  overrides: {
    download_standard_resolution: string | null;
    download_resolution_picker_enabled: boolean | null;
    download_allow_original: boolean | null;
  };
  globals: {
    standard_resolution: string;
    picker_enabled: boolean;
    allow_original: boolean;
    resolutions: DownloadResolutionChoice[];
  };
  effective: {
    standard: string;
    picker_enabled: boolean;
    allow_original: boolean;
    choices: DownloadResolutionChoice[];
  };
}

export interface DownloadResolutionCardProps {
  eventId: number;
  onChanged?: () => void;
  /** The gallery's master "Allow photo downloads" switch is off (#downloads-off). */
  downloadsDisabled?: boolean;
  /** Drafted overrides shown over the saved ones (event Settings). */
  draftValues?: Record<string, unknown>;
  /**
   * With this, the three selects edit the page's draft instead of saving; the
   * save bar sends them (spec 5.2), so the card has no Save of its own.
   */
  onDraftChange?: (name: string, value: unknown, serverValue: unknown) => void;
}

/** null → "Inherit"; true/false → explicit. */
const triToSelect = (v: boolean | null | undefined) =>
  (v === null || v === undefined ? INHERIT : String(v));
const selectToTri = (v: string) => (v === INHERIT ? null : v === 'true');

export const DownloadResolutionCard: React.FC<DownloadResolutionCardProps> = ({
  eventId, onChanged, downloadsDisabled = false, draftValues, onDraftChange,
}) => {
  const { t } = useTranslation();
  const [standard, setStandard] = useState<string>(INHERIT);
  const [picker, setPicker] = useState<string>(INHERIT);
  const [allowOriginal, setAllowOriginal] = useState<string>(INHERIT);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery<Payload>({
    queryKey: ['event-download-resolutions', eventId],
    queryFn: async () => (await api.get(`/admin/events/${eventId}/download-resolutions`)).data,
  });

  const draftMode = typeof onDraftChange === 'function';
  const pick = <T,>(name: string, saved: T): T =>
    (draftValues && name in draftValues ? draftValues[name] as T : saved);
  useEffect(() => {
    if (!data) return;
    setStandard(pick('download_standard_resolution', data.overrides.download_standard_resolution) ?? INHERIT);
    setPicker(triToSelect(pick('download_resolution_picker_enabled', data.overrides.download_resolution_picker_enabled)));
    setAllowOriginal(triToSelect(pick('download_allow_original', data.overrides.download_allow_original)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, draftValues]);

  /** Outside the page draft a select only changes local state until Save. */
  const change = (name: string, select: string, local: (v: string) => void, value: unknown, saved: unknown) => {
    local(select);
    if (draftMode) onDraftChange(name, value, saved);
  };

  if (isLoading || !data) {
    return <Card><Loading /></Card>;
  }

  const globalStandardLabel = data.globals.standard_resolution === ORIGINAL
    ? t('settings.downloads.original', 'Original (full size)')
    : data.globals.standard_resolution;

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/events/${eventId}/download-resolutions`, {
        download_standard_resolution: standard === INHERIT ? null : standard,
        download_resolution_picker_enabled: selectToTri(picker),
        download_allow_original: selectToTri(allowOriginal),
      });
      toast.success(t('settings.saved', 'Settings saved'));
      await refetch();
      onChanged?.();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || t('settings.saveError', 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  // Same input styling as the other admin cards (SlideshowStyleFields) —
  // notably the explicit text colour, without which the select renders
  // muted and reads as disabled.
  const selectClass = 'w-full px-3 py-2 bg-inset border border-line-strong text-heading rounded-lg text-sm';

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <Download className="w-5 h-5 text-neutral-500" />
        <h3 className="text-base font-semibold text-heading">
          {t('settings.downloads.eventTitle', 'Download resolution')}
        </h3>
      </div>
      <p className="text-sm text-soft mb-4">
        {t('settings.downloads.eventIntro',
          'Override the site-wide download settings for this gallery only. "Inherit" follows Settings → Download resolutions.')}
      </p>

      {downloadsDisabled && <DownloadsDisabledNotice />}

      <fieldset disabled={downloadsDisabled} className={downloadsDisabled ? 'opacity-60' : undefined}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1 text-body">
            {t('settings.downloads.standard', 'Standard resolution')}
          </label>
          <select className={selectClass} value={standard} onChange={(e) => change('download_standard_resolution', e.target.value, setStandard, e.target.value === INHERIT ? null : e.target.value, data.overrides.download_standard_resolution ?? null)}>
            <option value={INHERIT}>
              {t('settings.downloads.inheritWith', 'Inherit ({{value}})', { value: globalStandardLabel })}
            </option>
            <option value={ORIGINAL}>{t('settings.downloads.original', 'Original (full size)')}</option>
            {data.globals.resolutions.map((r) => (
              <option key={r.id} value={r.id}>{r.label} — {r.width} × {r.height}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-body">
            {t('settings.downloads.picker', 'Let guests choose a download size')}
          </label>
          <select className={selectClass} value={picker} onChange={(e) => change('download_resolution_picker_enabled', e.target.value, setPicker, selectToTri(e.target.value), data.overrides.download_resolution_picker_enabled ?? null)}>
            <option value={INHERIT}>
              {t('settings.downloads.inheritWith', 'Inherit ({{value}})', {
                value: data.globals.picker_enabled ? t('common.on', 'on') : t('common.off', 'off'),
              })}
            </option>
            <option value="true">{t('common.on', 'on')}</option>
            <option value="false">{t('common.off', 'off')}</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-body">
            {t('settings.downloads.allowOriginal', 'Offer "Original" in the picker')}
          </label>
          <select
            className={selectClass}
            value={allowOriginal}
            onChange={(e) => change('download_allow_original', e.target.value, setAllowOriginal, selectToTri(e.target.value), data.overrides.download_allow_original ?? null)}
          >
            <option value={INHERIT}>
              {t('settings.downloads.inheritWith', 'Inherit ({{value}})', {
                value: data.globals.allow_original ? t('common.on', 'on') : t('common.off', 'off'),
              })}
            </option>
            <option value="true">{t('common.on', 'on')}</option>
            <option value="false">{t('common.off', 'off')}</option>
          </select>
        </div>
      </div>

      {/* What the gallery actually does right now, after the cascade. */}
      <p className="text-xs text-muted mt-4">
        {t('settings.downloads.effective', 'Currently hands out: {{standard}}', {
          standard: data.effective.standard === ORIGINAL
            ? t('settings.downloads.original', 'Original (full size)')
            : data.effective.standard,
        })}
        {data.effective.picker_enabled
          ? ` · ${t('settings.downloads.pickerOn', 'guests may choose another size')}`
          : ''}
      </p>

      {!draftMode && (
        <div className="flex justify-end mt-4">
          <Button variant="primary" onClick={save} disabled={saving || downloadsDisabled} leftIcon={<Save className="w-4 h-4" />}>
            {t('common.save', 'Save')}
          </Button>
        </div>
      )}
      </fieldset>
    </Card>
  );
};
