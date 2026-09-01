-- In-system bug/idea reports (Goldi, 01.09: "a small icon users click to
-- report a bug or drop an idea — everything gets documented here, and later
-- we go over the ideas and decide"). Stored, not surfaced anywhere in the
    -- day-to-day UI except Settings.
create table if not exists feedback_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'באג' check (kind in ('באג','רעיון')),
  content text not null,
  screenshot_url text,
  created_by uuid references auth.users(id),
  business_unit text,
  status text not null default 'חדש' check (status in ('חדש','בטיפול','טופל','נדחה')),
  created_at timestamptz not null default now()
);

alter table feedback_reports enable row level security;

create policy feedback_select on feedback_reports for select
  using (auth.role() = 'authenticated');
create policy feedback_insert on feedback_reports for insert
  with check (auth.role() = 'authenticated');
create policy feedback_update on feedback_reports for update
  using (auth.role() = 'authenticated');

comment on table feedback_reports is 'In-system bug reports and ideas from the client team. Reviewed from Settings; intentionally NOT a nav entity.';