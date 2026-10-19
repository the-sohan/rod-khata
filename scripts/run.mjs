import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { projectRoot } from '../lib/store.mjs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const next = require.resolve('next/dist/bin/next');
const mode = process.argv.includes('--production') ? 'start' : 'dev';
const children = [];
let stopping = false;
function launch(args) {
  const child = spawn(process.execPath, args, { cwd: projectRoot, stdio: 'inherit' });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 0); });
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 800).unref();
}
console.log('\nরডখাতা · লোকাল পরীক্ষার সংস্করণ');
console.log('PC entry: http://127.0.0.1:3000');
console.log('Owner dashboard preview: http://127.0.0.1:3001');
console.log('PC entry is local. Check Backup & Update for Google Drive connection status.\n');
launch([next, mode, path.join(projectRoot,'apps/pc'), '--hostname','127.0.0.1','--port','3000']);
// The owner app is a static export for future private-data loading; dev serves it locally during this milestone.
if (mode === 'start') {
  launch([path.join(projectRoot,'scripts/serve-owner.mjs')]);
} else {
  launch([next,'dev',path.join(projectRoot,'apps/owner'),'--hostname','127.0.0.1','--port','3001']);
}
launch([path.join(projectRoot,'scripts/worker.mjs')]);
launch([path.join(projectRoot,'scripts/mobile-server.mjs')]);
launch([path.join(projectRoot,'scripts/drive-worker.mjs')]);
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
