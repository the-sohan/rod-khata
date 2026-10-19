import { openStore } from '../lib/store.mjs';

const store = openStore();
const mode = process.argv[2];
if (mode === '--snapshot') {
  store.snapshot();
  console.log('Local owner snapshot created. Google Drive is not connected.');
  store.close();
} else if (mode === '--backup') {
  const result = await store.backupDatabase();
  console.log(`Local backup verified: ${result.filename}`);
  store.close();
} else {
  let busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const status = store.status();
      if (!status.snapshotAt || Date.now()-Date.parse(status.snapshotAt) >= 30*60*1000) {
        store.snapshot();
        console.log('30-minute local snapshot updated.');
      }
      if (!status.backupAt || Date.now()-Date.parse(status.backupAt) >= 60*60*1000) {
        await store.backupDatabase();
        console.log('Hourly local backup created and verified.');
      }
    } catch (error) { console.error('Local background task failed:', error.message); }
    finally { busy = false; }
  }
  await tick();
  const timer = setInterval(tick, 30_000);
  async function stop() {
    clearInterval(timer);
    while (busy) await new Promise(resolve => setTimeout(resolve, 50));
    store.close();
    process.exit(0);
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
