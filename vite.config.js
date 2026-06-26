import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' makes the built assets load from a relative path, so the same
// build works on GitHub Pages (https://user.github.io/DIA/), Vercel, Netlify,
// or Supabase Hosting without rebuilding for each.
export default defineConfig({
  plugins: [react()],
  base: './',
})
