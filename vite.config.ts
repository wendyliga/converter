import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the static build works both on GitHub Pages project sites
// (https://<user>.github.io/converter/) and at a domain root.
export default defineConfig({
  base: './',
  plugins: [react()],
})
