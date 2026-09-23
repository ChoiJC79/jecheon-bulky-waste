-- 현장 태블릿 함대: 온라인/마지막 접속, 배정 이벤트 (상시 GPS 없음)
create table if not exists public.fleet_presence (
  device_id text primary key,
  last_seen_at timestamptz not null,
  bound_at timestamptz,
  active_report_no text
);

create table if not exists public.fleet_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  device_id text,
  report_no text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fleet_events_created_at_idx on public.fleet_events (created_at desc);
create index if not exists fleet_events_device_id_idx on public.fleet_events (device_id);

alter table public.fleet_presence enable row level security;
alter table public.fleet_events enable row level security;
