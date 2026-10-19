package com.rodshop.owner;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.json.JSONObject;

public final class DriveConfigTest {
  private static String code(JSONObject value){return "RD1."+Base64.getUrlEncoder().withoutPadding().encodeToString(value.toString().getBytes(StandardCharsets.UTF_8));}
  private static void rejects(RunnableWithException test) throws Exception {try{test.run();}catch(Exception expected){return;}throw new AssertionError("Expected rejection");}
  interface RunnableWithException{void run() throws Exception;}
  public static void main(String[] args) throws Exception {
    JSONObject config=new JSONObject().put("version",1).put("shopId","shop-1234567890").put("fileId","drive_1234567890").put("ownerEmail","owner@example.test");
    DriveConfig parsed=new DriveConfig(code(config));
    if(!parsed.email.equals("owner@example.test"))throw new AssertionError();
    JSONObject data=new JSONObject().put("readonly",true).put("schemaVersion",2).put("shop",new JSONObject().put("id",parsed.shopId)).put("reportData",new JSONObject().put("version",1));
    parsed.validateShop(data);
    rejects(()->new DriveConfig("RS1.invalid"));rejects(()->new DriveConfig("RD1.%"));
    rejects(()->new DriveConfig(code(new JSONObject(config.toString()).put("fileId","../../secrets"))));
    rejects(()->new DriveConfig(code(new JSONObject(config.toString()).put("version",2))));
    rejects(()->parsed.validateShop(new JSONObject(data.toString()).put("readonly",false)));
    rejects(()->parsed.validateShop(new JSONObject(data.toString()).put("shop",new JSONObject().put("id","another-shop"))));
    JSONObject demo=SnapshotValidation.parse(new String(Files.readAllBytes(Paths.get(args[0])),StandardCharsets.UTF_8));
    rejects(()->SnapshotValidation.parse(new JSONObject(demo.toString()).put("reportData",new JSONObject().put("version",1)).toString()));
    JSONObject broken=new JSONObject(demo.toString());broken.getJSONObject("reportData").getJSONArray("items").getJSONObject(0).put("entryId",999999999);
    rejects(()->SnapshotValidation.parse(broken.toString()));
    System.out.println("Android Drive code validation and shop isolation passed.");
  }
}
