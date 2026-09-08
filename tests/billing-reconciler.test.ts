import { describe,expect,it,vi } from 'vitest';
import { reconcileBillingQueue } from '../supabase/functions/katedra-agent-worker/billing-reconciler';

describe('canonical AI billing reconciliation worker',()=>{
  it('uses stored request identities and only counts confirmed settlement',async()=>{
    const rpc=vi.fn(async(name:string)=>name==='list_reconcilable_katedra_billing'
      ? {data:[{request_id:'one'},{request_id:'two'}],error:null}
      : {data:{status:name==='reconcile_katedra_billing'?'settled':'unexpected'},error:null});
    expect(await reconcileBillingQueue({rpc})).toEqual({checked:2,settled:2,pending:0,deferred:0});
    expect(rpc).toHaveBeenCalledWith('reconcile_katedra_billing',{p_request_id:'one'});
  });
  it('keeps failed and ambiguous results pending without exposing provider details',async()=>{
    const rpc=vi.fn(async(name:string)=>name==='list_reconcilable_katedra_billing'
      ? {data:[{request_id:'one'}],error:null} : {data:null,error:{message:'private-database-detail'}});
    expect(await reconcileBillingQueue({rpc})).toEqual({checked:1,settled:0,pending:1,deferred:0});
  });
  it('does not report an unavailable queue as empty',async()=>{
    await expect(reconcileBillingQueue({rpc:vi.fn().mockResolvedValue({data:null,error:{}})})).rejects.toThrow('Billing queue unavailable');
  });
  it('counts a committed response recovered after timeout without another charge',async()=>{
    const rpc=vi.fn(async(name:string)=>name==='list_reconcilable_katedra_billing'
      ? {data:[{request_id:'one'}],error:null} : {data:{status:'already_settled'},error:null});
    expect(await reconcileBillingQueue({rpc})).toEqual({checked:1,settled:1,pending:0,deferred:0});
  });
  it('does not count unrecognized status as settled',async()=>{
    const rpc=vi.fn(async(name:string)=>name==='list_reconcilable_katedra_billing'
      ? {data:[{request_id:'one'}],error:null} : {data:{status:'released'},error:null});
    expect(await reconcileBillingQueue({rpc})).toEqual({checked:1,settled:0,pending:1,deferred:0});
  });
  it('leaves work for a later tick when its deadline expires',async()=>{
    const rpc=vi.fn().mockResolvedValue({data:[{request_id:'one'}],error:null});
    expect(await reconcileBillingQueue({rpc},{now:()=>100,deadlineAt:100})).toEqual({checked:0,settled:0,pending:0,deferred:1});
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
