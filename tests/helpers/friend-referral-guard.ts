/**
 * T84 RF-1: nagrada prijatelju (placeni slot) ne smije pripasti anonimnom Auth racunu. Gard cita izvor
 * helpera i jedinog pozivatelja (generate-report) i trazi (1) rani izlaz za anonimni racun i (2) da
 * pozivatelj prosljeduje is_anonymous iz server-side `auth.getUser`, ne konstantu ni podatak klijenta.
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
    if (!/\{ isAnonymous: user\.is_anonymous === true \}$/.test(args.trim())) {
      out.push(`generate-report: isAnonymous ne dolazi iz user.is_anonymous (${args.trim()})`);
    }
  }
  return out;
}
