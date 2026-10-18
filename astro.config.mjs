// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://divas-tragonas.github.io',
  base: '/wiki',
  /* adreces antigues de pàgines reanomenades */
  redirects: {
    '/wiki/places/runes-de-cony-berry': '/wiki/wiki/places/runes-de-cony-cirera'
  },
  vite: {
    plugins: [tailwindcss()]
  }
});