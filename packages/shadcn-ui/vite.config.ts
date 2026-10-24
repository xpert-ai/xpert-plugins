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
      entry: {
        index: fileURLToPath(new URL('./src/build.ts', import.meta.url)),
        theme: fileURLToPath(new URL('./src/theme.ts', import.meta.url)),
        i18n: fileURLToPath(new URL('./src/i18n.tsx', import.meta.url))
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
      cssFileName: 'style'
    },
    rollupOptions: {
      external: [
        'react',
        'i18next',
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
