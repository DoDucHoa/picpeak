import { useCallback, useEffect, useRef } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../components/common';

/**
 * Ask before leaving a page with unsaved changes (spec 5.2). Only a pathname
 * change counts, so ?tab= and ?section= never prompt. The page calls
 * allowNextNavigation() before its own post-save or post-create redirect.
 * Needs the data router (App.tsx).
 */
export function useNavigationGuard(isDirty: boolean): { allowNextNavigation: () => void } {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const bypass = useRef(false);
  const asking = useRef(false);

  const blocker = useBlocker(useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    if (bypass.current) {
      bypass.current = false;
      return false;
    }
    return isDirty && currentLocation.pathname !== nextLocation.pathname;
  }, [isDirty]));

  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return;
    asking.current = true;
    void confirm({
      title: t('settings.saveBar.leaveTitle', 'Discard unsaved changes?'),
      message: t('settings.saveBar.leaveMessage', 'You have unsaved changes on this page. Leaving now discards them.'),
      confirmLabel: t('settings.saveBar.leaveConfirm', 'Discard and leave'),
      cancelLabel: t('settings.saveBar.leaveCancel', 'Stay'),
      variant: 'warning',
    }).then((ok) => {
      asking.current = false;
      if (ok) blocker.proceed?.();
      else blocker.reset?.();
    });
  }, [blocker, confirm, t]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const allowNextNavigation = useCallback(() => { bypass.current = true; }, []);
  return { allowNextNavigation };
}
