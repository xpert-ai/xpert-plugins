import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  server: {
    host: '0.0.0.0',
    cors: true
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/lib/remote', import.meta.url))
    }
  },
  build: {
    outDir: 'dist/remote',
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL('./src/lib/remote/main.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'app.js',
      cssFileName: 'app'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: 'app.[ext]'
      }
    },
    sourcemap: false,
    target: 'es2022'
  }
})
