/**
 * Sharing section navigation.
 *
 * The three ways a photographer gets files to someone: the event galleries
 * themselves, the archived ones, and a direct PicTransfer link. Archives and
 * PicTransfer were both top-level sidebar entries before the navigation
 * cleanup, and PicTransfer briefly sat under Communication — which reads as
 * messaging, and sending files is not messaging (review of #1718).
 *
 * There is no SharingLayout component to go with this. The section spans
 * several URL trees (/admin/events, /admin/transfers and, in this fork,
 * /admin/download-orders) rather than nesting under one
 * root, so there is no section root to redirect and no empty state to own.
 * Nothing here is reachable by everyone who can enter the section — a role
 * holding only `archives.view` cannot open the events list — so the sidebar
 * aims the menu entry at the first item this hook returns rather than at the
 * section's first path. It reads this hook directly and activates on either.
 */
import { useTranslation } from 'react-i18next';
import { Calendar, Archive, Send, ShoppingCart } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useFeatureFlags, type FeatureKey } from '../../contexts/FeatureFlagsContext';

/** Route prefixes that put the sidebar into the Sharing section. */
export const SHARING_PATHS = ['/admin/events', '/admin/transfers', '/admin/download-orders'] as const;

export interface SharingNavItem {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
  /** Permission required to reach the page behind this entry. */
  permission: string;
  /** Feature flag that must be ON, for the entries that have one. */
  featureFlag?: FeatureKey;
}

/** Sub-pages of the Sharing section this admin can reach. */
export function useSharingNavItems(): SharingNavItem[] {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const { flags } = useFeatureFlags();

  const navItems: SharingNavItem[] = [
    {
      key: 'events',
      to: '/admin/events',
      label: t('navigation.events', 'Events'),
      icon: Calendar,
      permission: 'events.view',
    },
    {
      key: 'archives',
      to: '/admin/events/archives',
      label: t('navigation.archives', 'Archives'),
      icon: Archive,
      permission: 'archives.view',
    },
    {
      // Download orders (migration 214, this fork): the queue a client lands in
      // once a gallery runs out of free downloads. Gated on events.view, the
      // same read the backend applies to /admin/download-orders.
      key: 'downloadOrders',
      to: '/admin/download-orders',
      label: t('navigation.downloadOrders', 'Download orders'),
      icon: ShoppingCart,
      permission: 'events.view',
    },
    {
      // PicTransfer (#997) — strictly opt-in, so it keeps its own flag.
      key: 'transfers',
      to: '/admin/transfers',
      label: t('navigation.transfers', 'PicTransfer'),
      icon: Send,
      permission: 'events.view',
      featureFlag: 'transfers',
    },
  ];

  return navItems.filter((item) =>
    hasPermission(item.permission) && (!item.featureFlag || flags[item.featureFlag]));
}
