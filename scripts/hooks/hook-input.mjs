/**
 * Zajednicki ulaz hookova iz `scripts/hooks/`: cijeli stdin kao JSON. Vraca `null` kad ulaz nije
 * valjan JSON i to javi na stderr, a pozivatelj tada propusta (FAIL-OPEN, kao tool-guard).
 * @param {string} ime ime hooka za poruku
 * @returns {Promise<Record<string, any> | null>}
 */
export async function readHookInput(ime) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (err) {
    process.stderr.write(`${ime}: ulaz nije valjan JSON, propustam (fail-open). ${String(err)}\n`);
    return null;
  }
}
