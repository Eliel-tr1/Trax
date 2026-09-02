import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Deployed at ai.vitrue.co.il/trax-crm/ over SFTP (see deploy.js).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/trax-crm-backup/',
  define: {
    __BUILD_ID__: JSON.stringify(process.env.BUILD_ID || null),
  },
  resolve: {
    // '@' is what ported shadcn/admin components import from.
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
