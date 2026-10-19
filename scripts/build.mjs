import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { projectRoot } from '../lib/store.mjs';
import path from 'node:path';
const require = createRequire(import.meta.url);
for (const app of ['pc','owner']) {
  const result = spawnSync(process.execPath,[require.resolve('next/dist/bin/next'),'build',path.join(projectRoot,'apps',app)],{
    cwd:projectRoot,stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
