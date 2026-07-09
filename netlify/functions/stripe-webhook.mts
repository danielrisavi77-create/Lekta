import Stripe from 'stripe'
import type { Config } from '@netlify/functions'
import { supabaseAdmin } from '../lib/supabase.mts'
import { isTier } from '../lib/tiers.mts'
import { requireEnv } from '../lib/env.mts'

const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'))

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('missing signature', { status: 400 })

  // raw body je obavezan za verifikaciju potpisa: ne parsirati JSON prije ovoga
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      requireEnv('STRIPE_WEBHOOK_SECRET')
    )
  } catch (err) {
    console.error('Webhook signature verification failed', err)
    return new Response('invalid signature', { status: 400 })
  }

  // idempotencija: svaki event obradimo tocno jednom (Stripe salje retryjeve)
  const { error: dedupError } = await supabaseAdmin
    .from('stripe_events')
    .insert({ id: event.id, type: event.type })

  if (dedupError) {
    if (dedupError.code === '23505') {
      return new Response('duplicate event', { status: 200 })
    }
    console.error('Event dedup insert failed', dedupError)
    return new Response('storage error', { status: 500 }) // Stripe ce ponoviti
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        // za async metode (npr. bankovni transfer) payment_status jos nije paid;
        // grant tada radi async_payment_succeeded event
        if (session.payment_status === 'paid') await grantSlot(session)
        break
      }

      case 'checkout.session.async_payment_succeeded': {
        await grantSlot(event.data.object as Stripe.Checkout.Session)
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const pi =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id
        if (pi) await revokeByPaymentIntent(pi)
        break
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute
        const pi =
          typeof dispute.payment_intent === 'string'
            ? dispute.payment_intent
            : dispute.payment_intent?.id
        if (pi) await revokeByPaymentIntent(pi)
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error(`Webhook handler error for ${event.type}`, err)
    return new Response('handler error', { status: 500 }) // Stripe ce ponoviti
  }

  return new Response('ok', { status: 200 })
}

async function grantSlot(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.user_id || session.client_reference_id
  const tier = session.metadata?.tier

  if (!userId || !isTier(tier)) {
    console.error(`Session ${session.id} nema user_id ili valjan tier u metadata`)
    return
  }

  const workId = session.metadata?.work_id || null
  const validityDays = Number(process.env.SLOT_VALIDITY_DAYS || 0)
  const expiresAt =
    validityDays > 0
      ? new Date(Date.now() + validityDays * 86_400_000).toISOString()
      : null

  interface SlotInsert {
    user_id: string
    tier: string
    stripe_session_id: string
    stripe_payment_intent: string | null
    amount_total: number | null
    currency: string | null
    expires_at: string | null
    work_id?: string
    work_bound_at?: string
  }

  const base: SlotInsert = {
    user_id: userId,
    tier,
    stripe_session_id: session.id,
    stripe_payment_intent:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    amount_total: session.amount_total,
    currency: session.currency,
    expires_at: expiresAt,
  }

  // ako je kupnja krenula s ekrana rezultata, vezi slot odmah na taj rad
  const row: SlotInsert = { ...base }
  if (workId) {
    row.work_id = workId
    row.work_bound_at = new Date().toISOString()
  }

  const { error } = await supabaseAdmin.from('report_slots').insert(row)

  if (error) {
    if (error.code === '23505') {
      // ili replay iste sesije (unique stripe_session_id) ili je rad vec
      // pokriven aktivnim slotom (partial unique index): fallback na nevezan slot
      if (workId) {
        const { error: fallbackError } = await supabaseAdmin
          .from('report_slots')
          .insert(base)
        if (fallbackError && fallbackError.code !== '23505') throw fallbackError
      }
      return
    }
    throw error
  }
}

async function revokeByPaymentIntent(paymentIntent: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('report_slots')
    .update({ status: 'revoked' })
    .eq('stripe_payment_intent', paymentIntent)

  if (error) throw error
}

export const config: Config = {
  path: '/api/stripe-webhook',
}
