import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const result=spawnSync(process.execPath,[require.resolve('next/dist/bin/next'),'build','apps/pc'],{stdio:'inherit',env:{...process.env,ROD_SHOP_DEMO:'1',NEXT_TELEMETRY_DISABLED:'1'}});
if(result.error) console.error(result.error.message);
process.exit(result.status??1);
