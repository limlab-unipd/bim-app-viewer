// https://vite.dev/config/
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),

    // plugin per forzare il full reload della pagina web ogni volta che si salva un file dentro src
    {
      name: 'force-full-reload-viewer',
      handleHotUpdate({ file, server }) {
        if (file.includes('src')) {
          server.ws.send({ type: 'full-reload' })
        }
      }
    }
  ],
  base: '/',
})
