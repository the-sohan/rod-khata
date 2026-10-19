package com.rodshop.owner;

import android.app.Activity;
import android.accounts.Account;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicBoolean;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.ClearTokenRequest;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import org.json.JSONObject;

public final class MainActivity extends Activity {
  private static final String ORIGIN="https://appassets.androidplatform.net/";
  private static final int CHOOSE_FILE=701;
  private static final int AUTHORIZE_DRIVE=702;
  private static final String DRIVE_SCOPE="https://www.googleapis.com/auth/drive.file";
  private WebView web;
  private ValueCallback<Uri[]> chooser;
  private OwnerBridge bridge;
  private final AtomicBoolean driveBusy=new AtomicBoolean(false);
  private String pendingDriveCode;
  private DriveConfig pendingDriveConfig;
  private boolean pendingDriveInteractive;
  private volatile boolean destroyed;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.rgb(251,253,247));
    getWindow().setNavigationBarColor(Color.rgb(251,253,247));
    getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    web=new WebView(this);web.setBackgroundColor(Color.rgb(251,253,247));
    FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(251,253,247));root.addView(web,new FrameLayout.LayoutParams(-1,-1));
    if(Build.VERSION.SDK_INT>=30) {
      getWindow().setDecorFitsSystemWindows(false);
      root.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});
    }
    setContentView(root);
    WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    bridge=new OwnerBridge();web.addJavascriptInterface(bridge,"RodShopAndroid");
    web.setWebViewClient(new WebViewClient(){
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !request.getUrl().toString().startsWith(ORIGIN);}
      @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
        Uri uri=request.getUrl();
        if(!"https".equals(uri.getScheme())||!"appassets.androidplatform.net".equals(uri.getHost())) return denied();
        String name=uri.getPath();if(name==null||name.equals("/"))name="/index.html";
        if(name.contains("..")||name.contains("\\"))return denied();
        try {return new WebResourceResponse(mime(name),"UTF-8",getAssets().open("owner"+name));}
        catch(Exception error){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
      }
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
        if(chooser!=null)chooser.onReceiveValue(null);chooser=callback;
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");
        try{startActivityForResult(intent,CHOOSE_FILE);return true;}catch(Exception error){chooser=null;return false;}
      }
    });
    web.loadUrl(ORIGIN);
  }
  private static WebResourceResponse denied(){return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
  private static String mime(String name){
    if(name.endsWith(".html"))return "text/html";if(name.endsWith(".js"))return "application/javascript";
    if(name.endsWith(".css"))return "text/css";if(name.endsWith(".json"))return "application/json";
    if(name.endsWith(".svg"))return "image/svg+xml";if(name.endsWith(".png"))return "image/png";
    if(name.endsWith(".woff2"))return "font/woff2";if(name.endsWith(".ico"))return "image/x-icon";return "text/plain";
  }
  @Override protected void onActivityResult(int request,int result,Intent intent){
    super.onActivityResult(request,result,intent);
    if(request==CHOOSE_FILE&&chooser!=null){chooser.onReceiveValue(result==RESULT_OK&&intent!=null&&intent.getData()!=null?new Uri[]{intent.getData()}:null);chooser=null;}
    if(request==AUTHORIZE_DRIVE&&driveBusy.get()) {
      try{if(result!=RESULT_OK||intent==null)throw new Exception("Google-এর অনুমতি দেওয়া হয়নি।");finishAuthorization(Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(intent));}
      catch(Exception error){driveFailure("Google সংযোগ সম্পন্ন হয়নি। অনুমতি দিয়ে আবার চেষ্টা করুন।");}
    }
  }
  @Override public void onBackPressed(){web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true}return false})()",value->{if(!"true".equals(value)){if(web.canGoBack())web.goBack();else finish();}});}
  @Override protected void onDestroy(){destroyed=true;if(chooser!=null)chooser.onReceiveValue(null);if(web!=null){web.removeJavascriptInterface("RodShopAndroid");web.destroy();}super.onDestroy();}

  private void driveResult(JSONObject result) {
    driveBusy.set(false);pendingDriveConfig=null;pendingDriveCode=null;
    runOnUiThread(()->{if(!destroyed)web.evaluateJavascript("window.dispatchEvent(new CustomEvent('rodshop-drive-result',{detail:"+result.toString()+"}))",null);});
  }
  private void driveFailure(String message) {
    if(message==null||message.trim().isEmpty())message="Drive-এর হিসাব পড়া যায়নি। আবার চেষ্টা করুন।";
    try {
      JSONObject result=bridge.cachedDriveFailure(message);driveResult(result);
    }catch(Exception ignored){driveResult(bridge.failure(message));}
  }
  private void beginDrive(String code,boolean interactive) {
    if(!driveBusy.compareAndSet(false,true))return;
    try{pendingDriveConfig=new DriveConfig(code);pendingDriveCode=code;pendingDriveInteractive=interactive;}
    catch(Exception error){driveFailure("PC থেকে পাওয়া সঠিক Drive সংযোগ কোড দিন।");return;}
    runOnUiThread(()->{
      try {
        AuthorizationRequest request=AuthorizationRequest.builder().setAccount(new Account(pendingDriveConfig.email,"com.google"))
          .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_SCOPE))).setOptOutIncludingGrantedScopes(true).build();
        Identity.getAuthorizationClient(this).authorize(request).addOnSuccessListener(result->{
          if(result.hasResolution()) {
            if(!pendingDriveInteractive){driveFailure("Google-এর অনুমতি প্রয়োজন। ‘এখন আপডেট’ চাপুন অথবা Drive সংযোগ আবার দিন।");return;}
            try{startIntentSenderForResult(result.getPendingIntent().getIntentSender(),AUTHORIZE_DRIVE,null,0,0,0);}
            catch(Exception error){driveFailure("Google অনুমতির পর্দা খোলা যায়নি। আবার চেষ্টা করুন।");}
          }else finishAuthorization(result);
        }).addOnFailureListener(error->{
          int status=error instanceof ApiException?((ApiException)error).getStatusCode():0;
          driveFailure(status==10?"Google Cloud-এ এই APK-এর Android client, package ও SHA-1 একই project-এ সেটআপ করুন।":"Google সংযোগ পাওয়া যায়নি। ইন্টারনেট ও Google Play services পরীক্ষা করুন।");
        });
      }catch(Exception error){driveFailure("Google Play services আপডেট করে আবার চেষ্টা করুন।");}
    });
  }
  private void finishAuthorization(AuthorizationResult authorization) {
    final String token=authorization.getAccessToken(),code=pendingDriveCode;
    final DriveConfig config=pendingDriveConfig;
    if(config==null||token==null||!authorization.getGrantedScopes().contains(DRIVE_SCOPE)){driveFailure("Drive ফাইল ব্যবহারের অনুমতি দেওয়া হয়নি।");return;}
    // Tokens stay inside native memory. Only validated business data enters WebView.
    new Thread(()->{
      HttpURLConnection connection=null;
      try {
        connection=(HttpURLConnection)new URL("https://www.googleapis.com/drive/v3/files/"+config.fileId+"?alt=media").openConnection();
        connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(10000);connection.setReadTimeout(20000);
        connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("Cache-Control","no-cache");
        int status=connection.getResponseCode();
        if(status==401) {
          runOnUiThread(()->Identity.getAuthorizationClient(this).clearToken(ClearTokenRequest.builder().setToken(token).build()));
          throw new Exception("Google-এর অনুমতি নবায়ন দরকার। আবার ‘এখন আপডেট’ চাপুন।");
        }
        if(status==403||status==404)throw new Exception("Drive ফাইল পড়ার অনুমতি নেই। PC ও Android client একই Cloud project-এ রাখুন, একই Gmail ব্যবহার করুন এবং PC থেকে নতুন কোড নিন।");
        if(status==429)throw new Exception("Google এখন ব্যস্ত। কিছুক্ষণ পরে আবার আপডেট করুন।");
        if(status!=200)throw new Exception("Drive-এর হিসাব পাওয়া যায়নি। পরে আবার চেষ্টা করুন।");
        JSONObject data=bridge.validated(bridge.read(connection.getInputStream()));config.validateShop(data);
        driveResult(bridge.acceptDrive(data,code));
      }catch(Exception error){driveFailure(error instanceof java.io.IOException?"ইন্টারনেটের সংযোগ নেই বা Drive সাড়া দেয়নি। সেভ করা হিসাব দেখানো হচ্ছে।":error.getMessage());}
      finally{if(connection!=null)connection.disconnect();}
    },"owner-drive-download").start();
  }

  public final class OwnerBridge {
    private final SharedPreferences preferences=getSharedPreferences("owner-connection",MODE_PRIVATE);
    private File cache(){return new File(getFilesDir(),"owner-snapshot.json");}
    private JSONObject failure(String message){JSONObject result=new JSONObject();try{result.put("error",message);}catch(Exception ignored){}return result;}
    private String read(InputStream stream) throws Exception {try(InputStream input=stream;ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1){if(bytes.size()+n>20_000_000)throw new Exception("ফাইলটি অনেক বড়।");bytes.write(buffer,0,n);}return bytes.toString("UTF-8");}}
    private JSONObject validated(String raw) throws Exception {
      return SnapshotValidation.parse(raw);
    }
    private void save(JSONObject data) throws Exception {File temporary=new File(getFilesDir(),"owner-snapshot.tmp");try(FileOutputStream out=new FileOutputStream(temporary)){out.write(data.toString().getBytes(StandardCharsets.UTF_8));out.getFD().sync();}if(!temporary.renameTo(cache()))throw new Exception("হিসাব সেভ করা যায়নি।");}
    private JSONObject envelope(JSONObject data,String source,boolean offline) throws Exception {JSONObject result=new JSONObject();result.put("data",data);result.put("source",source);result.put("demo",source.equals("demo"));result.put("offline",offline);return result;}
    private synchronized JSONObject acceptDrive(JSONObject data,String code) throws Exception {
      save(data);String downloadedAt=java.time.Instant.now().toString();
      preferences.edit().remove("url").remove("token").putString("driveCode",code).putString("source","drive").putString("downloadedAt",downloadedAt).commit();
      JSONObject result=envelope(data,"drive",false);result.put("downloadedAt",downloadedAt);return result;
    }
    private synchronized JSONObject cachedDriveFailure(String message) throws Exception {
      // A failed attempt to switch shops must never display another shop's cache
      // as a successfully connected account.
      if("drive".equals(preferences.getString("source",""))&&preferences.getString("driveCode","").equals(pendingDriveCode)&&cache().exists()) {
        JSONObject result=envelope(validated(read(new FileInputStream(cache()))),"drive",true);
        result.put("warning",message);result.put("downloadedAt",preferences.getString("downloadedAt",""));return result;
      }
      return failure(message);
    }
    @JavascriptInterface public void connectDrive(String code){beginDrive(code,true);}
    @JavascriptInterface public void refreshDrive(boolean interactive){beginDrive(preferences.getString("driveCode",""),interactive);}
    @JavascriptInterface public synchronized String forgetDrive(){
      if(driveBusy.get())return failure("আপডেট শেষ হলে সংযোগ সরান।").toString();
      preferences.edit().remove("driveCode").remove("downloadedAt").putString("source","import").commit();
      try{return envelope(validated(read(new FileInputStream(cache()))),"import",true).toString();}catch(Exception error){return "{\"needsConnection\":true}";}
    }
    private JSONObject fetch(String base,String token) throws Exception {
      URL url=new URL(base);String host=url.getHost();
      if(!"http".equals(url.getProtocol())||url.getPort()!=3002||url.getUserInfo()!=null||!url.getPath().isEmpty()||!host.matches("(?:10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|192\\.168\\.\\d{1,3}\\.\\d{1,3}|172\\.(?:1[6-9]|2[0-9]|3[01])\\.\\d{1,3}\\.\\d{1,3})")||!token.matches("[A-Za-z0-9_-]{43}"))throw new Exception("সংযোগ কোডটি সঠিক নয়।");
      HttpURLConnection connection=(HttpURLConnection)new URL(base+"/snapshot").openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(5000);connection.setReadTimeout(10000);connection.setRequestProperty("Authorization","Bearer "+token);
      try{int status=connection.getResponseCode();if(status==401||status==403)throw new Exception("PC থেকে নতুন সংযোগ কোড নিন।");if(status!=200)throw new Exception("PC-র হিসাব পাওয়া যায়নি।");return validated(new JSONObject(read(connection.getInputStream())).getJSONObject("data").toString());}finally{connection.disconnect();}
    }
    @JavascriptInterface public synchronized String connect(String code){
      try{
        if(driveBusy.get())throw new Exception();
        if(code.length()>4096)throw new Exception("সংযোগ কোডটি সঠিক নয়।");
        String raw=code.trim();if(raw.startsWith("RS1."))raw=new String(Base64.decode(raw.substring(4),Base64.URL_SAFE),StandardCharsets.UTF_8);
        JSONObject config=new JSONObject(raw);if(config.optInt("version")!=1)throw new Exception("নতুন সংযোগ কোড নিন।");
        String url=config.getString("url"),token=config.getString("token");JSONObject data=fetch(url,token);save(data);
        preferences.edit().remove("driveCode").remove("downloadedAt").putString("url",url).putString("token",token).putString("source","wifi").commit();return envelope(data,"wifi",false).toString();
      }catch(Exception error){return failure("যুক্ত হওয়া যায়নি। একই Wi-Fi, PC চালু এবং সঠিক সংযোগ কোড নিশ্চিত করুন।").toString();}
    }
    @JavascriptInterface public synchronized String loadSnapshot(){
      String url=preferences.getString("url",""),source=preferences.getString("source","import");
      try{
        if(!url.isEmpty()){
          try{JSONObject data=fetch(url,preferences.getString("token",""));save(data);return envelope(data,"wifi",false).toString();}
          catch(Exception network){if(cache().exists()){JSONObject result=envelope(validated(read(new FileInputStream(cache()))),source,true);result.put("warning","PC-র সংযোগ নেই। সেভ করা সর্বশেষ হিসাব দেখানো হচ্ছে।");return result.toString();}throw network;}
        }
        if(cache().exists()){JSONObject result=envelope(validated(read(new FileInputStream(cache()))),source,true);result.put("downloadedAt",preferences.getString("downloadedAt",""));return result.toString();}
        return "{\"needsConnection\":true}";
      }catch(Exception error){return failure("হিসাব পাওয়া যায়নি। PC-র সঙ্গে যুক্ত করুন অথবা হিসাবের ফাইল খুলুন।").toString();}
    }
    @JavascriptInterface public synchronized String importSnapshot(String raw,String source){
      try{if(driveBusy.get()||raw.length()>20_000_000)throw new Exception();JSONObject data=validated(raw);save(data);String kind=source.equals("demo")?"demo":"import";preferences.edit().remove("url").remove("token").remove("driveCode").remove("downloadedAt").putString("source",kind).commit();return envelope(data,kind,true).toString();}
      catch(Exception error){return failure("হিসাবের ফাইলটি সঠিক নয়।").toString();}
    }
  }
}
