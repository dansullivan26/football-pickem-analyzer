import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Project Pages live at /football-pickem-analyzer/. Deep links need an
  // absolute base so /players still loads JS from the app root, not /players/.
  base: command === 'build' ? '/football-pickem-analyzer/' : '/',
}))
