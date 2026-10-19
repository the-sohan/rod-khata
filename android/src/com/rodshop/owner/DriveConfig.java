package com.rodshop.owner;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.json.JSONObject;

/** Public file coordinates only. Google authorization is still required. */
public final class DriveConfig {
  public final String shopId,fileId,email;
  public DriveConfig(String code) throws Exception {
    if(code==null||code.length()>4096||!code.trim().startsWith("RD1."))throw new Exception("PC থেকে পাওয়া RD1. কোড দিন।");
    JSONObject value=new JSONObject(new String(Base64.getUrlDecoder().decode(code.trim().substring(4)),StandardCharsets.UTF_8));
    shopId=value.getString("shopId");fileId=value.getString("fileId");email=value.getString("ownerEmail");
    if(value.optInt("version")!=1||!shopId.matches("[A-Za-z0-9-]{10,100}")||!fileId.matches("[A-Za-z0-9_-]{10,200}")||!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")||email.length()>254)throw new Exception("Drive সংযোগ কোডটি সঠিক নয়।");
  }
  public void validateShop(JSONObject data) throws Exception {
    if(!data.optBoolean("readonly")||data.optInt("schemaVersion")!=2||!shopId.equals(data.getJSONObject("shop").getString("id"))||data.getJSONObject("reportData").optInt("version")!=1)throw new Exception("এই ফাইলটি নির্বাচিত দোকানের হিসাব নয়। PC থেকে নতুন Drive কোড নিন।");
  }
}
