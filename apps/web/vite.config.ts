import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  // Scan browser SDK entries before serving; lazy smoke imports otherwise trigger
  // re-optimization and stale Vue chunk URLs during concurrent navigation.
  optimizeDeps: { entries: ['index.html', 'src/lib/*.ts'] },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: 'localhost',
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
