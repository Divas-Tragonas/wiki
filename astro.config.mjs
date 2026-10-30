// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

/* A GitHub Pages el wiki viu a /wiki; a Vercel, amb domini propi, a l'arrel (SITE_BASE=/ i SITE_URL=https://…). */
const base = process.env.SITE_BASE || '/wiki';
const prefix = base.replace(/\/$/, '');

export default defineConfig({
  site: process.env.SITE_URL || 'https://divas-tragonas.github.io',
  base,
  /* adreces antigues de pàgines reanomenades */
  redirects: {
    '/wiki/places/runes-de-cony-berry': `${prefix}/wiki/places/runes-de-cony-cirera`
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
