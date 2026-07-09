import { SignJWT, jwtVerify } from 'jose'
import { requireEnv } from './env.mts'
import type { Tier } from './tiers.mts'

export interface UnlockPayload {
  sub: string // user_id
  work_id: string
  slot_id: string
  tier: Tier
}

function secret(): Uint8Array {
  // Generiraj s: openssl rand -base64 32
  return new TextEncoder().encode(requireEnv('REPORT_TOKEN_SECRET'))
}

export async function signUnlockToken(payload: UnlockPayload): Promise<string> {
  return new SignJWT({
    work_id: payload.work_id,
    slot_id: payload.slot_id,
    tier: payload.tier,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('24h') // klijent tiho refresha kroz unlock-report
    .sign(secret())
}

// Koristi ovo u file-guarantee-claim funkciji: zahtjev za jamstvo (T2/T3)
// mora nositi validan token, cime je svaki claim vezan uz stvarnu kupnju.
export async function verifyUnlockToken(token: string): Promise<UnlockPayload> {
  const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.work_id !== 'string' ||
    typeof payload.slot_id !== 'string' ||
    typeof payload.tier !== 'string'
  ) {
    throw new Error('Neispravan sadrzaj tokena')
  }
  return {
    sub: payload.sub,
    work_id: payload.work_id as string,
    slot_id: payload.slot_id as string,
    tier: payload.tier as Tier,
  }
}
