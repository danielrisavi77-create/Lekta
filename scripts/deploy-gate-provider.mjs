export const COMMERCE_PROVIDER_REGISTRATION_REQUIRED =
  'providerRegistered mora biti true tek nakon dovršetka registracije subjekta.';

/** Fail closed when the shipped site offers payment before provider registration is confirmed. */
export function enforceCommerceProviderRegistration({ commerceLive, provider, fail }) {
  if (!commerceLive || provider?.providerRegistered === true) return;
  fail(COMMERCE_PROVIDER_REGISTRATION_REQUIRED);
}
