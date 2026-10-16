// CORS ugovor za repair-docx: klijent uz auth salje X-Lekta-Response kako bi trazio
// binarni odgovor. Browser preflight mora izricito dopustiti taj header prije POST-a.
import { corsHeadersFor } from '../_shared/cors.ts';

const REPAIR_DOCX_ALLOWED_HEADERS = 'authorization, content-type, apikey, x-lekta-response';

export function repairDocxCorsHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  return corsHeadersFor(origin, allowedOrigins, 'POST, OPTIONS', REPAIR_DOCX_ALLOWED_HEADERS);
}
