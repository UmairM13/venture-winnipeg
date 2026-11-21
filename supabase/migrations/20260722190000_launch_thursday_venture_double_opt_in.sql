begin;

alter type public.subscriber_status RENAME value 'pending_double_opt_in' TO 'pending';
alter table public.newsletter_subscribers
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists confirmation_email_id text,
  add column if not exists confirmation_error text,
  add column if not exists last_delivery_attempt_at timestamptz;

/*
 * Remove any previous status check before adding the
 * double-opt-in pending state. This is intentionally
 * defensive because the original table was created in
 * more than one migration shape during development.
 */
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid =
      'public.newsletter_subscribers'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format(
      'alter table public.newsletter_subscribers drop constraint %I',
      constraint_row.conname
    );
  end loop;
end
$$;

alter table public.newsletter_subscribers
  add constraint newsletter_subscribers_status_check
  check (
    status in (
      'pending',
      'active',
      'unsubscribed',
      'bounced',
      'complained'
    )
  );

/*
 * Existing active subscribers predate confirmation tracking.
 * Preserve them as active and mark their historical consent
 * time as the best available confirmation time.
 */
update public.newsletter_subscribers
set confirmed_at = coalesce(
  confirmed_at,
  consented_at,
  created_at,
  now()
)
where status = 'active'
  and confirmed_at is null;

create index if not exists
  newsletter_subscribers_confirmed_at_idx
  on public.newsletter_subscribers (
    confirmed_at desc
  );

create index if not exists
  newsletter_subscribers_pending_idx
  on public.newsletter_subscribers (
    last_signup_at desc
  )
  where status = 'pending';

grant select, insert, update
  on public.newsletter_subscribers
  to service_role;

comment on column
  public.newsletter_subscribers.confirmed_at is
  'Time the subscriber completed Venture double opt-in confirmation.';

comment on column
  public.newsletter_subscribers.confirmation_sent_at is
  'Time the most recent confirmation email was accepted for delivery.';

comment on column
  public.newsletter_subscribers.confirmation_error is
  'Most recent confirmation-email delivery or provider synchronization error.';

commit;

notify pgrst, 'reload schema';
