import { useTranslation } from 'react-i18next';
import { SELECTED_DOWNLOAD_LIMIT } from '../../../components/gallery/folders';
import type { GalleryController } from '../state/useGalleryController';
import { DownloadIcon } from '../icons';
import { Menu } from './Menu';
import type { MenuItem } from './Menu';

/**
 * The Download menu. Every entry calls a controller handler and nothing else:
 * the handlers are where the quota refresh lives, so a path that went to the
 * services from here would leave the allowance badge stale.
 *
 * The folder and people entries are the old header's "download folder" and
 * "download these N" buttons, offered only when they would download something.
 */
export function DownloadMenu({ c }: { c: GalleryController }) {
  const { t } = useTranslation();
  // With the order offer showing, the whole album no longer fits the
  // allowance, so "All" gives way to the offer button beside the menu.
  // While the archive is being built, "All" says so and cannot be pressed
  // again, so a second tap never starts a second archive.
  const items: MenuItem[] = c.offerFullPackage
    ? []
    : [{
        key: 'all',
        label: c.isDownloadingAll
          ? t('gallery.preparingDownload', 'Preparing your download…')
          : t('clientGallery.downloadAll', 'All'),
        onSelect: c.handleDownloadAll,
        disabled: c.isDownloadingAll,
      }];
  if (c.folders.open && c.folders.downloadIds.length > 0) {
    items.push({
      key: 'folder',
      label: c.folders.downloadCapped
        ? t('gallery.downloadFolderCapped', 'Download first {{limit}} of {{total}}', {
            limit: SELECTED_DOWNLOAD_LIMIT,
            total: c.folders.downloadTotal,
          })
        : t('gallery.downloadFolder', 'Download folder ({{count}})', { count: c.folders.downloadIds.length }),
      onSelect: () => { void c.folders.downloadFolder(); },
    });
  }
  if (c.people.selectedIds.length > 0 && c.people.downloadableIds.length > 0) {
    items.push({
      key: 'people',
      label: t('gallery.people.downloadThese', {
        count: c.people.downloadableIds.length,
        defaultValue: `Download these ${c.people.downloadableIds.length}`,
      }),
      onSelect: () => { void c.people.downloadFiltered(); },
    });
  }
  items.push({
    key: 'select',
    label: t('clientGallery.multiSelect', 'Multi-select'),
    onSelect: () => c.selection.setActive(true),
  });

  const label = t('clientGallery.download', 'Download');
  return (
    <Menu
      label={label}
      items={items}
      trigger={<><DownloadIcon /><span className="cg-tb-label">{label}</span></>}
    />
  );
}
