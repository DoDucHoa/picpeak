import { useTranslation } from 'react-i18next';
import { format, isValid, parseISO } from 'date-fns';
import { getDateFnsLocale } from '../../../utils/dateLocale';
import type { Photo } from '../../../types';
import { formatBytes, formatDimensions } from '../list/ListRow';

interface FileInfoPanelProps {
  photo: Photo;
  showOriginalFilename: boolean;
}

/** Name, dimensions, size and capture time of the photo on screen. */
export function FileInfoPanel({ photo, showOriginalFilename }: FileInfoPanelProps) {
  const { t, i18n } = useTranslation();
  const name = showOriginalFilename && photo.original_filename ? photo.original_filename : photo.filename;
  const dimensions = formatDimensions(photo.width, photo.height);
  const capturedAt = photo.captured_at ? parseISO(photo.captured_at) : null;
  const captured = capturedAt && isValid(capturedAt)
    ? format(capturedAt, 'dd MMM yyyy, HH:mm', { locale: getDateFnsLocale(i18n.language) })
    : null;

  return (
    <dl className="cg-fileinfo">
      <dt>{t('clientGallery.viewer.fileName', 'File name')}</dt>
      <dd>{name}</dd>
      {dimensions && (
        <>
          <dt>{t('clientGallery.viewer.dimensions', 'Dimensions')}</dt>
          <dd>{dimensions}</dd>
        </>
      )}
      <dt>{t('clientGallery.viewer.size', 'Size')}</dt>
      <dd>{formatBytes(photo.size)}</dd>
      {captured && (
        <>
          <dt>{t('clientGallery.viewer.captured', 'Captured')}</dt>
          <dd>{captured}</dd>
        </>
      )}
    </dl>
  );
}
