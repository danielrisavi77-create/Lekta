/**
 * Poruka za 429 iz repair-docx po razlogu (RE-33, T84 RD-2). Odvojeno od app.ts da poruka ne tvrdi
 * "besplatnih" kad je posrijedi placeni strop, dijeljeni IP ili strop pokusaja bez izmjena (kada
 * besplatna kvota NIJE potrosena).
 */
export type RepairRateLimitReason = 'free_user' | 'free_ip' | 'paid_daily' | 'attempts_daily' | undefined;

export function repairRateLimitMessage(reason: RepairRateLimitReason): string {
  switch (reason) {
    case 'attempts_daily':
      return '<strong>Dnevni limit pokušaja bez izmjena je dosegnut.</strong> Dokument je već usklađen ili ga nije bilo moguće sigurno popraviti, pa besplatna kvota nije potrošena. Prozor je 24 sata, pa pokušaj ponovno sutra.';
    case 'paid_daily':
      return '<strong>Dnevni limit zahtjeva je iskorišten.</strong> Prozor je 24 sata, pa pokušaj ponovno sutra.';
    case 'free_ip':
      return '<strong>Dnevni limit besplatnih popravaka za ovu mrežu/uređaj je iskorišten.</strong> Prozor je 24 sata; pokušaj ponovno sutra ili s drugog uređaja.';
    default:
      return '<strong>Dnevni limit besplatnih popravaka je iskorišten.</strong> Prozor je 24 sata, pa pokušaj ponovno sutra. Ručne upute iznad i dalje vrijede.';
  }
}
