import React, { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { usePublicSettings } from '../hooks/usePublicSettings';

interface GlobalThemeProviderProps {
  children: React.ReactNode;
}

export const GlobalThemeProvider: React.FC<GlobalThemeProviderProps> = ({ children }) => {
  const { setTheme } = useTheme();
  const themeAppliedRef = useRef(false);
  const { data: settingsData } = usePublicSettings();

  // Apply the instance brand once the settings are loaded. It sits on :root
  // on every page, the client gallery included: the gallery scopes its own
  // fixed tokens under .client-gallery, so the brand never reaches it.
  useEffect(() => {
    if (!themeAppliedRef.current && settingsData?.theme_config) {
      themeAppliedRef.current = true;
      // Instance-wide force color mode is enforced inside ThemeContext.applyTheme.
      setTheme(settingsData.theme_config);
    }
  }, [settingsData, setTheme]);

  return <>{children}</>;
};
