-- Supabase Vault holds the same 256-bit secret configured on Vercel.
-- This avoids embedding secrets in repository files or exposing them in JWTs.
-- The secret itself is provisioned separately using vault.create_secret().
-- Only the Edge Function's service-role context may invoke this verifier.
create or replace function public.verify_leaderboard_country_proof(
  p_run_id uuid,
  p_proof text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match text[];
  v_issued_seconds bigint;
  v_now_seconds bigint;
  v_payload text;
  v_secret text;
  v_expected_signature text;
begin
  if p_run_id is null or p_proof is null or length(p_proof) > 160 then
    return null;
  end if;

  v_match := pg_catalog.regexp_match(
    p_proof,
    '^v1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Z]{2})\.([0-9]{10})\.([a-f0-9]{64})$'
  );
  if v_match is null or v_match[1] <> p_run_id::text then
    return null;
  end if;

  v_issued_seconds := v_match[3]::bigint;
  v_now_seconds := pg_catalog.extract(epoch from pg_catalog.clock_timestamp())::bigint;
  -- Proof lasts 5 minutes, allowing at most 30 seconds of clock skew.
  if v_issued_seconds > v_now_seconds + 30
     or v_now_seconds - v_issued_seconds > 300 then
    return null;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'leaderboard_geo_hmac'
  limit 1;
  if v_secret is null or length(v_secret) < 32 then
    return null;
  end if;

  v_payload := 'v1.' || v_match[1] || '.' || v_match[2] || '.' || v_match[3];
  v_expected_signature := pg_catalog.encode(
    extensions.hmac(v_payload, v_secret, 'sha256'), 'hex'
  );
  if v_match[4] <> v_expected_signature then
    return null;
  end if;

  return v_match[2];
end;
$$;

revoke all on function public.verify_leaderboard_country_proof(uuid,text)
  from public, anon, authenticated;
grant execute on function public.verify_leaderboard_country_proof(uuid,text)
  to service_role;
