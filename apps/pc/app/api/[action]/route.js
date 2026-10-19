import { openStore } from '../../../../../lib/store.mjs';
import {publicMobileConfiguration,setMobileConfiguration} from '../../../../../lib/mobile-access.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const pcOrigins = new Set(['http://127.0.0.1:3000', 'http://localhost:3000']);
const ownerOrigins = new Set(['http://127.0.0.1:3001', 'http://localhost:3001']);
function headers(request) {
  const origin = request.headers.get('origin');
  const result = { 'Cache-Control': 'no-store', 'Vary': 'Origin' };
  if (pcOrigins.has(origin) || ownerOrigins.has(origin)) result['Access-Control-Allow-Origin'] = origin;
  return result;
}
function response(request, value, status = 200) { return Response.json(value, { status, headers: headers(request) }); }

export async function OPTIONS(request) {
  if (!ownerOrigins.has(request.headers.get('origin')) && !pcOrigins.has(request.headers.get('origin'))) {
    return response(request, { error: 'অনুমতি নেই।' }, 403);
  }
  return new Response(null, { status: 204, headers: {
    ...headers(request), 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
  }});
}
export async function GET(request, context) {
  const origin = request.headers.get('origin');
  const { action } = await context.params;
  if (origin && !pcOrigins.has(origin) && !ownerOrigins.has(origin)) return response(request, { error: 'অনুমতি নেই।' }, 403);
  if (ownerOrigins.has(origin) && action !== 'owner-snapshot') return response(request, { error: 'এই ড্যাশবোর্ডে শুধু হিসাব দেখা যায়।' }, 403);
  const store = openStore();
  try {
    if (action === 'dashboard') return response(request, { data: store.dashboard(), status: store.status() });
    if (action === 'reports') return response(request, { report: store.salesReport(Object.fromEntries(new URL(request.url).searchParams)) });
    if (action === 'mobile-config') return response(request, { mobile: publicMobileConfiguration(store.db) });
    if (action === 'owner-export') {
      const data=store.snapshot();return Response.json(data,{headers:{...headers(request),'Content-Disposition':'attachment; filename="rod-shop-owner-snapshot.json"'}});
    }
    if (action === 'owner-snapshot') return response(request, { data: store.readSnapshot(), status: store.status() });
    if (action === 'customer-history') return response(request, { history: store.customerHistory(Object.fromEntries(new URL(request.url).searchParams)) });
    if (action === 'receipt') {
      const receipt = store.receipt(new URL(request.url).searchParams.get('id'));
      return receipt ? response(request, { receipt }) : response(request, { error: 'রসিদ পাওয়া যায়নি।' }, 404);
    }
    return response(request, { error: 'ঠিকানা পাওয়া যায়নি।' }, 404);
  } catch (error) {
    if(error instanceof RangeError) return response(request, { error: error.message }, 400);
    console.error('Local read failed:', error); return response(request, { error: 'হিসাব পড়তে সমস্যা হয়েছে।' }, 500);
  }
  finally { store.close(); }
}
export async function POST(request, context) {
  // This first milestone is loopback-only. Owner origin never receives write access.
  if (!pcOrigins.has(request.headers.get('origin'))) return response(request, { error: 'এন্ট্রি শুধু PC অ্যাপ থেকে করা যাবে।' }, 403);
  const { action } = await context.params;
  const limit=action==='shop-settings'?760_000:16_384;
  if (Number(request.headers.get('content-length') || 0) > limit) return response(request, { error: 'অনুরোধ অত্যধিক বড়।' }, 413);
  const chunks=[];let size=0;
  for await (const chunk of request.body||[]) {
    size+=chunk.length;
    if(size>limit) return response(request, { error: 'অনুরোধ অত্যধিক বড়।' }, 413);
    chunks.push(chunk);
  }
  const store = openStore();
  try {
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
    if (action === 'entry') return response(request, { result: store.addEntry(input) });
    if (action === 'product') return response(request, { products: store.addProduct(input) });
    if (action === 'customer') return response(request, { customer: store.saveCustomer(input) });
    if (action === 'customer-archive') return response(request, { customer: store.archiveCustomer(input) });
    if (action === 'shop-settings') return response(request, { shop: store.saveShop(input) });
    if (action === 'mobile-config') return response(request, { mobile: setMobileConfiguration(store.db,input.enabled) });
    if (action === 'snapshot') return response(request, { data: store.snapshot(), status: store.status() });
    if (action === 'backup') return response(request, { backup: await store.backupDatabase(), status: store.status() });
    return response(request, { error: 'ঠিকানা পাওয়া যায়নি।' }, 404);
  } catch (error) { return response(request, { error: error.message || 'হিসাব সেভ হয়নি।' }, 400); }
  finally { store.close(); }
}
