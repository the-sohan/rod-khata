import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export default {
  distDir: process.env.ROD_SHOP_DEMO === '1' ? '.next-demo' : '.next',
  poweredByHeader: false,
  turbopack: { root },
  serverExternalPackages: ['node:sqlite'],
  outputFileTracingExcludes: {'/*':['../../data/**/*','../../work/**/*','../../releases/**/*','../../previews/**/*']},
};
