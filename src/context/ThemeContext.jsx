import { createContext, useEffect, useMemo, useState } from 'react';
import { CssBaseline, ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material';

export const ThemeContext = createContext({
  mode: 'light',
  toggleMode: () => {},
});

const STORAGE_KEY = 'chatpilot_ui_theme';

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore storage access issues
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore storage access issues
    }
  }, [mode]);

  const toggleMode = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const muiTheme = useMemo(() => {
    const isDark = mode === 'dark';
    return createTheme({
      palette: {
        mode,
        primary: {
          main: isDark ? '#3B82F6' : '#1D4ED8',
          contrastText: '#FFFFFF',
        },
        background: {
          default: isDark ? '#0B1120' : '#F8FAFC',
          paper: isDark ? '#111827' : '#FFFFFF',
        },
        text: {
          primary: isDark ? '#F1F5F9' : '#0F172A',
          secondary: isDark ? '#94A3B8' : '#475569',
        },
        divider: isDark ? '#1F2937' : '#E2E8F0',
        success: {
          main: isDark ? '#22C55E' : '#16A34A',
        },
        warning: {
          main: isDark ? '#F59E0B' : '#D97706',
        },
        error: {
          main: isDark ? '#EF4444' : '#DC2626',
        },
      },
      shape: {
        borderRadius: 10,
      },
      typography: {
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        h1: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700 },
        h2: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700 },
        h3: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600 },
        h4: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600 },
        h5: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600 },
        h6: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600 },
        button: {
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600,
          textTransform: 'none',
        },
      },
      components: {
        MuiPaper: {
          defaultProps: { elevation: 0 },
          styleOverrides: {
            root: {
              backgroundImage: 'none',
              border: `1px solid ${isDark ? '#1F2937' : '#E2E8F0'}`,
            },
          },
        },
        MuiButton: {
          defaultProps: { disableElevation: true },
          styleOverrides: {
            root: {
              borderRadius: 8,
              padding: '8px 16px',
              whiteSpace: 'nowrap',
            },
          },
        },
        MuiTableCell: {
          styleOverrides: {
            root: {
              borderBottom: `1px solid ${isDark ? '#1F2937' : '#E2E8F0'}`,
              paddingTop: 10,
              paddingBottom: 10,
            },
            head: {
              fontWeight: 600,
              fontSize: '0.75rem',
              color: isDark ? '#94A3B8' : '#475569',
              backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
            },
          },
        },
      },
    });
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ mode, toggleMode }}>
      <MuiThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}
