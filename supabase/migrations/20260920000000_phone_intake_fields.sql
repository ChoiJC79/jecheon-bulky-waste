-- 사무실 전화 접수: 신고자 연락처와 접수 경로
alter table public.reports
  add column if not exists citizen_name text;

alter table public.reports
  add column if not exists citizen_phone text;

alter table public.reports
  add column if not exists channel text default 'WEB';
