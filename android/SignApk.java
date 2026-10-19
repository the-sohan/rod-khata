import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.util.Collections;

public final class SignApk {
  public static void main(String[] args) throws Exception {
    char[] password=System.getenv("ROD_ANDROID_KEY_PASSWORD").toCharArray();
    KeyStore keys=KeyStore.getInstance("PKCS12");try(FileInputStream input=new FileInputStream(args[2])){keys.load(input,password);}
    PrivateKey key=(PrivateKey)keys.getKey("owner",password);X509Certificate cert=(X509Certificate)keys.getCertificate("owner");
    ApkSigner.SignerConfig signer=new ApkSigner.SignerConfig.Builder("owner",key,Collections.singletonList(cert)).build();
    new ApkSigner.Builder(Collections.singletonList(signer)).setInputApk(new File(args[0])).setOutputApk(new File(args[1]))
      .setMinSdkVersion(26).setV1SigningEnabled(true).setV2SigningEnabled(true).setV3SigningEnabled(true).setV4SigningEnabled(false).setAlignmentPreserved(true).build().sign();
    ApkVerifier.Result result=new ApkVerifier.Builder(new File(args[1])).build().verify();
    if(!result.isVerified()||!result.isVerifiedUsingV2Scheme())throw new IllegalStateException("APK verification failed: "+result.getAllErrors());
    byte[] digest=MessageDigest.getInstance("SHA-256").digest(cert.getEncoded());StringBuilder fingerprint=new StringBuilder();for(byte b:digest)fingerprint.append(String.format("%02x",b));
    System.out.println("APK verified. v1="+result.isVerifiedUsingV1Scheme()+", v2="+result.isVerifiedUsingV2Scheme()+", v3="+result.isVerifiedUsingV3Scheme()+", certificate SHA256="+fingerprint);
  }
}
