import { api } from '../config/api';
import type {
  DownloadOrder,
  DownloadPackage,
  DownloadQuotaState,
} from './downloadQuota.service';

/**
 * The raw per-event row, handed back alongside the resolved quota state. The
 * form binds to THIS and never to the resolved state: a NULL column has to stay
 * visibly empty rather than show the inherited number as if it had been typed.
 */
export interface EventQuotaSettingsRow {
  event_id: number;
  quota_enabled: boolean;
  enabled_at: string | null;
  free_limit: number | null;
  price_per_photo: number | string | null;
}

export interface AdminQuotaResponse {
  quota: DownloadQuotaState;
  settings: EventQuotaSettingsRow | null;
  pending_order: DownloadOrder | null;
  currency: string;
}

/** Only the fields actually sent are written, so a partial patch is meaningful. */
export interface QuotaPatch {
  quota_enabled?: boolean;
  free_limit?: number | null;
  price_per_photo?: number | null;
}

export interface DownloadLedgerEntry {
  id: number;
  photo_id: number;
  first_downloaded_at: string;
  access_level: string | null;
  /** Null once the photo itself is gone. The ledger row outlives it on purpose. */
  filename: string | null;
  thumbnail_path: string | null;
}

export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminDownloadOrder extends DownloadOrder {
  event_name: string;
  slug: string;
}

export interface PackageListResponse {
  packages: DownloadPackage[];
  currency: string;
}

export interface PackageImportResult {
  imported: number;
  skipped: number;
  skipped_ids: number[];
}

/** Thrown when a number field holds something that is neither blank nor a count. */
export class InvalidQuotaNumberError extends Error {}

/**
 * Blank reaches the API as null, which means "inherit the system default".
 * A typed 0 reaches it as 0, which means this gallery grants no free download
 * at all. Collapsing the two is not a cosmetic slip: sending 0 for a blank box
 * locks the client out of the gallery they paid for, and the response looks
 * exactly like a successful save.
 */
export function toNullableQuotaNumber(raw: string | null | undefined): number | null {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidQuotaNumberError('INVALID_QUOTA_NUMBER');
  }
  return value;
}

export const adminDownloadQuotaService = {
  async getQuota(eventId: number): Promise<AdminQuotaResponse> {
    const { data } = await api.get<AdminQuotaResponse>(`/admin/events/${eventId}/download-quota`);
    return data;
  },

  async saveQuota(eventId: number, patch: QuotaPatch): Promise<AdminQuotaResponse> {
    const { data } = await api.put<AdminQuotaResponse>(
      `/admin/events/${eventId}/download-quota`,
      patch,
    );
    return data;
  },

  async getLedger(
    eventId: number,
    params: { page?: number; limit?: number } = {},
  ): Promise<PagedResponse<DownloadLedgerEntry>> {
    const { data } = await api.get<PagedResponse<DownloadLedgerEntry>>(
      `/admin/events/${eventId}/download-ledger`,
      { params },
    );
    return data;
  },

  async createOrderForEvent(
    eventId: number,
    packageId: number,
    reason: string,
  ): Promise<AdminDownloadOrder> {
    const { data } = await api.post<AdminDownloadOrder>(
      `/admin/events/${eventId}/download-orders`,
      { package_id: packageId, reason },
    );
    return data;
  },

  async listOrders(
    params: { status?: string; page?: number; limit?: number } = {},
  ): Promise<PagedResponse<AdminDownloadOrder>> {
    const { data } = await api.get<PagedResponse<AdminDownloadOrder>>('/admin/download-orders', {
      params,
    });
    return data;
  },

  async approveOrder(orderId: number, grantedPhotoCount?: number | null): Promise<AdminDownloadOrder> {
    const body = grantedPhotoCount == null ? {} : { granted_photo_count: grantedPhotoCount };
    const { data } = await api.post<AdminDownloadOrder>(
      `/admin/download-orders/${orderId}/approve`,
      body,
    );
    return data;
  },

  async rejectOrder(orderId: number, reason: string): Promise<AdminDownloadOrder> {
    const { data } = await api.post<AdminDownloadOrder>(
      `/admin/download-orders/${orderId}/reject`,
      { reason },
    );
    return data;
  },

  async getGlobalPackages(): Promise<PackageListResponse> {
    const { data } = await api.get<PackageListResponse>('/admin/download-packages');
    return data;
  },

  async saveGlobalPackages(packages: unknown[]): Promise<{ saved: number; deactivated: number }> {
    const { data } = await api.put<{ saved: number; deactivated: number }>(
      '/admin/download-packages',
      { packages },
    );
    return data;
  },

  async getEventPackages(eventId: number): Promise<PackageListResponse> {
    const { data } = await api.get<PackageListResponse>(
      `/admin/events/${eventId}/download-packages`,
    );
    return data;
  },

  /**
   * What a customer of this gallery would actually be offered: the gallery's
   * own active packages, falling back to the global list when it has none of
   * its own. Unlike `getEventPackages` (the edit tab's own-list-only view,
   * empty on purpose when nothing gallery-specific is set), this is what
   * "Create order for client" needs to pick from: a gallery that never
   * customised its price list must still offer the global packages.
   */
  async getAvailablePackagesForOrder(eventId: number): Promise<PackageListResponse> {
    const { data } = await api.get<PackageListResponse>(
      `/admin/events/${eventId}/download-packages`,
      { params: { resolved: 'true' } },
    );
    return data;
  },

  async saveEventPackages(
    eventId: number,
    packages: unknown[],
  ): Promise<{ saved: number; deactivated: number }> {
    const { data } = await api.put<{ saved: number; deactivated: number }>(
      `/admin/events/${eventId}/download-packages`,
      { packages },
    );
    return data;
  },

  async importPackageNames(packages: unknown[]): Promise<PackageImportResult> {
    const { data } = await api.post<PackageImportResult>('/admin/download-packages/import', {
      packages,
    });
    return data;
  },
};
