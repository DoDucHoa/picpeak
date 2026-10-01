import { useTranslation } from 'react-i18next';
import type { GalleryController } from '../state/useGalleryController';
import type { SortField } from '../state/urlState';
import { SortIcon } from '../icons';
import { Menu } from './Menu';

const FIELDS: SortField[] = ['capture_date', 'name', 'date'];

/** The sort field menu. The trigger names the field in force. */
export function SortMenu({ c }: { c: GalleryController }) {
  const { t } = useTranslation();
  const labels: Record<SortField, string> = {
    capture_date: t('clientGallery.sort.captureDate', 'Creation Time'),
    name: t('clientGallery.sort.fileName', 'File Name'),
    date: t('clientGallery.sort.lastUpload', 'Last Upload'),
  };
  const current = labels[c.url.sort];
  return (
    <Menu
      label={current}
      items={FIELDS.map((field) => ({
        key: field,
        label: labels[field],
        current: field === c.url.sort,
        onSelect: () => c.setSort(field),
      }))}
      trigger={<><span className="cg-tb-icon-compact"><SortIcon /></span><span className="cg-tb-label">{current}</span></>}
    />
  );
}
