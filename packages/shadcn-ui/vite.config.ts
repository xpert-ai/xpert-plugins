import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    conditions: ['shadcn-ui-source']
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/build.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'style'
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'radix-ui',
        'lucide-react',
        'class-variance-authority',
        'clsx',
        'cmdk',
        'react-resizable-panels',
        'tailwind-merge'
      ]
    },
    cssCodeSplit: false,
    emptyOutDir: true,
    sourcemap: true
  }
})
