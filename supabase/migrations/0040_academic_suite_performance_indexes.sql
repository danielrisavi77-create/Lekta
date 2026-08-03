-- Academic Suite targeted performance hardening.
-- Supabase Advisor reports the new katedra_topups.user_id FK without a covering
-- index. Other new ownership FKs are already covered by PK/composite indexes.

create index if not exists katedra_topups_user_time_idx
  on public.katedra_topups (user_id, created_at desc);
