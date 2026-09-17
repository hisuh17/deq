-- DEQ community totals schema.
-- Stores aggregate counts only. It does not store a row per respondent.

create schema if not exists private;

create table if not exists public.deq_answer_counts (
  question_index smallint not null check (question_index between 1 and 19),
  answer_value smallint not null check (answer_value between 0 and 5),
  response_count bigint not null default 0 check (response_count >= 0),
  primary key (question_index, answer_value)
);

create table if not exists public.deq_totals (
  singleton boolean primary key default true check (singleton),
  submissions bigint not null default 0 check (submissions >= 0)
);

insert into public.deq_answer_counts (question_index, answer_value)
select question_index, answer_value
from generate_series(1, 19) as question_index
cross join generate_series(0, 5) as answer_value
on conflict (question_index, answer_value) do nothing;

insert into public.deq_totals (singleton, submissions)
values (true, 0)
on conflict (singleton) do nothing;

alter table public.deq_answer_counts enable row level security;
alter table public.deq_totals enable row level security;

revoke all on table public.deq_answer_counts from public, anon, authenticated;
revoke all on table public.deq_totals from public, anon, authenticated;

create or replace function private.increment_deq_counts(answer_values smallint[])
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item_index integer;
  updated_total bigint;
begin
  if coalesce(array_length(answer_values, 1), 0) <> 19
     or array_lower(answer_values, 1) <> 1 then
    raise exception 'Exactly 19 answers are required';
  end if;

  for item_index in 1..19 loop
    if answer_values[item_index] is null
       or answer_values[item_index] < 0
       or answer_values[item_index] > 5 then
      raise exception 'Every answer must be an integer from 0 to 5';
    end if;

    update public.deq_answer_counts
    set response_count = response_count + 1
    where question_index = item_index
      and answer_value = answer_values[item_index];

    if not found then
      raise exception 'Answer-count cell is missing';
    end if;
  end loop;

  update public.deq_totals
  set submissions = submissions + 1
  where singleton
  returning submissions into updated_total;

  return updated_total;
end;
$$;

revoke all on function private.increment_deq_counts(smallint[]) from public;
grant usage on schema private to anon;
grant execute on function private.increment_deq_counts(smallint[]) to anon;

create or replace function public.submit_deq_response(
  answer_values smallint[],
  questionnaire_version text,
  consent_version text
)
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if current_user <> 'anon' then
    raise exception 'Anonymous public submissions only';
  end if;

  if questionnaire_version <> 'deq-19-v1'
     or consent_version <> '2026-09-17-v1' then
    raise exception 'Unsupported questionnaire or consent version';
  end if;

  return private.increment_deq_counts(answer_values);
end;
$$;

revoke all on function public.submit_deq_response(smallint[], text, text) from public, authenticated;
grant execute on function public.submit_deq_response(smallint[], text, text) to anon;

comment on table public.deq_answer_counts is
  'Aggregate DEQ answer counts only; no individual response rows.';
comment on function public.submit_deq_response(smallint[], text, text) is
  'Validates one complete DEQ-19 response and immediately increments aggregate counts.';
