import Stripe from 'stripe'
import type { Config } from '@netlify/functions'
import { getUserFromRequest } from '../lib/supabase.mts'
import { isTier, type Tier } from '../lib/tiers.mts'
import { json } from '../lib/http.mts'
import { requireEnv } from '../lib/env.mts'

const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'))

const PRICE_BY_TIER: Record<Tier, string | undefined> = {
  seminarski: process.env.STRIPE_PRICE_SEMINARSKI,
  zavrsni: process.env.STRIPE_PRICE_ZAVRSNI,
  diplomski: process.env.STRIPE_PRICE_DIPLOMSKI,
  doktorski: process.env.STRIPE_PRICE_DOKTORSKI,
}

interface Body {
  tier?: string
  work_id?: string
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  // kupnja zahtijeva prijavu: entitlement se veze na user_id, ne na email string
  const user = await getUserFromRequest(req)
  if (!user) return json(401, { error: 'unauthorized' })

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  if (!isTier(body.tier)) return json(400, { error: 'invalid_tier' })

  const price = PRICE_BY_TIER[body.tier]
  if (!price) {
    console.error(`Price ID nije konfiguriran za tier: ${body.tier}`)
    return json(500, { error: 'price_not_configured' })
  }

  // work_id je opcionalan: kupnja s ekrana rezultata ga salje pa se slot
  // veze odmah u webhooku; kupnja s cjenika ostavlja slot nevezan
  const workId =
    typeof body.work_id === 'string' && body.work_id.length > 0 && body.work_id.length <= 64
      ? body.work_id
      : undefined

  const siteUrl = process.env.SITE_URL || process.env.URL || 'https://lektahr.netlify.app'

  const successUrl =
    `${siteUrl}/?checkout=success` +
    `&tier=${encodeURIComponent(body.tier)}` +
    (workId ? `&work=${encodeURIComponent(workId)}` : '') +
    `&session_id={CHECKOUT_SESSION_ID}`

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
      customer_email: user.email ?? undefined,
      client_reference_id: user.id,
      locale: 'hr',
      allow_promotion_codes: true, // spremno za referral kodove
      automatic_tax:
        process.env.STRIPE_AUTOMATIC_TAX === 'true' ? { enabled: true } : undefined,
      metadata: {
        user_id: user.id,
        tier: body.tier,
        ...(workId ? { work_id: workId } : {}),
      },
      success_url: successUrl,
      cancel_url: `${siteUrl}/?checkout=cancel`,
    })

    return json(200, { url: session.url })
  } catch (err) {
    console.error('Stripe checkout session creation failed', err)
    return json(502, { error: 'checkout_failed' })
  }
}

export const config: Config = {
  path: '/api/create-checkout',
}
