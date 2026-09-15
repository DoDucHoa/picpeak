/**
 * The download-order notification is the only automated link between a client
 * placing an order and the photographer learning there is something to approve.
 * No reminder email follows it, so a missing locale key means the bell shows a
 * generic "system activity" line, the photographer skips it, and the order sits
 * untouched until it expires.
 *
 * These checks assert the real keys resolve in all three full-parity locales.
 */
import { describe, it, expect } from 'vitest';
import i18n from '../../i18n/config';
import { notificationsService, type Notification } from '../notifications.service';

const base: Omit<Notification, 'type'> = {
  id: 1,
  actorType: 'customer',
  actorName: null,
  eventName: 'Anna & Tom',
  eventId: 42,
  metadata: { package_kind: 'quantity', photo_count: 20, price: 18, currency: 'EUR' },
  createdAt: '2026-09-15T12:00:00Z',
  readAt: null,
  isRead: false,
} as any;

const order = { ...base, type: 'download_order_created' } as Notification;

describe('download order notifications', () => {
  it.each(['en', 'de', 'vi'])('resolves a real locale key in %s', async (lang) => {
    await i18n.changeLanguage(lang);

    const msg = notificationsService.formatNotificationMessage(order);

    expect(msg).toBeTruthy();
    expect(msg.toLowerCase()).not.toContain('system activity');
    expect(msg).toContain('Anna & Tom');
  });

  it('names the number of photos the client asked for', async () => {
    await i18n.changeLanguage('en');

    expect(notificationsService.formatNotificationMessage(order)).toContain('20');
  });

  it('does not quote a photo count for an unlimited package, since there is none', async () => {
    await i18n.changeLanguage('en');
    const unlimited = {
      ...base,
      type: 'download_order_created',
      metadata: { package_kind: 'unlimited', photo_count: null, price: 300, currency: 'EUR' },
    } as Notification;

    const msg = notificationsService.formatNotificationMessage(unlimited);

    expect(msg).toContain('Anna & Tom');
    expect(msg).not.toContain('null');
  });

  it('carries its own icon rather than the generic bell', () => {
    const { icon } = notificationsService.getNotificationStyle(order.type);

    expect(icon).not.toBe('Bell');
  });
});
