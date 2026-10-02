import { useTranslation } from 'react-i18next';

interface BundlePartsNoticeProps {
  parts: { href: string; name: string }[];
}

/**
 * The toast after a selection went out as several ZIP parts. The parts start
 * on their own, but a browser may block every download after the first, so
 * each part is also a link the guest can press themselves.
 */
export function BundlePartsNotice({ parts }: BundlePartsNoticeProps) {
  const { t } = useTranslation();
  return (
    <div data-testid="bundle-parts-notice">
      <p style={{ margin: '0 0 8px' }}>
        {t('clientGallery.bundle.started', 'Your photos are downloading in {{count}} parts.', { count: parts.length })}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 13, opacity: 0.8 }}>
        {t('clientGallery.bundle.blockedHint', 'If a part did not start, download it here:')}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {parts.map((part, i) => (
          <a key={part.href} href={part.href} download={part.name} style={{ textDecoration: 'underline', fontWeight: 600 }}>
            {t('clientGallery.bundle.part', 'Part {{index}} of {{count}}', { index: i + 1, count: parts.length })}
          </a>
        ))}
      </div>
    </div>
  );
}
