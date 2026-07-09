import type { Config } from '@netlify/functions'
import { supabaseAdmin, getUserFromRequest } from '../lib/supabase.mts'
import { isTier, TIER_RANK, type Tier } from '../lib/tiers.mts'
import { signUnlockToken } from '../lib/unlock-token.mts'
import { json } from '../lib/http.mts'

interface Body {
  tier?: string
  work_id?: string
}

interface SlotRow {
  id: string
  tier: Tier
  expires_at: string | null
  created_at: string
}

const isLive = (slot: { expires_at: string | null }) =>
  !slot.expires_at || new Date(slot.expires_at) > new Date()

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const user = await getUserFromRequest(req)
  if (!user) return json(401, { error: 'unauthorized' })

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const workId =
    typeof body.work_id === 'string' && body.work_id.length > 0 && body.work_id.length <= 64
      ? body.work_id
      : null

  if (!workId || !isTier(body.tier)) return json(400, { error: 'invalid_params' })

  // 1) rad je vec pokriven slotom ovog korisnika: ponovne provjere su besplatne
  const { data: bound, error: boundError } = await supabaseAdmin
    .from('report_slots')
    .select('id, tier, expires_at, created_at')
    .eq('user_id', user.id)
    .eq('work_id', workId)
    .eq('status', 'active')
    .maybeSingle<SlotRow>()

  if (boundError) {
    console.error('Slot lookup failed', boundError)
    return json(500, { error: 'db_error' })
  }

  let slot: SlotRow | null = bound && isLive(bound) ? bound : null

  // 2) nema vezanog slota: pokusaj vezati slobodan slot dovoljne razine
  if (!slot) {
    const { data: candidates, error: candidatesError } = await supabaseAdmin
      .from('report_slots')
      .select('id, tier, expires_at, created_at')
      .eq('user_id', user.id)
      .is('work_id', null)
      .eq('status', 'active')

    if (candidatesError) {
      console.error('Free slot lookup failed', candidatesError)
      return json(500, { error: 'db_error' })
    }

    const needed = TIER_RANK[body.tier]
    const usable = ((candidates ?? []) as SlotRow[])
      .filter((c) => TIER_RANK[c.tier] >= needed && isLive(c))
      // trosi najnizi dovoljan tier, pa najstariji: doktorski slot ne izgara na seminarskom
      .sort(
        (a, b) =>
          TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
          a.created_at.localeCompare(b.created_at)
      )

    for (const candidate of usable) {
      // optimisticno zakljucavanje: update prolazi samo ako je slot jos slobodan
      const { data: updated, error: bindError } = await supabaseAdmin
        .from('report_slots')
        .update({ work_id: workId, work_bound_at: new Date().toISOString() })
        .eq('id', candidate.id)
        .is('work_id', null)
        .select('id, tier, expires_at, created_at')
        .maybeSingle<SlotRow>()

      if (!bindError && updated) {
        slot = updated
        break
      }
    }
  }

  // 402 Payment Required: klijent na ovo prikazuje checkout CTA
  if (!slot) return json(402, { error: 'no_entitlement' })

  const token = await signUnlockToken({
    sub: user.id,
    work_id: workId,
    slot_id: slot.id,
    tier: slot.tier,
  })

  return json(200, {
    token,
    slot: { id: slot.id, tier: slot.tier, expires_at: slot.expires_at },
  })
}

export const config: Config = {
  path: '/api/unlock-report',
}
