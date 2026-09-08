import { describe,expect,it,vi } from 'vitest';
import { dispatchRefundReconciliation } from '../supabase/functions/katedra-agent-worker/refund-dispatcher';
describe('refund reconciliation dispatch',()=>{
  it('sends only the dedicated worker token to the bounded refund endpoint',async()=>{
    const fetchImpl=vi.fn().mockResolvedValue(Response.json({checked:1,succeeded:1,pending:0,deferred:0}));
    expect(await dispatchRefundReconciliation('https://katedra.test/','fixture-worker',fetchImpl)).toMatchObject({ok:true,succeeded:1});
    expect(fetchImpl).toHaveBeenCalledWith('https://katedra.test/api/internal/refund-reconciliation',expect.objectContaining({method:'POST',headers:{'content-type':'application/json','x-katedra-agent-worker-token':'fixture-worker'}}));
  });
  it('does not forward private response bodies on errors',async()=>{
    expect(await dispatchRefundReconciliation('https://katedra.test','fixture-worker',vi.fn().mockResolvedValue(new Response('private details',{status:503})))).toEqual({ok:false});
  });
});
