import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Nome del repo GitHub → diventa il path su GitHub Pages.
// In dev serviamo da '/', in produzione (build) da '/<REPO>/'.
// ⚠️ Se cambi il nome del repo, aggiorna SOLO questa costante.
const REPO = 'guardia-medica'

export default defineConfig(({ command }) => {
  const buildDate = new Date().toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
  // In CI (GitHub Actions) usa il commit SHA, in locale mostra 'dev'
  const buildSha = (process.env.GITHUB_SHA ?? '').slice(0, 7) || 'dev'

  return {
    base: command === 'build' ? `/${REPO}/` : '/',

    define: {
      __APP_VERSION__: JSON.stringify(buildSha),
      __BUILD_DATE__:  JSON.stringify(buildDate),
    },

    plugins: [react()],

    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  }
})
