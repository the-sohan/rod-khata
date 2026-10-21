import { DatabaseSync, backup } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {isHostedDemo} from './demo-mode.mjs';
import { fileURLToPath } from 'node:url';
import { reportRange } from './report-dates.mjs';
import { readSalesReport } from './reports.mjs';
import { readDriveStatus } from './google-drive-state.mjs';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultDataDir = isHostedDemo()
  ? process.env.ROD_SHOP_DEMO_DATA_DIR || path.join(os.tmpdir(), `rod-khata-demo-${process.pid}`)
  : process.env.ROD_SHOP_DATA_DIR || path.join(projectRoot, 'data');
export function dayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Dhaka', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  return ['year','month','day'].map(key => parts.find(part => part.type===key).value).join('-');
}
function text(value,label,required=true,max=160) {
  const result=String(value??'').trim().normalize('NFC');
  if ((required&&!result)||result.length>max) throw new Error(`${label} সঠিকভাবে লিখুন।`);
  return result;
}
const digits = value => String(value??'').trim().replace(/[০-৯]/g,digit=>'০১২৩৪৫৬৭৮৯'.indexOf(digit));
export function decimal(value,places,label,allowZero=false) {
  const normalized=digits(value);
  const pattern=places===0?/^\d+$/:new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`);
  if (!pattern.test(normalized)) throw new Error(places===0?`${label} পূর্ণ সংখ্যা লিখুন।`:`${label} সঠিক সংখ্যা লিখুন (সর্বোচ্চ ${places} ঘর দশমিক)।`);
  const [whole,fraction='']=normalized.split('.');
  const amount=Number(whole)*10**places+(places?Number(fraction.padEnd(places,'0')):0);
  if(!Number.isSafeInteger(amount)||amount>10_000_000_000||amount<(allowZero?0:1)) throw new Error(`${label} অনুমোদিত সীমার মধ্যে লিখুন।`);
  return amount;
}
function quantity(value,unit,label,allowZero=false) {
  const result=unit==='pcs'?decimal(value,0,label,allowZero)*1000:decimal(value,3,label,allowZero);
  if(result>10_000_000_000) throw new Error(`${label} অনুমোদিত সীমার মধ্যে লিখুন।`);
  return result;
}
function positiveId(value) {
  const result=Number(value);
  if(!Number.isSafeInteger(result)||result<1) throw new Error('রেকর্ডের পরিচয় সঠিক নয়।');
  return result;
}
function migrate(db) {
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version>2) throw new Error('এই ডেটাবেসের জন্য নতুন সংস্করণের অ্যাপ প্রয়োজন।');
  if(version===2) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        stock_grams INTEGER NOT NULL CHECK(stock_grams>=0),rate_poisha INTEGER NOT NULL CHECK(rate_poisha>0),created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entries(id INTEGER PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,payload_hash TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('sale','purchase','collection','supplier_payment','expense')),
        party TEXT NOT NULL DEFAULT '',product_id INTEGER REFERENCES products(id),quantity_grams INTEGER NOT NULL DEFAULT 0,
        rate_poisha INTEGER NOT NULL DEFAULT 0,amount_poisha INTEGER NOT NULL CHECK(amount_poisha>0),
        paid_poisha INTEGER NOT NULL CHECK(paid_poisha>=0 AND paid_poisha<=amount_poisha),note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,local_day TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS parties(id INTEGER PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('customer','supplier')),
        name TEXT NOT NULL COLLATE NOCASE,address TEXT NOT NULL DEFAULT '',mobile TEXT NOT NULL DEFAULT '',
        archived_at TEXT,created_at TEXT NOT NULL,UNIQUE(kind,name));
      CREATE TABLE IF NOT EXISTS entry_items(id INTEGER PRIMARY KEY,entry_id INTEGER NOT NULL REFERENCES entries(id),
        product_id INTEGER NOT NULL REFERENCES products(id),product_name TEXT NOT NULL,
        unit TEXT NOT NULL CHECK(unit IN ('kg','pcs')),quantity_scaled INTEGER NOT NULL CHECK(quantity_scaled>0),
        rate_poisha INTEGER NOT NULL CHECK(rate_poisha>0),amount_poisha INTEGER NOT NULL CHECK(amount_poisha>0));
    `);
    const addColumn=(table,name,definition)=>{
      if(!db.prepare(`PRAGMA table_info(${table})`).all().some(column=>column.name===name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    };
    addColumn('products','unit',"TEXT NOT NULL DEFAULT 'kg' CHECK(unit IN ('kg','pcs'))");
    addColumn('entries','party_id','INTEGER REFERENCES parties(id)');
    addColumn('entries','party_address',"TEXT NOT NULL DEFAULT ''");
    addColumn('entries','party_mobile',"TEXT NOT NULL DEFAULT ''");
    db.exec(`
      INSERT OR IGNORE INTO parties(kind,name,created_at)
        SELECT CASE WHEN kind IN ('sale','collection') THEN 'customer' ELSE 'supplier' END,party,MIN(created_at)
        FROM entries WHERE kind!='expense' AND party!='' GROUP BY 1,party COLLATE NOCASE;
      UPDATE entries SET party_id=(SELECT p.id FROM parties p WHERE p.name=entries.party COLLATE NOCASE
        AND p.kind=CASE WHEN entries.kind IN ('sale','collection') THEN 'customer' ELSE 'supplier' END)
        WHERE kind!='expense' AND party_id IS NULL;
      INSERT INTO entry_items(entry_id,product_id,product_name,unit,quantity_scaled,rate_poisha,amount_poisha)
        SELECT e.id,p.id,p.name,p.unit,e.quantity_grams,e.rate_poisha,e.amount_poisha
        FROM entries e JOIN products p ON p.id=e.product_id
        WHERE e.kind IN ('sale','purchase') AND NOT EXISTS(SELECT 1 FROM entry_items i WHERE i.entry_id=e.id);
      CREATE INDEX IF NOT EXISTS entries_day ON entries(local_day);
      CREATE INDEX IF NOT EXISTS entries_party_id ON entries(party_id,kind);
      CREATE INDEX IF NOT EXISTS entry_items_entry ON entry_items(entry_id);
      PRAGMA user_version=2;
    `);
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK');throw error; }
}
export function openStore(dataDir=defaultDataDir) {
  fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
  const databasePath=path.join(dataDir,'shop.sqlite');
  const db=new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  try {migrate(db);} catch(error) {db.close();throw error;}
  const defaults=db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
  defaults.run('shop_id',randomUUID());defaults.run('shop_name','আমার রডের দোকান');
  function transaction(callback) {
    db.exec('BEGIN IMMEDIATE');
    try {const result=callback();db.exec('COMMIT');return result;} catch(error) {db.exec('ROLLBACK');throw error;}
  }
  const setting=key=>db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value||'';
  const shop=()=>({id:setting('shop_id'),name:setting('shop_name'),address:setting('shop_address'),mobile:setting('shop_mobile'),logo:setting('shop_logo')});
  function saveShop(input) {
    const name=text(input.name,'দোকানের নাম'),address=text(input.address,'ঠিকানা',false,500);
    const mobile=digits(input.mobile).replace(/[\s()-]/g,'');
    if(mobile&&!/^\+?\d{7,15}$/.test(mobile)) throw new Error('মোবাইল নম্বর সঠিকভাবে লিখুন।');
    const logo=String(input.logo??'');
    if(logo) {
      const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(logo);
      if(!match||logo.length>750_000) throw new Error('লোগো PNG, JPG বা WebP হতে হবে (সর্বোচ্চ ৫০০ KB)।');
      const bytes=Buffer.from(match[2],'base64');
      const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
      if(bytes.length>500_000||bytes.length<16||!({png,jpeg,webp}[match[1]])||bytes.toString('base64')!==match[2]) throw new Error('লোগোর ফাইল সঠিক নয় অথবা ৫০০ KB-এর বেশি।');
    }
    return transaction(()=>{
      const update=db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      for(const [key,value] of Object.entries({shop_name:name,shop_address:address,shop_mobile:mobile,shop_logo:logo})) update.run(key,value);
      return shop();
    });
  }
  function products() {
    // Keep the legacy column name to preserve old databases. Values are thousandths
    // of the selected unit: grams for kg, and 1000 per whole piece for pcs.
    return db.prepare('SELECT * FROM products ORDER BY name').all().map(p=>({
      id:p.id,name:p.name,unit:p.unit,quantity:p.stock_grams/1000,
      quantityKg:p.unit==='kg'?p.stock_grams/1000:null,rate:p.rate_poisha/100,
    }));
  }
  function balance(partyId,supplier=false) {
    return db.prepare(`SELECT COALESCE(SUM(CASE WHEN kind=? THEN amount_poisha-paid_poisha
      WHEN kind=? THEN -amount_poisha ELSE 0 END),0) AS amount FROM entries WHERE party_id=?`)
      .get(supplier?'purchase':'sale',supplier?'supplier_payment':'collection',partyId).amount;
  }
  function partyBalances(supplier=false) {
    const principal=supplier?'purchase':'sale',repayment=supplier?'supplier_payment':'collection';
    return db.prepare(`SELECT p.id,p.name,p.address,p.mobile,SUM(CASE WHEN e.kind=? THEN e.amount_poisha-e.paid_poisha
      WHEN e.kind=? THEN -e.amount_poisha ELSE 0 END) AS due FROM entries e JOIN parties p ON p.id=e.party_id
      WHERE e.kind IN (?,?) GROUP BY p.id HAVING due>0 ORDER BY due DESC`)
      .all(principal,repayment,principal,repayment).map(row=>({...row,due:row.due/100}));
  }
  function customers(includeArchived=false) {
    return db.prepare(`SELECT p.*,COALESCE(SUM(CASE WHEN e.kind='sale' THEN e.amount_poisha-e.paid_poisha
      WHEN e.kind='collection' THEN -e.amount_poisha ELSE 0 END),0) AS due
      FROM parties p LEFT JOIN entries e ON e.party_id=p.id WHERE p.kind='customer'
      ${includeArchived?'':'AND p.archived_at IS NULL'} GROUP BY p.id ORDER BY p.name`)
      .all().map(p=>({id:p.id,name:p.name,address:p.address,mobile:p.mobile,due:p.due/100,archived:!!p.archived_at}));
  }
  function saveCustomer(input) {
    const name=text(input.name,'ক্রেতার নাম'),address=text(input.address,'ঠিকানা',false,500);
    const mobile=digits(input.mobile).replace(/[\s()-]/g,'');
    if(mobile&&!/^\+?\d{7,15}$/.test(mobile)) throw new Error('মোবাইল নম্বর সঠিকভাবে লিখুন।');
    return transaction(()=>{
      let id;
      try {
        if(input.id) {
          id=positiveId(input.id);
          if(!db.prepare("SELECT id FROM parties WHERE id=? AND kind='customer' AND archived_at IS NULL").get(id)) throw new Error('সক্রিয় ক্রেতা পাওয়া যায়নি।');
          db.prepare('UPDATE parties SET name=?,address=?,mobile=? WHERE id=?').run(name,address,mobile,id);
        } else {
          id=Number(db.prepare("INSERT INTO parties(kind,name,address,mobile,created_at) VALUES ('customer',?,?,?,?)")
            .run(name,address,mobile,new Date().toISOString()).lastInsertRowid);
        }
      } catch(error) {
        if(String(error.message).includes('UNIQUE')) throw new Error('এই নামে ক্রেতা আগে থেকেই আছে। মুছে রাখা তালিকাও দেখুন।');
        throw error;
      }
      return customers(true).find(p=>p.id===id);
    });
  }
  function archiveCustomer(input) {
    return transaction(()=>{
      const id=positiveId(input.id);
      const customer=db.prepare("SELECT * FROM parties WHERE id=? AND kind='customer'").get(id);
      if(!customer) throw new Error('ক্রেতা পাওয়া যায়নি।');
      if(!input.restore&&balance(id)>0) throw new Error('এই ক্রেতার বাকি আছে। আগে বাকি আদায় করুন; হিসাব থাকা অবস্থায় মুছবেন না।');
      db.prepare('UPDATE parties SET archived_at=? WHERE id=?').run(input.restore?null:new Date().toISOString(),id);
      return {id,archived:!input.restore};
    });
  }
  function resolveParty(input,kind) {
    const wanted=['sale','collection'].includes(kind)?'customer':'supplier';
    const id=input.customerId||input.partyId;
    let record;
    if(id) record=db.prepare('SELECT * FROM parties WHERE id=? AND kind=?').get(positiveId(id),wanted);
    else {
      const name=text(input.party,'নাম');
      db.prepare('INSERT OR IGNORE INTO parties(kind,name,created_at) VALUES (?,?,?)').run(wanted,name,new Date().toISOString());
      record=db.prepare('SELECT * FROM parties WHERE kind=? AND name=? COLLATE NOCASE').get(wanted,name);
    }
    if(!record) throw new Error('ক্রেতা বা সাপ্লায়ার পাওয়া যায়নি।');
    if(record.archived_at) throw new Error('এই ক্রেতাকে মুছে রাখা তালিকা থেকে পুনরায় সক্রিয় করুন।');
    return record;
  }
  function addProduct(input) {
    const name=text(input.name,'পণ্যের নাম'),unit=input.unit||'kg';
    if(!['kg','pcs'].includes(unit)) throw new Error('একক কেজি বা পিস বেছে নিন।');
    const stock=quantity(input.openingQuantity||'0',unit,'শুরুর স্টক',true);
    const rate=decimal(input.rate,2,'দর');
    try {db.prepare('INSERT INTO products(name,unit,stock_grams,rate_poisha,created_at) VALUES (?,?,?,?,?)').run(name,unit,stock,rate,new Date().toISOString());}
    catch(error) {if(String(error.message).includes('UNIQUE')) throw new Error('এই নামে পণ্য আগে থেকেই আছে।');throw error;}
    return products();
  }
  function addEntry(input) {
    const kind=input.kind,isTrade=['sale','purchase'].includes(kind);
    if(!['sale','purchase','collection','supplier_payment','expense'].includes(kind)) throw new Error('এন্ট্রির ধরন সঠিক নয়।');
    const requestKey=String(input.requestKey||'');
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(requestKey)) throw new Error('এন্ট্রির পরিচয় পাওয়া যায়নি। আবার চেষ্টা করুন।');
    const rawItems=isTrade?(Array.isArray(input.items)?input.items:[{productId:input.productId,quantity:input.quantity,rate:input.rate}]):[];
    if(isTrade&&(rawItems.length===0||rawItems.length>50)) throw new Error('বিলে ১ থেকে ৫০টি পণ্যের সারি দিন।');
    const payload={kind,partyId:String(input.customerId||input.partyId||''),party:String(input.party||'').trim(),
      items:rawItems.map(item=>({productId:String(item.productId??''),quantity:String(item.quantity??''),rate:String(item.rate??'')})),
      paid:String(input.paid??'0'),amount:String(input.amount??''),note:text(input.note,'বিবরণ',false)};
    const payloadHash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return transaction(()=>{
      const previous=db.prepare('SELECT id,payload_hash FROM entries WHERE request_key=?').get(requestKey);
      if(previous) {
        if(previous.payload_hash!==payloadHash) throw new Error('একই এন্ট্রির পরিচয়ে ভিন্ন হিসাব পাঠানো হয়েছে।');
        return {id:previous.id,duplicate:true};
      }
      const party=kind==='expense'?null:resolveParty(input,kind);
      let amount=0,paid=0;
      const items=[],stockChanges=new Map();
      if(isTrade) {
        for(const [index,item] of rawItems.entries()) {
          const productId=positiveId(item.productId);
          const product=db.prepare('SELECT * FROM products WHERE id=?').get(productId);
          if(!product) throw new Error(`${index+1} নম্বর সারির পণ্য পাওয়া যায়নি।`);
          const scaled=quantity(item.quantity,product.unit,`${product.name}-এর পরিমাণ`);
          const rate=decimal(item.rate,2,'দর');
          if(!Number.isSafeInteger(scaled*rate)) throw new Error('এই এন্ট্রির পরিমাণ অত্যধিক বড়।');
          const lineAmount=Math.round(scaled*rate/1000);
          if(lineAmount<1) throw new Error('প্রতি পণ্যের মোট অন্তত এক পয়সা হতে হবে।');
          amount+=lineAmount;
          items.push({product,quantity:scaled,rate,amount:lineAmount});
          stockChanges.set(productId,(stockChanges.get(productId)||0)+scaled);
        }
        if(!Number.isSafeInteger(amount)||amount>10_000_000_000) throw new Error('মোট টাকার পরিমাণ অনুমোদিত সীমার বাইরে।');
        paid=decimal(input.paid||'0',2,'জমা টাকা',true);
        if(paid>amount) throw new Error('জমা টাকা মোট টাকার বেশি হতে পারে না।');
        for(const [id,scaled] of stockChanges) {
          const product=db.prepare('SELECT * FROM products WHERE id=?').get(id);
          if(kind==='sale'&&product.stock_grams<scaled) throw new Error(`${product.name}-এর পর্যাপ্ত স্টক নেই।`);
          if(kind==='purchase'&&product.stock_grams+scaled>10_000_000_000) throw new Error('স্টকের সীমা অতিক্রম করছে।');
          db.prepare('UPDATE products SET stock_grams=stock_grams+? WHERE id=?').run(kind==='sale'?-scaled:scaled,id);
        }
      } else {
        amount=decimal(input.amount,2,'টাকার পরিমাণ');paid=amount;
        if(kind!=='expense'&&balance(party.id,kind==='supplier_payment')<amount) throw new Error('পরিশোধের টাকা বিদ্যমান বাকি বা দেনার বেশি হতে পারে না।');
      }
      const now=new Date(),first=items.length===1?items[0]:null;
      const result=db.prepare(`INSERT INTO entries(request_key,payload_hash,kind,party,party_id,party_address,party_mobile,
        product_id,quantity_grams,rate_poisha,amount_poisha,paid_poisha,note,created_at,local_day)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(requestKey,payloadHash,kind,party?.name||'',party?.id||null,
          party?.address||'',party?.mobile||'',first?.product.id||null,first?.quantity||0,first?.rate||0,
          amount,paid,payload.note,now.toISOString(),dayKey(now));
      const id=Number(result.lastInsertRowid);
      const insert=db.prepare('INSERT INTO entry_items(entry_id,product_id,product_name,unit,quantity_scaled,rate_poisha,amount_poisha) VALUES (?,?,?,?,?,?,?)');
      for(const item of items) insert.run(id,item.product.id,item.product.name,item.product.unit,item.quantity,item.rate,item.amount);
      return {id,duplicate:false};
    });
  }
  function receipt(value) {
    const row=db.prepare('SELECT * FROM entries WHERE id=?').get(positiveId(value));
    if(!row) return null;
    const items=db.prepare('SELECT * FROM entry_items WHERE entry_id=? ORDER BY id').all(row.id).map(item=>({
      productId:item.product_id,name:item.product_name,unit:item.unit,quantity:item.quantity_scaled/1000,
      rate:item.rate_poisha/100,amount:item.amount_poisha/100,
    }));
    return {id:row.id,number:`RK-${String(row.id).padStart(5,'0')}`,kind:row.kind,
      party:row.party,partyId:row.party_id,address:row.party_address,mobile:row.party_mobile,
      items,product:items.length===1?items[0].name:items.length?`${items.length}টি পণ্য`:null,
      quantityKg:items.length===1&&items[0].unit==='kg'?items[0].quantity:0,
      amount:row.amount_poisha/100,paid:row.paid_poisha/100,due:(row.amount_poisha-row.paid_poisha)/100,
      note:row.note,createdAt:row.created_at,shop:shop()};
  }
  function dashboard(date=new Date(),withReports=false) {
    db.exec('BEGIN');
    try {
      const day=dayKey(date);
      const sums=db.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='sale' THEN amount_poisha ELSE 0 END),0) AS sales,
        COALESCE(SUM(CASE WHEN kind IN ('sale','collection') THEN paid_poisha ELSE 0 END),0) AS received,
        COALESCE(SUM(CASE WHEN kind='expense' THEN amount_poisha ELSE 0 END),0) AS expenses,
        COALESCE(SUM(CASE WHEN kind IN ('purchase','supplier_payment') THEN paid_poisha ELSE 0 END),0) AS supplierPaid,
        COUNT(CASE WHEN kind='sale' THEN 1 END) AS saleCount FROM entries WHERE local_day=?`).get(day);
      const owed=partyBalances(),suppliers=partyBalances(true);
      const result={schemaVersion:2,shop:shop(),day,generatedAt:date.toISOString(),readonly:true,
        totals:{sales:sums.sales/100,received:sums.received/100,expenses:sums.expenses/100,supplierPaid:sums.supplierPaid/100,saleCount:sums.saleCount,
          customerDue:owed.reduce((sum,p)=>sum+Math.round(p.due*100),0)/100,supplierDue:suppliers.reduce((sum,p)=>sum+Math.round(p.due*100),0)/100},
        products:products(),customers:owed,suppliers,customerRecords:customers(true),
        recent:db.prepare('SELECT id FROM entries ORDER BY id DESC LIMIT 20').all().map(row=>{const {shop:unused,...entry}=receipt(row.id);return entry;})};
      if(withReports) result.reportData={version:1,
        entries:db.prepare('SELECT id,local_day AS day,kind,party_id AS partyId,amount_poisha AS amountPoisha,paid_poisha AS paidPoisha FROM entries ORDER BY id').all(),
        items:db.prepare('SELECT entry_id AS entryId,product_id AS productId,unit,quantity_scaled AS quantityScaled,amount_poisha AS amountPoisha FROM entry_items ORDER BY id').all(),
        products:result.products.map(({id,name})=>({id,name})),customers:result.customerRecords.map(({id,name,mobile,archived})=>({id,name,mobile,archived})),
      };
      db.exec('COMMIT');return result;
    } catch(error) {db.exec('ROLLBACK');throw error;}
  }
  function customerHistory(input={}) {
    const id=positiveId(input.id),page=positiveId(input.page||1),pageSize=25;
    const query=text(input.q,'খোঁজার শব্দ',false,160).toLowerCase();
    const kind=input.kind||'all',sort=input.sort||'newest';
    if(!['all','sale','collection'].includes(kind)||!['newest','oldest'].includes(sort)) throw new Error('ইতিহাসের ফিল্টার সঠিক নয়।');
    db.exec('BEGIN');
    try {
      const customer=customers(true).find(row=>row.id===id);
      if(!customer) throw new Error('ক্রেতা পাওয়া যায়নি।');
      const summary=db.prepare(`SELECT COUNT(CASE WHEN kind='sale' THEN 1 END) AS billCount,
        COUNT(CASE WHEN kind='collection' THEN 1 END) AS collectionCount,
        COALESCE(SUM(CASE WHEN kind='sale' THEN amount_poisha ELSE 0 END),0) AS sales,
        COALESCE(SUM(paid_poisha),0) AS received FROM entries WHERE party_id=? AND kind IN ('sale','collection')`).get(id);
      const where=`e.party_id=? AND e.kind IN ('sale','collection') AND (?='all' OR e.kind=?)
        AND (?='' OR instr(lower('RK-'||printf('%05d',e.id)||' '||e.party||' '||e.note||' '||e.local_day),?)>0
        OR EXISTS(SELECT 1 FROM entry_items i WHERE i.entry_id=e.id AND instr(lower(i.product_name),?)>0))`;
      const args=[id,kind,kind,query,query,query];
      const total=db.prepare(`SELECT COUNT(*) AS n FROM entries e WHERE ${where}`).get(...args).n;
      const pages=Math.max(1,Math.ceil(total/pageSize)),current=Math.min(page,pages);
      const rows=db.prepare(`SELECT e.id FROM entries e WHERE ${where} ORDER BY e.id ${sort==='oldest'?'ASC':'DESC'} LIMIT ? OFFSET ?`).all(...args,pageSize,(current-1)*pageSize);
      const entries=rows.map(row=>{const {shop:unused,...entry}=receipt(row.id);return entry;});
      db.exec('COMMIT');
      return {customer,summary:{...summary,sales:summary.sales/100,received:summary.received/100,balance:customer.due},entries,total,page:current,pageSize,pages};
    } catch(error) {db.exec('ROLLBACK');throw error;}
  }
  function snapshot(date=new Date()) {
    const result=dashboard(date,true),destination=path.join(dataDir,'owner-snapshot.json'),temporary=`${destination}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary,JSON.stringify(result,null,2),{mode:0o600});fs.renameSync(temporary,destination);return result;
  }
  function readSnapshot() {
    const destination=path.join(dataDir,'owner-snapshot.json');
    return fs.existsSync(destination)?JSON.parse(fs.readFileSync(destination,'utf8')):null;
  }
  async function backupDatabase() {
    const folder=path.join(dataDir,'backups');fs.mkdirSync(folder,{recursive:true,mode:0o700});
    const filename=`shop-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}.sqlite`,destination=path.join(folder,filename);
    await backup(db,destination);
    const check=new DatabaseSync(destination,{readOnly:true});
    try {if(Object.values(check.prepare('PRAGMA quick_check').get())[0]!=='ok') throw new Error('ব্যাকআপ যাচাই সফল হয়নি।');} finally {check.close();}
    fs.chmodSync(destination,0o600);
    const checksum=createHash('sha256').update(fs.readFileSync(destination)).digest('hex');
    fs.writeFileSync(`${destination}.json`,JSON.stringify({schemaVersion:2,createdAt:new Date().toISOString(),filename,sha256:checksum},null,2),{mode:0o600});
    return {filename,createdAt:new Date().toISOString(),verified:true};
  }
  function status() {
    const current=readSnapshot(),folder=path.join(dataDir,'backups');
    const files=fs.existsSync(folder)?fs.readdirSync(folder).filter(file=>file.endsWith('.sqlite')).sort():[],latest=files.at(-1);
    const drive=readDriveStatus(dataDir);
    return {mode:isHostedDemo()?'online-demo':'local-preview',demo:isHostedDemo(),driveConnected:drive.connected,cloudUploadedAt:drive.snapshotAt,driveBackupAt:drive.backupAt,driveError:drive.error,snapshotAt:current?.generatedAt||null,
      backupAt:latest?fs.statSync(path.join(folder,latest)).mtime.toISOString():null,snapshotIntervalMinutes:30,backupIntervalMinutes:60};
  }
  const salesReport=(input={})=>readSalesReport(db,reportRange(input,dayKey()));
  return {db,databasePath,shop,saveShop,products,addProduct,customers,saveCustomer,archiveCustomer,addEntry,receipt,customerHistory,salesReport,dashboard,snapshot,readSnapshot,backupDatabase,status,close:()=>db.close()};
}
