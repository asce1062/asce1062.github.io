import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://asce1062.github.io',
  integrations: [sitemap(), tailwind()],
  vite: {
    optimizeDeps: {
      timeout: 120000
    }
  }
});