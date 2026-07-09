// Hijerarhija: slot vise razine moze otkljucati rad nize razine.
// Kod vezanja slobodnog slota uvijek trosimo najnizi dovoljan tier.
export const TIER_RANK = {
  seminarski: 1,
  zavrsni: 2,
  diplomski: 3,
  doktorski: 4,
} as const

export type Tier = keyof typeof TIER_RANK

export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && value in TIER_RANK
}
