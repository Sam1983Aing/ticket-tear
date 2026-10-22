import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths so the build works under /ticket-tear/ on GitHub Pages
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true
  },
  server: {
    port: 5203,
    strictPort: true,
    host: true
  },
  preview: {
    port: 5203,
    strictPort: true
  }
})
