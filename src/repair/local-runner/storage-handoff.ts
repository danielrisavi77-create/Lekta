export interface RepairStorageResult {
  jobId: string;
  localRepairReady: boolean;
}

export interface RepairStorageHandoff<TLaunch> {
  storagePending: boolean;
  localRepair: TLaunch | null;
}

export async function settleRepairStorageHandoff<TLaunch>(input: {
  storeTask: Promise<RepairStorageResult | null> | null;
  waitUntil?: ((task: Promise<RepairStorageResult | null>) => void) | null;
  localLaunch: TLaunch | null;
}): Promise<RepairStorageHandoff<TLaunch>> {
  if (!input.storeTask) {
    return { storagePending: false, localRepair: null };
  }

  // A local launch is a claimable capability. Never expose it before both
  // document objects, the parent repair row and the local entitlement row
  // have been durably persisted by the storage task.
  if (input.localLaunch !== null) {
    const stored = await input.storeTask;
    return {
      storagePending: false,
      localRepair: stored?.localRepairReady ? input.localLaunch : null,
    };
  }

  // Ordinary server-side repair keeps the existing fast response path: the
  // corrected DOCX is already in memory and does not depend on local launch.
  if (input.waitUntil) {
    input.waitUntil(input.storeTask);
    return { storagePending: true, localRepair: null };
  }

  await input.storeTask;
  return { storagePending: false, localRepair: null };
}
