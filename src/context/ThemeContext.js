import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

const readStoredTheme = () => {
  try {
    const storedTheme = window.localStorage.getItem('theme');
    return storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : 'light';
  } catch (_) {
    return 'light';
  }
};

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(readStoredTheme);

  const setTheme = useCallback((nextTheme) => {
    if (nextTheme !== 'light' && nextTheme !== 'dark') return;
    setThemeState(nextTheme);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try {
      window.localStorage.setItem('theme', theme);
    } catch (_) {
      // The in-memory preference still applies when storage is unavailable.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => current === 'light' ? 'dark' : 'light');
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
