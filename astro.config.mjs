// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://divas-tragonas.github.io',
  base: '/wiki',
  vite: {
    plugins: [tailwindcss()]
  }
});