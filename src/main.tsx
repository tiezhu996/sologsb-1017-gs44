import React from 'react'
import ReactDOM from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import App from './App'
import './styles.css'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#7b4b2a' },
    secondary: { main: '#2f6f67' },
    background: { default: '#eee9df', paper: '#faf7f0' },
    text: { primary: '#28241f', secondary: '#6f675d' },
    warning: { main: '#c77a22' },
    error: { main: '#b3493e' }
  },
  typography: {
    fontFamily: '"IBM Plex Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
    h4: { fontWeight: 760, letterSpacing: '-.03em' },
    h5: { fontWeight: 740 },
    h6: { fontWeight: 720 },
    button: { textTransform: 'none', fontWeight: 700 }
  },
  shape: { borderRadius: 10 },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiSelect: { defaultProps: { size: 'small' } }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined))
}
