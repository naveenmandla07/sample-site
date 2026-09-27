create table public.contact_otp_challenges (
  contact text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  last_sent_at timestamptz not null,
  verified_at timestamptz,
  verification_token_hash text
);

alter table public.contact_otp_challenges enable row level security;
revoke all on public.contact_otp_challenges from anon, authenticated;

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  contact text not null,
  name text not null,
  company text not null default '',
  project text not null,
  created_at timestamptz not null default now()
);

alter table public.contact_requests enable row level security;
revoke all on public.contact_requests from anon, authenticated;

create or replace function public.issue_contact_otp(
  p_contact text,
  p_code_hash text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  issued boolean;
begin
  insert into public.contact_otp_challenges as existing (
    contact, code_hash, expires_at, attempts, last_sent_at, verified_at, verification_token_hash
  ) values (
    p_contact, p_code_hash, p_expires_at, 0, pg_catalog.now(), null, null
  )
  on conflict (contact) do update set
    code_hash = excluded.code_hash,
    expires_at = excluded.expires_at,
    attempts = 0,
    last_sent_at = excluded.last_sent_at,
    verified_at = null,
    verification_token_hash = null
  where existing.last_sent_at <= pg_catalog.now() - interval '60 seconds'
  returning true into issued;

  return coalesce(issued, false);
end;
$$;

create or replace function public.verify_contact_otp(
  p_contact text,
  p_code_hash text,
  p_verification_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_valid boolean;
begin
  update public.contact_otp_challenges
  set attempts = attempts + 1,
      verified_at = case when code_hash = p_code_hash then pg_catalog.now() else null end,
      verification_token_hash = case when code_hash = p_code_hash then p_verification_token_hash else null end
  where contact = p_contact
    and expires_at > pg_catalog.now()
    and attempts < 5
  returning (code_hash = p_code_hash) into is_valid;

  return coalesce(is_valid, false);
end;
$$;

create or replace function public.submit_verified_contact_request(
  p_contact text,
  p_verification_token_hash text,
  p_name text,
  p_company text,
  p_project text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_contact text;
  request_id uuid;
begin
  delete from public.contact_otp_challenges
  where contact = p_contact
    and verification_token_hash = p_verification_token_hash
    and verified_at > pg_catalog.now() - interval '10 minutes'
  returning contact into verified_contact;

  if verified_contact is null then
    return null;
  end if;

  insert into public.contact_requests (contact, name, company, project)
  values (verified_contact, p_name, p_company, p_project)
  returning id into request_id;

  return request_id;
end;
$$;

revoke all on function public.issue_contact_otp(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.verify_contact_otp(text, text, text) from public, anon, authenticated;
revoke all on function public.submit_verified_contact_request(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.issue_contact_otp(text, text, timestamptz) to service_role;
grant execute on function public.verify_contact_otp(text, text, text) to service_role;
grant execute on function public.submit_verified_contact_request(text, text, text, text, text) to service_role;