// Aggregate bill headers separately from bill items: a mixed-product sale counts once.
export function readSalesReport(db,range) {
  const {from,to}=range;
  db.exec('BEGIN');
  try {
    const sum=db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN kind='sale' THEN amount_poisha ELSE 0 END),0) AS sales,
      COALESCE(SUM(CASE WHEN kind='sale' THEN paid_poisha ELSE 0 END),0) AS salePaid,
      COALESCE(SUM(CASE WHEN kind='collection' THEN amount_poisha ELSE 0 END),0) AS collections,
      COALESCE(SUM(CASE WHEN kind='purchase' THEN amount_poisha ELSE 0 END),0) AS purchases,
      COALESCE(SUM(CASE WHEN kind='purchase' THEN paid_poisha ELSE 0 END),0) AS purchasePaid,
      COALESCE(SUM(CASE WHEN kind='supplier_payment' THEN amount_poisha ELSE 0 END),0) AS supplierPayments,
      COALESCE(SUM(CASE WHEN kind='expense' THEN amount_poisha ELSE 0 END),0) AS expenses,
      COUNT(CASE WHEN kind='sale' THEN 1 END) AS invoiceCount,
      COUNT(DISTINCT CASE WHEN kind='sale' THEN party_id END) AS customerCount
      FROM entries WHERE local_day BETWEEN ? AND ?`).get(from,to);
    const opening=db.prepare(`SELECT COALESCE(SUM(CASE WHEN kind='sale' THEN amount_poisha-paid_poisha
      WHEN kind='collection' THEN -amount_poisha ELSE 0 END),0) AS due FROM entries WHERE local_day<?`).get(from).due;
    const totals={...Object.fromEntries(['sales','salePaid','collections','purchases','purchasePaid','supplierPayments','expenses'].map(key=>[key,sum[key]/100])),
      invoiceCount:sum.invoiceCount,customerCount:sum.customerCount,
      received:(sum.salePaid+sum.collections)/100,newDue:(sum.sales-sum.salePaid)/100,
      openingDue:opening/100,closingDue:(opening+sum.sales-sum.salePaid-sum.collections)/100,
      cashOut:(sum.purchasePaid+sum.supplierPayments+sum.expenses)/100,
      cashMovement:(sum.salePaid+sum.collections-sum.purchasePaid-sum.supplierPayments-sum.expenses)/100};
    const products=db.prepare(`SELECT i.product_id AS id,p.name,i.unit,SUM(i.quantity_scaled) AS quantity,
      SUM(i.amount_poisha) AS sales,COUNT(DISTINCT e.id) AS invoiceCount
      FROM entry_items i JOIN entries e ON e.id=i.entry_id JOIN products p ON p.id=i.product_id
      WHERE e.kind='sale' AND e.local_day BETWEEN ? AND ?
      GROUP BY i.product_id,p.name,i.unit ORDER BY sales DESC,p.name`).all(from,to).map(row=>({
        ...row,quantity:row.quantity/1000,sales:row.sales/100,averageRate:row.sales*10/row.quantity,
      }));
    const customers=db.prepare(`SELECT p.id,p.name,p.mobile,p.archived_at AS archived,
      COUNT(CASE WHEN e.local_day>=? AND e.kind='sale' THEN 1 END) AS invoiceCount,
      SUM(CASE WHEN e.local_day>=? AND e.kind='sale' THEN e.amount_poisha ELSE 0 END) AS sales,
      SUM(CASE WHEN e.local_day>=? AND e.kind='sale' THEN e.paid_poisha ELSE 0 END) AS salePaid,
      SUM(CASE WHEN e.local_day>=? AND e.kind='collection' THEN e.amount_poisha ELSE 0 END) AS collections,
      SUM(CASE WHEN e.local_day<? AND e.kind='sale' THEN e.amount_poisha-e.paid_poisha
        WHEN e.local_day<? AND e.kind='collection' THEN -e.amount_poisha ELSE 0 END) AS openingDue,
      SUM(CASE WHEN e.kind='sale' THEN e.amount_poisha-e.paid_poisha ELSE -e.amount_poisha END) AS closingDue
      FROM parties p JOIN entries e ON e.party_id=p.id AND e.kind IN ('sale','collection') AND e.local_day<=?
      WHERE p.kind='customer' GROUP BY p.id
      HAVING SUM(CASE WHEN e.local_day>=? THEN 1 ELSE 0 END)>0 ORDER BY sales DESC,p.name`)
      .all(from,from,from,from,from,from,to,from).map(row=>({
        ...row,archived:!!row.archived,
        ...Object.fromEntries(['sales','salePaid','collections','openingDue','closingDue'].map(key=>[key,row[key]/100])),
        newDue:(row.sales-row.salePaid)/100,received:(row.salePaid+row.collections)/100,
      }));
    const days=db.prepare(`SELECT local_day AS day,COUNT(CASE WHEN kind='sale' THEN 1 END) AS invoiceCount,
      SUM(CASE WHEN kind='sale' THEN amount_poisha ELSE 0 END) AS sales,
      SUM(CASE WHEN kind IN ('sale','collection') THEN paid_poisha ELSE 0 END) AS received,
      SUM(CASE WHEN kind='expense' THEN amount_poisha ELSE 0 END) AS expenses
      FROM entries WHERE local_day BETWEEN ? AND ? GROUP BY local_day ORDER BY local_day`)
      .all(from,to).map(row=>({...row,sales:row.sales/100,received:row.received/100,expenses:row.expenses/100}));
    db.exec('COMMIT');
    return {range,generatedAt:new Date().toISOString(),totals,products,customers,days};
  } catch(error) {db.exec('ROLLBACK');throw error;}
}
