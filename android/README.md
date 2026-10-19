# রডখাতা মালিক — Android

এটি Next.js owner dashboard-এর bundled Android WebView app। Android 8 বা নতুন লাগে। APK-তে সার্ভার, লগইন credential বা আসল দোকানের ডেটা রাখা হয় না। অ্যাপের ডেমোতে কেবল ৩০ জন বানানো ক্রেতা ও ১৩৫টি নমুনা বিল আছে।

## Google Drive দিয়ে বাইরে থেকে হিসাব

ধাপে ধাপে Cloud setup, Android package ও public signing SHA-1 আছে [GOOGLE-DRIVE-SETUP.txt](GOOGLE-DRIVE-SETUP.txt)-এ। PC এবং Android client একই Cloud project-এ তৈরি করুন। PC-এর প্রথম সফল আপলোডের পর পাওয়া `RD1.` কোড APK-এর **দোকানের সংযোগ → Google Drive সংযোগ**-এ দিন। Google-এর নিজস্ব authorization screen-এ মালিকের Gmail দিয়ে অনুমতি দিন। WebView-তে Google login দেখানো হয় না এবং token JavaScript-এ পাঠানো হয় না।

APK Google Identity Services `AuthorizationClient` দিয়ে স্বল্পমেয়াদি token নেয়; ফোনে refresh token রাখা হয় না। শুধু নির্বাচিত দোকানের নির্দিষ্ট file ID দিয়ে HTTPS GET করে; Drive-এ লেখা বা ফাইল মুছার native endpoint নেই। Scope `drive.file`-এর অনুমতি অ্যাপের ব্যবহৃত ফাইলগুলোর জন্য। সংযোগের public code একা অনুমতি দেয় না। ভুল দোকানের বা অসম্পূর্ণ রিপোর্ট cache প্রতিস্থাপনের আগে প্রত্যাখ্যান করে।

অ্যাপ খুললে/সামনে এলে এবং সামনে খোলা থাকলে ৩০ মিনিট পরপর Drive পরীক্ষা হয়। **এখন আপডেট** তাৎক্ষণিকভাবে Drive-এর সর্বশেষ আপলোড পড়ে; PC-কে দূর থেকে আপলোডের নির্দেশ দেয় না। ফোন offline হলে আগের cache থাকে। অ্যাপ বন্ধ অবস্থায় নির্দিষ্ট সময়ের background scheduling নেই। Google Play services প্রয়োজন। Testing OAuth grant ৭ দিনে শেষ হতে পারে; নিয়মিত ব্যবহারের আগে Google-এর publishing/verification শর্ত পূরণ করতে হবে।

## ফোনে প্রথম পরীক্ষা

1. APK ডাউনলোড করে Android-এ ইনস্টল করুন। প্রথমবার ফোন নিজের নিয়ম অনুযায়ী installer-এর অনুমতি চাইতে পারে।
2. অ্যাপ খুলে **তিন মাসের ডেমো দেখুন → রিপোর্ট → ফিল্টার** চাপুন। দিন/সপ্তাহ/মাস/বছর বা নিজের তারিখ বেছে রিপোর্ট দেখুন।
3. নিজের দোকানের জন্য PC-তে **ব্যাকআপ ও আপডেট → মোবাইলের Wi-Fi সংযোগ চালু করুন**। PC এবং ফোন একই বিশ্বস্ত Wi-Fi-তে রাখুন।
4. PC-র দেওয়া download link ফোনের Chrome-এ খুলেও APK নেওয়া যায়।
5. অ্যাপের **দোকানের সংযোগ → PC-র সঙ্গে যুক্ত করুন** অংশে PC-র কোড পেস্ট করুন। অথবা `.rodshop` সংযোগ ফাইল ফোনে নিয়ে বেছে নিন। সংযোগ ফাইলে ব্যক্তিগত access token থাকে; অন্যকে দেবেন না।
6. বিকল্পভাবে PC থেকে **মোবাইলের হিসাবের ফাইল নিন** দিয়ে JSON ফোনে এনে **হিসাবের ফাইল খুলুন** ব্যবহার করুন। এভাবে খোলা ফাইল নিজে আপডেট হবে না।

Wi-Fi সংযোগে ফোন ৩০ সেকেন্ড পরপর PC-র সর্বশেষ snapshot চেক করে, যতক্ষণ অ্যাপ সামনে খোলা। PC-র worker প্রতি ৩০ মিনিটে নতুন snapshot তৈরি করে। PC থেকে হাতে **প্রিভিউ এখন আপডেট করুন** চাপলেও নতুন হিসাব আসবে। ফোনে PC-র সর্বশেষ সফল হিসাব app-private storage-এ থাকে; PC বন্ধ থাকলে সেটি পুরোনো বলে দেখাবে। মোবাইল রিপোর্ট সেই snapshot-এর সব দিন ও বিল থেকে তৈরি হয় এবং PC রিপোর্টের সঙ্গে automated test-এ তুলনা করা হয়।

## সংযোগের সীমা

- PC entry server এখনও `127.0.0.1:3000`-এ। মোবাইলের জন্য আলাদা read-only service `3002` port-এ শুধু সংযোগ চালু থাকলে listen করে। বন্ধ অবস্থায় LAN port খোলা থাকে না।
- Wi-Fi সংযোগ HTTP এবং ব্যক্তিগত token ব্যবহার করে; নিজের বিশ্বস্ত নেটওয়ার্কে পরীক্ষার জন্য। বাইরে থেকে দেখতে Google Drive সংযোগ ব্যবহার করুন; Wi-Fi service ইন্টারনেটে port forward করবেন না।
- APK থেকে লেখা বা entry পরিবর্তনের endpoint নেই। কোড বন্ধ/পুনরায় চালু করলে পুরোনো token বাতিল হয়।
- Android app backup বন্ধ; সংযোগের token ও cached হিসাব APK-তে থাকে না। Android-এর নিজের app-private storage-এ সেভ হয়। অ্যাপ uninstall করলে ফোনের cache মুছে যায়, PC-র হিসাব থাকে।
- Browser responsive preview, data reconciliation, APK signatures/manifest/ZIP alignment যাচাই করা হয়েছে। বাস্তব Android ফোনে installation/runtime পরীক্ষা ব্যবহারকারীকে করতে হবে।

## Mac-এ আবার build

এই প্রকল্পের pinned build tools Apple silicon Mac-এর জন্য। Android Studio/Capacitor runtime প্রয়োজন হয় না। Java wrapper Android-এর WebView ও Google Identity Services ব্যবহার করে।

```sh
npm run android:prepare
npm run build
npm run build:android
```

`android/build-tools.lock.json`-এ tool versions এবং `android/google-auth.lock.json`-এ Google auth 22.0.0 ও তার AndroidX/Kotlin dependency-র vendor/Maven URLs ও SHA-256 আছে। Toolchain শুধু `work/android-toolchain`-এ থাকে; host Java/profile বদলায় না। [Google-এর AAPT2 নির্দেশনা](https://developer.android.com/tools/aapt2), Google Maven-এর R8/apksig, [Robolectric-এর Android framework jar](https://robolectric.org/architecture/) এবং Adoptium OpenJDK ব্যবহার করা হয়েছে। Framework jar compile/link-এর জন্য; এটি APK-তে যায় না। Dependency resources, R classes ও service loader resources APK-তে রাখা হয়; code D8 দিয়ে dex হয়।

Signing key এবং password **data/android-signing**-এ ব্যক্তিগতভাবে থাকে। ভবিষ্যতের app update-ও একই key দিয়ে sign করতে হবে। ফোল্ডারটি নিরাপদে আলাদা backup করুন; সাধারণ SQLite backup signing key রাখে না। কোনো source ZIP বা Git-এ key দেবেন না।

Build-এর ফল `releases/rod-khata-owner-v0.6.0.apk`; PC download-এর জন্য `apps/pc/public/downloads/rod-khata-owner.apk`-তেও কপি হয়। Java compile, D8, AAPT2, APK signing ও signature/ZIP validation শেষ না হলে build সফল দেখাবে না। PC-এর live Google upload/download যাচাই করা হয়েছে; বাস্তব Android login/runtime নিজের Cloud credentials ও ফোন দিয়ে পরীক্ষা করতে হবে।
