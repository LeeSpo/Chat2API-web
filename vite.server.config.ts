import { builtinModules } from 'module'
import { resolve } from 'path'
import { defineConfig } from 'vite'

const external = [
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
]

export default defineConfig({
  build: {
    outDir: 'out-server',
    emptyOutDir: true,
    target: 'node20',
    ssr: true,
    rollupOptions: {
      input: {
        'server/index': resolve(__dirname, 'backend/index.ts'),
        'server/qwenBrowserSidecar': resolve(__dirname, 'backend/qwenBrowserSidecar.ts'),
        'server/bootstrapConfig': resolve(__dirname, 'backend/bootstrapConfig.ts'),
        'main/runtime/nodeRuntime': resolve(__dirname, 'backend/runtime/nodeRuntime.ts'),
        'main/store/storage/nodeJsonStore': resolve(__dirname, 'backend/store/storage/nodeJsonStore.ts'),
      },
      external,
      output: {
        format: 'cjs',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
      },
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
    },
  },
})
