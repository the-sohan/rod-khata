# Render Free-তে দোকানদারকে দেখানোর ডেমো

এই branch (`demo/render-free`) শুধু নমুনা ডেমো host করার জন্য। আসল দোকানের হিসাব চালাবেন না।

## ১. Account তৈরি

1. https://dashboard.render.com/register খুলুন।
2. **GitHub** দিয়ে `the-sohan` account ব্যবহার করে Sign up / Sign in করুন। Password, OTP এবং Terms গ্রহণের ধাপ নিজের browser-এ সম্পন্ন করুন।
3. GitHub repository permission চাইলে **Only select repositories** বেছে শুধু `the-sohan/rod-khata` দিন। অন্য repository-র access প্রয়োজন নেই।

## ২. Web Service তৈরি

1. Render Dashboard → **New → Web Service**।
2. **Git Provider** থেকে `the-sohan/rod-khata` বেছে নিন। Repository না দেখালে GitHub সংযোগের repository selection ঠিক করুন। Source repository private হলেও GitHub সংযোগ দিয়ে deploy করা যায়; live demo-র URL সবাই খুলতে পারবেন।
3. নিচের মানগুলো দিন:

| Setting | Value |
|---|---|
| Name | `rod-khata-demo` (নাম আগে নেওয়া থাকলে অন্য নাম) |
| Branch | `demo/render-free` |
| Language / Runtime | `Node` |
| Root Directory | খালি রাখুন |
| Build Command | `npm ci && npm run build:demo` |
| Start Command | `npm run start:demo` |
| Instance Type | **Free — $0** |
| Health Check Path | `/api/health` |

Environment variables:

```text
NODE_VERSION=24
ROD_SHOP_DEMO=1
NEXT_TELEMETRY_DISABLED=1
```

Render নিজে `PORT` ও `RENDER_EXTERNAL_URL` দেয়। `ROD_SHOP_DATA_DIR`, Google OAuth JSON, token, signing key বা নিজের database upload করবেন না। Custom domain ব্যবহার করতে হলে অনুমোদিত demo origin আলাদাভাবে মানিয়ে নিতে হবে; প্রথম পরীক্ষায় Render-এর নিজস্ব URL ব্যবহার করুন।

4. **Deploy Web Service** চাপুন। এই setup-এ paid disk, database বা worker নেই। Paid plan বা payment নিতে বললে এগোবেন না; Free বাছা আছে কি না দেখুন।
5. Build এবং deploy সফল হলে Render যে `https://...onrender.com` URL দেবে সেটিই demo link। প্রকৃত URL না পাওয়া পর্যন্ত কোনো উদাহরণ URL-কে live ধরে নেবেন না।

বিকল্প: repository-র `render.yaml` দিয়ে Blueprint তৈরি করা যায়; এটি একই Free service configuration। প্রথমবার manual Web Service সহজ।

## ৩. কী দেখাবেন

- ৩০ জন কাল্পনিক বাংলাদেশি ক্রেতা, বর্তমান মাসসহ গত তিন মাসে ৪৫টি করে মোট ১৩৫টি নমুনা বিক্রি।
- নতুন বিক্রি → এক বিলে একাধিক পণ্য → কেজি/পিস → stock ও বাকি → রসিদ প্রিন্ট।
- ক্রেতার ইতিহাস এবং দৈনিক/সাপ্তাহিক/মাসিক/বার্ষিক/custom রিপোর্ট।
- **মালিকের প্রিভিউ** খুলে ফোনের উপযোগী dashboard ও একই রিপোর্ট। Demo-তে নতুন entry দিলে এই dashboard-এ Refresh চাপলে সঙ্গে সঙ্গে দেখা যাবে; খোলা থাকলে ৩০ সেকেন্ড পরপর পড়ে।

## ৪. ডেমোর ডেটার নিয়ম

- সব visitor একই নমুনা দোকান ব্যবহার করবেন। কারও আসল নাম, ফোন, দোকানের হিসাব বা credential দেবেন না।
- প্রতিবার server চালুর সময় নতুন temporary database এবং নমুনা data তৈরি হয়। Restart/redeploy/sleep থেকে নতুন instance এলে আগের পরীক্ষার পরিবর্তন মুছে যাবে। প্রতিটি browser refresh-এ reset হয় না।
- Google Drive, PC pairing, database backup ও OAuth setup ডেমোতে বন্ধ।
- পরীক্ষার সীমা: মোট ১,০০০ entry, ১০০ product, ১০০ customer/supplier record।
- Render Free ১৫ মিনিট idle থাকলে sleep করে; প্রথমবার link খুললে আবার চালু হতে প্রায় এক মিনিট লাগতে পারে। Demo দেখানোর কিছুক্ষণ আগে link খুলে নিন। Free quota শেষ হলে service সাময়িক বন্ধ হতে পারে।
- নিজের PC বন্ধ থাকলেও Render demo চলবে; এটি PC-এর real database-এর সঙ্গে যুক্ত নয়।

## Local preview

```sh
npm ci
npm run build:demo
ROD_SHOP_DEMO=1 npm run start:demo
```

খুলুন `http://localhost:3100`। Windows PowerShell-এ শেষ command-এর বদলে:

```powershell
$env:ROD_SHOP_DEMO='1'
npm run start:demo
```

এটি normal PC app-এর port 3000 এবং real `data/` ব্যবহার করে না। Demo build আলাদা `.next-demo` folder-এ থাকে। Android APK আবার build করার দরকার নেই।

Official references: https://render.com/docs/deploy-nextjs-app এবং https://render.com/docs/free
