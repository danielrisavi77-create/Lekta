/**
 * T84 RF-1: nagrada prijatelju (placeni slot) ne smije pripasti anonimnom Auth racunu. Gard cita izvor
 * helpera i jedinog pozivatelja (generate-report) i trazi (1) rani izlaz za anonimni racun i (2) da
 * pozivatelj gradi `caller` kroz friendRewardCaller(user) iz server-side `auth.getUser`, gdje je samo
 * izricit `is_anonymous === false` pravi racun (nepoznato je anonimno), ne konstantu ni podatak klijenta.
 * Baseline je u tests/friend-referral-reward.test.ts, mutacije u tests/gate-mutations.test.ts.
 */
export function friendRewardAnonGuardProblems(helperSrc: string, generateReportSrc: string): string[] {
  const out: string[] = [];
  if (!/if \(caller\.isAnonymous !== false\) return \{ granted: false, reason: 'ineligible_anonymous' \};/.test(helperSrc)) {
    out.push('grant-friend-referral-reward: nema ranog izlaza za anonimni racun');
  }
  const calls = [...generateReportSrc.matchAll(/tryGrantFriendReferralReward\(([^;]*)\);/g)].map((m) => m[1]);
  if (calls.length === 0) out.push('generate-report: ne zove tryGrantFriendReferralReward');
  for (const args of calls) {
    if (!/friendRewardCaller\(user\)$/.test(args.trim())) {
      out.push(`generate-report: pozivatelj ne dolazi iz friendRewardCaller(user) (${args.trim()})`);
    }
  }
  if (!/return \{ isAnonymous: user\.is_anonymous !== false \};/.test(helperSrc)) {
    out.push('grant-friend-referral-reward: nepoznat is_anonymous se ne tretira kao anonimno');
  }
  return out;
}
