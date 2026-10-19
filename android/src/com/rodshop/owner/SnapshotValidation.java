package com.rodshop.owner;

import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Check the report contract before replacing the last usable offline cache. */
public final class SnapshotValidation {
  private static void require(boolean condition) throws Exception {if(!condition)throw new Exception("হিসাবের ফাইলটি অসম্পূর্ণ বা সঠিক নয়। PC থেকে নতুন আপডেট নিন।");}
  private static long integer(JSONObject value,String key,long min) throws Exception {
    Object raw=value.get(key);require(raw instanceof Number);double number=((Number)raw).doubleValue();
    require(Double.isFinite(number)&&number>=min&&number<=9007199254740991D&&number==Math.floor(number));return ((Number)raw).longValue();
  }
  private static Set<Long> identities(JSONArray rows) throws Exception {
    Set<Long> ids=new HashSet<>();
    for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);long id=integer(row,"id",1);require(row.get("name") instanceof String&&!row.getString("name").trim().isEmpty());require(ids.add(id));}return ids;
  }
  public static JSONObject parse(String raw) throws Exception {
    JSONObject data=new JSONObject(raw);require(data.optBoolean("readonly")&&data.optInt("schemaVersion")==2);
    require(data.getJSONObject("shop").get("name") instanceof String);require(data.getString("day").matches("\\d{4}-\\d{2}-\\d{2}"));Instant.parse(data.getString("generatedAt"));
    for(String key:new String[]{"products","recent","customers","suppliers","customerRecords"})data.getJSONArray(key);
    JSONObject totals=data.getJSONObject("totals");
    for(String key:new String[]{"sales","received","expenses","supplierPaid","saleCount","customerDue","supplierDue"}){
      Object value=totals.get(key);require(value instanceof Number&&Double.isFinite(((Number)value).doubleValue())&&((Number)value).doubleValue()>=0);
    }
    JSONObject report=data.getJSONObject("reportData");require(report.optInt("version")==1);
    Set<Long> customers=identities(report.getJSONArray("customers")),products=identities(report.getJSONArray("products")),entries=new HashSet<>();
    JSONArray rows=report.getJSONArray("entries");
    for(int i=0;i<rows.length();i++){
      JSONObject row=rows.getJSONObject(i);require(entries.add(integer(row,"id",1)));
      String kind=row.getString("kind");require(Arrays.asList("sale","collection","purchase","supplier_payment","expense").contains(kind));
      require(row.getString("day").matches("\\d{4}-\\d{2}-\\d{2}"));
      long amount=integer(row,"amountPoisha",1),paid=integer(row,"paidPoisha",0);require(paid<=amount);
      if(kind.equals("sale")||kind.equals("collection"))require(customers.contains(integer(row,"partyId",1)));
    }
    rows=report.getJSONArray("items");
    for(int i=0;i<rows.length();i++){
      JSONObject row=rows.getJSONObject(i);require(entries.contains(integer(row,"entryId",1))&&products.contains(integer(row,"productId",1)));
      String unit=row.getString("unit");require(unit.equals("kg")||unit.equals("pcs"));
      long quantity=integer(row,"quantityScaled",1);integer(row,"amountPoisha",1);require(!unit.equals("pcs")||quantity%1000==0);
    }
    return data;
  }
}
