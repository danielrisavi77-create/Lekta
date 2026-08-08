-- Academic Suite RLS hardening for the existing Lekta commerce tables.
--
-- Lekta Supabase supports anonymous-auth semantics. The historical policies on
-- entitlements/document_slots were created without an explicit target role,
-- which Supabase Advisor flags as potentially accessible to anonymous users.
-- These tables are private account data, so read access is explicitly limited
-- to authenticated owners. Server writes remain service-role only.

alter table public.entitlements enable row level security;
alter table public.document_slots enable row level security;

drop policy if exists entitlements_select_own on public.entitlements;
create policy entitlements_select_own on public.entitlements
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists document_slots_select_own on public.document_slots;
create policy document_slots_select_own on public.document_slots
  for select to authenticated
  using ((select auth.uid()) = user_id);
