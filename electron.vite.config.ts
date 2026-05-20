import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    server: {
      // Windows may reserve the default Vite range through TCP excluded port
      // ranges, which causes EACCES before Vite can start. Keep this outside
      // the commonly reserved 51xx range.
      port: Number(process.env.DIET_AGENT_DEV_PORT ?? 5317),
      strictPort: false
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-antd': ['antd', '@ant-design/icons'],
            'vendor-dexie': ['dexie', 'dexie-react-hooks'],
            'data-recipes': [
              './src/renderer/src/data/chineseRecipes.ts',
              './src/renderer/src/data/westernRecipes.ts',
              './src/renderer/src/data/recipeTypes.ts'
            ]
          }
        }
      }
    }
  }
})
