type BillingClient={rpc:(name:string,params:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>};

export async function reconcileBillingQueue(db:BillingClient,{now=Date.now,deadlineAt=now()+45_000}={}){
  const summary={checked:0,settled:0,pending:0,deferred:0};
  const queue=await db.rpc('list_reconcilable_katedra_billing',{});
  if(queue.error||!Array.isArray(queue.data)||queue.data.length>25
    ||queue.data.some(row=>typeof row?.request_id!=='string'||!row.request_id.trim()||row.request_id.length>100)){
    throw new Error('Billing queue unavailable');
  }
  for(const [index,row] of queue.data.entries()){
    if(now()>=deadlineAt){summary.deferred=queue.data.length-index;break;}
    summary.checked++;
    try{
      const result=await db.rpc('reconcile_katedra_billing',{p_request_id:row.request_id});
      const status=(result.data as {status?:unknown}|null)?.status;
      if(!result.error&&(status==='settled'||status==='already_settled')){summary.settled++;continue;}
    }catch{/* Leave the canonical attempt for retry; never copy private database errors. */}
    summary.pending++;
  }
  return summary;
}
