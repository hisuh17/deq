-- DumEQ response-set storage. Apply after schema.sql; legacy aggregate data is unchanged.
-- v2 (checkbox) and v3 (explicit start button) consent authorise complete response sets.
-- Keep v2 accepted for already-open pages; never relabel earlier consent records.
create schema if not exists private;

create table if not exists private.dumeq_responses (
  id uuid primary key default gen_random_uuid(),
  deletion_hash text not null unique check (deletion_hash ~ '^[a-f0-9]{64}$'),
  answer_values smallint[] not null check (
    array_ndims(answer_values) = 1 and array_lower(answer_values, 1) = 1
    and cardinality(answer_values) = 19
    and array_position(answer_values, null) is null
    and 0 <= all(answer_values) and 5 >= all(answer_values)
  ),
  questionnaire_version text not null check (questionnaire_version = 'deq-19-v1'),
  consent_version text not null check (consent_version in ('2026-09-17-v2', '2026-09-17-v3')),
  explicit_consent boolean not null check (explicit_consent),
  consent_date date not null default (now() at time zone 'UTC')::date,
  expires_on date not null default (((now() at time zone 'UTC')::date + interval '12 months')::date)
);

alter table private.dumeq_responses drop constraint if exists dumeq_responses_consent_version_check;
alter table private.dumeq_responses add constraint dumeq_responses_consent_version_check
  check (consent_version in ('2026-09-17-v2', '2026-09-17-v3'));

-- Contains no answers. Blocks delayed requests/retries from recreating a deleted response.
create table if not exists private.dumeq_withdrawals (
  deletion_hash text primary key check (deletion_hash ~ '^[a-f0-9]{64}$'),
  expires_on date not null default (((now() at time zone 'UTC')::date + interval '12 months')::date)
);
create index if not exists dumeq_responses_expiry on private.dumeq_responses(expires_on);
create index if not exists dumeq_withdrawals_expiry on private.dumeq_withdrawals(expires_on);
alter table private.dumeq_responses enable row level security;
alter table private.dumeq_withdrawals enable row level security;
revoke all on private.dumeq_responses, private.dumeq_withdrawals from public, anon, authenticated, service_role;

create or replace function private.store_dumeq_response(
  answer_values smallint[], questionnaire_version text, consent_version text,
  explicit_consent boolean, deletion_code text
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  code_hash text;
begin
  -- No accounts are used. Only the dedicated public visitor role can invoke this capability.
  if current_setting('role', true) is distinct from 'anon' or auth.uid() is not null then
    raise exception 'Public visitor submissions only';
  end if;
  if explicit_consent is distinct from true
     or questionnaire_version is distinct from 'deq-19-v1'
     or consent_version is null
     or consent_version not in ('2026-09-17-v2', '2026-09-17-v3') then
    raise exception 'Current explicit consent is required';
  end if;
  if answer_values is null or array_ndims(answer_values) is distinct from 1
     or array_lower(answer_values, 1) is distinct from 1
     or cardinality(answer_values) <> 19
     or array_position(answer_values, null) is not null
     or not (0 <= all(answer_values) and 5 >= all(answer_values)) then
    raise exception 'Exactly 19 integer answers from 0 to 5 are required';
  end if;
  if deletion_code is null or deletion_code !~ '^[a-f0-9]{64}$' then
    raise exception 'A valid deletion code is required';
  end if;
  code_hash := encode(extensions.digest(deletion_code, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(code_hash, 0));
  if exists(select 1 from private.dumeq_withdrawals w where w.deletion_hash = code_hash) then
    raise exception 'This response has been withdrawn';
  end if;
  if exists(select 1 from private.dumeq_responses r where r.deletion_hash = code_hash
            and r.answer_values is distinct from store_dumeq_response.answer_values) then
    raise exception 'This code has already been used for another response';
  end if;
  insert into private.dumeq_responses
    (deletion_hash, answer_values, questionnaire_version, consent_version, explicit_consent)
  values (code_hash, answer_values, questionnaire_version, consent_version, true)
  on conflict (deletion_hash) do nothing;
  return 'saved';
end;
$$;

create or replace function public.submit_dumeq_response(
  answer_values smallint[], questionnaire_version text, consent_version text,
  explicit_consent boolean, deletion_code text
)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'anon' then raise exception 'Public visitor submissions only'; end if;
  return private.store_dumeq_response(answer_values, questionnaire_version, consent_version, explicit_consent, deletion_code);
end;
$$;

create or replace function private.remove_dumeq_response(deletion_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  code_hash text;
begin
  if current_setting('role', true) is distinct from 'anon' or auth.uid() is not null then
    raise exception 'Public visitor requests only';
  end if;
  if deletion_code is null or deletion_code !~ '^[a-f0-9]{64}$' then
    raise exception 'A valid deletion code is required';
  end if;
  code_hash := encode(extensions.digest(deletion_code, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(code_hash, 0));
  insert into private.dumeq_withdrawals(deletion_hash) values(code_hash)
    on conflict (deletion_hash) do nothing;
  delete from private.dumeq_responses r where r.deletion_hash = code_hash;
  -- Same response whether or not a row existed; no response data is exposed.
  return 'deleted';
end;
$$;

create or replace function public.delete_dumeq_response(deletion_code text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  if current_user <> 'anon' then raise exception 'Public visitor requests only'; end if;
  return private.remove_dumeq_response(deletion_code);
end;
$$;

revoke all on function private.store_dumeq_response(smallint[], text, text, boolean, text) from public, anon, authenticated, service_role;
revoke all on function private.remove_dumeq_response(text) from public, anon, authenticated, service_role;
revoke all on function public.submit_dumeq_response(smallint[], text, text, boolean, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_dumeq_response(text) from public, anon, authenticated, service_role;
grant usage on schema private to anon;
grant execute on function private.store_dumeq_response(smallint[], text, text, boolean, text) to anon;
grant execute on function private.remove_dumeq_response(text) to anon;
grant execute on function public.submit_dumeq_response(smallint[], text, text, boolean, text) to anon;
grant execute on function public.delete_dumeq_response(text) to anon;

create extension if not exists pg_cron;
select cron.schedule('dumeq-response-retention', '5 0 * * *', $job$
  delete from private.dumeq_responses where expires_on <= (now() at time zone 'UTC')::date;
  delete from private.dumeq_withdrawals where expires_on <= (now() at time zone 'UTC')::date;
$job$);

comment on table private.dumeq_responses is 'One complete 19-answer set per consenting submission; no direct identifiers or exact timestamps. Not academic research data.';
comment on table private.dumeq_withdrawals is 'Deletion-code hashes only; prevents late network retries from recreating withdrawn responses. Expires after 12 months.';
notify pgrst, 'reload schema';
