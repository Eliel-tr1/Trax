import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Hosted on Cloudflare Pages at the domain root (docs/runbooks/deploy.md).
// Deploys: `npx wrangler pages deploy dist --project-name trax-crm --branch staging|main`
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  define: {
    __BUILD_ID__: JSON.stringify(process.env.BUILD_ID || null),
  },
  resolve: {
    // '@' is what ported shadcn/admin components import from.
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
