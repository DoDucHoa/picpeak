import React, { useLayoutEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { usePublicSettings } from '../hooks/usePublicSettings';
import { useBrandSettings } from '../hooks/useBrandSettings';

interface GlobalThemeProviderProps {
  children: React.ReactNode;
}

export const GlobalThemeProvider: React.FC<GlobalThemeProviderProps> = ({ children }) => {
  const { setTheme } = useTheme();
  const themeAppliedRef = useRef(false);
  const { data: settingsData } = usePublicSettings();
  const { isBrandReady } = useBrandSettings();

  // Apply the instance brand once the settings are loaded. It sits on :root
  // on every page, the client gallery included: the gallery scopes its own
  // fixed tokens under .client-gallery, so the brand never reaches it.
  // A layout effect, so the frame that reveals the page already carries it.
  useLayoutEffect(() => {
    if (!themeAppliedRef.current && settingsData?.theme_config) {
      themeAppliedRef.current = true;
      // Instance-wide force color mode is enforced inside ThemeContext.applyTheme.
      setTheme(settingsData.theme_config);
    }
  }, [settingsData, setTheme]);

  // A browser with no saved brand has nothing but the PicPeak defaults to
  // paint, so keep the app invisible until the real brand is known rather
  // than flashing the wrong logo and colours. Only the very first visit
  // waits here; later loads paint the saved brand straight away.
  useLayoutEffect(() => {
    const appRoot = document.getElementById('root');
    if (!appRoot) return;
    appRoot.style.visibility = isBrandReady ? '' : 'hidden';
  }, [isBrandReady]);

  return <>{children}</>;
};
