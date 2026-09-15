import { api } from '../config/api';

export interface DownloadQuotaState {
  enabled: boolean;
  unlimited: boolean;
  freeLimit: number;
  pricePerPhoto: number;
  /** null while unlimited. */
  total: number | null;
  used: number;
  /** null while unlimited. */
  remaining: number | null;
  enabledAt: string | null;
}

export interface DownloadPackage {
  id: number;
  kind: 'quantity' | 'unlimited';
  photo_count: number | null;
  price: string | number;
  name_i18n: Record<string, string> | null;
  /** Computed by the backend from the configured per photo price. Never recomputed here. */
  savings_percent: number | null;
  auto_label: { count: number | null; price: number; savings_percent: number | null };
}

export interface DownloadOrder {
  id: number;
  event_id: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  origin: 'client' | 'photographer';
  requested_photo_count: number | null;
  granted_photo_count: number | null;
  grants_unlimited: boolean;
  package_snapshot: {
    kind: 'quantity' | 'unlimited';
    photo_count: number | null;
    price: number;
    currency: string;
    name_i18n: Record<string, string> | null;
  } | null;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface DownloadQuotaResponse {
  quota: DownloadQuotaState;
  downloaded_photo_ids: number[];
  packages: DownloadPackage[];
  pending_order: DownloadOrder | null;
  currency: string;
}

/** The body a download route returns with 402 once the allowance is short. */
export interface QuotaExceededPayload {
  code: 'DOWNLOAD_QUOTA_EXCEEDED';
  quota: { total: number | null; used: number; remaining: number | null };
  requested_new: number;
  missing_slots: number;
}

export const downloadQuotaService = {
  async getQuota(slug: string): Promise<DownloadQuotaResponse> {
    const { data } = await api.get<DownloadQuotaResponse>(`/gallery/${slug}/download-quota`);
    return data;
  },

  async createOrder(slug: string, packageId: number): Promise<DownloadOrder> {
    const { data } = await api.post<DownloadOrder>(
      `/gallery/${slug}/download-orders`,
      { package_id: packageId },
    );
    return data;
  },
};

/**
 * Reads a 402 body off a failed download. Returns null for anything else, so a
 * caller can tell "out of allowance" from an ordinary failure without
 * inspecting axios internals at every call site.
 */
export function asQuotaExceeded(error: unknown): QuotaExceededPayload | null {
  const body = (error as { response?: { status?: number; data?: unknown } })?.response;
  if (body?.status !== 402) return null;
  const data = body.data as QuotaExceededPayload | undefined;
  return data?.code === 'DOWNLOAD_QUOTA_EXCEEDED' ? data : null;
}
