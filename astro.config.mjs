import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import { SITE_URL } from './src/consts';

export default defineConfig({
  site: SITE_URL,
  build: {
    assets: 'astro'
  },
  integrations: [sitemap(), tailwind()],
  vite: {
    optimizeDeps: {
      timeout: 120000
    }
  }
});
