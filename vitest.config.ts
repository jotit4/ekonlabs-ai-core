import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // No descubrir tests dentro de worktrees git (`.claude/worktrees/*`) ni de
    // ningún otro artefacto bajo `.claude/`: son copias stale que duplican y
    // contaminan la suite (corrían 7× cada test contra código viejo).
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
