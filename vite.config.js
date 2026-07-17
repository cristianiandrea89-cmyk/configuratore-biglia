import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Espone il server sulla rete locale, così si può aprire l'app anche da
    // telefono/tablet sulla stessa Wi-Fi durante lo sviluppo.
    host: true,
    // Cartella sincronizzata con OneDrive: fs.watch nativo perde eventi,
    // il polling garantisce che l'HMR rilevi sempre le modifiche.
    watch: {
      usePolling: true,
    },
  },
})
