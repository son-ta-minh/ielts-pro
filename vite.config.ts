import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    // IMPORTANT: Changed to '/ielts-pro/' to match your GitHub Repo URL
    base: '/ielts-pro/', 
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.BUILD_TIMESTAMP': JSON.stringify(new Date().toISOString()),
    },
  }
})