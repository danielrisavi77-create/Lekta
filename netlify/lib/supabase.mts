import { createClient, type User } from '@supabase/supabase-js'
import { requireEnv } from './env.mts'

// Service role klijent: zaobilazi RLS, koristi se ISKLJUCIVO server side.
// Nikad ne slati ovaj kljuc u browser.
export const supabaseAdmin = createClient(
  requireEnv('SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } }
)

// Validira Supabase access token iz Authorization headera (OTP login na klijentu).
export async function getUserFromRequest(req: Request): Promise<User | null> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}
