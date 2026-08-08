-- Advisor lint 0028: makni default PUBLIC/anon execute na security-definer RPC-u.
-- Anon ionako ne pogadja nijedan red (fn ima where user_id=auth.uid()), a email-link odjava
-- ide direktnim service-role updateom u unsubscribe-reminder edge fn, ne preko ovog RPC-a.
-- Pristup zadrzava samo prijavljeni korisnik (grant ispod).
revoke execute on function unsubscribe_own_deadline_subscription(uuid) from public, anon;
grant execute on function unsubscribe_own_deadline_subscription(uuid) to authenticated;;
