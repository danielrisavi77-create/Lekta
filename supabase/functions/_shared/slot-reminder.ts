// supabase/functions/_shared/slot-reminder.ts
//
// Cista odluka: salje li se podsjetnik na istek slota za jedan slot. Izvucena iz
// send-reminders handlera da se idempotencija (ne salji dvaput) i opt-out mogu
// jedinicno testirati bez baze i mreze.
//
// Idempotencija (P0-02a / security-01): prije popravka slot grana nije imala
// per-slot marker pa je ponovljeni cron poziv slao iste e-mailove opet. Sada se
// nakon uspjesnog slanja upisuje document_slots.slot_expiry_reminder_sent_at, a
// ova funkcija preskace slot koji taj marker vec ima.

export interface SlotReminderInputs {
  /** document_slots.slot_expiry_reminder_sent_at (null = jos nije slano). */
  alreadySentAt: string | null | undefined;
  /** user_notification_preferences.slot_expiry_reminders_enabled (default true). */
  remindersEnabled: boolean;
  /** Broj report_generations za taj slot u zadnja 24h (korisnik vec aktivan). */
  recentGenerationCount: number;
}

/** True samo ako slot treba dobiti podsjetnik u ovom ciklusu. */
export function shouldSendSlotReminder(input: SlotReminderInputs): boolean {
  if (input.alreadySentAt) return false; // marker vec postavljen -> idempotencija
  if (!input.remindersEnabled) return false; // opt-out
  if (input.recentGenerationCount > 0) return false; // vec aktivan na tom radu
  return true;
}
