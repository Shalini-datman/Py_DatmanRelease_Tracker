-- Run this in Supabase → SQL Editor → New Query
-- Creates the releases table with all required columns

create table if not exists releases (
  id              bigint primary key,
  rn              text default '',
  summary         text not null,
  type            text default 'New Feature',
  priority        text default 'P2',
  status          text default 'Planning',
  release_planned text default '',
  release_actual  text default '',
  goal            text default '',
  team            text default 'Gateway',
  modules         jsonb default '[]',
  rn_link         text default '',
  rn_links        jsonb default '[]',
  jira_link       text default '',
  jira_links      jsonb default '[]',
  approvals       jsonb default '{}',
  approval_raw    jsonb default '{}',
  dora            jsonb default '{}',
  created_at      timestamptz default now()
);

-- Enable Row Level Security (keep data private)
alter table releases enable row level security;

-- Allow all operations from your service role key (used by Python API)
create policy "service_role_all" on releases
  for all using (true) with check (true);

-- Optional: index for fast status/date queries
create index if not exists idx_releases_status on releases(status);
create index if not exists idx_releases_actual on releases(release_actual);

-- Verify
select count(*) from releases;
