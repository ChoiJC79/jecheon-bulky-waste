-- 제천시 대형폐기물 스마트 배출·수거 관리 시스템 초기 스키마
-- Supabase PostgreSQL Migration

-- 1. 확장 기능 활성화
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- 2. 대형폐기물 신고 테이블 (reports)
create table if not exists public.reports (
    report_no text primary key,
    status text not null default 'RECEIVED' check (status in (
        'RECEIVED',             -- 접수완료 (신규)
        'ASSIGNED',             -- 수거배정완료
        'COLLECTED',            -- 수거완료
        'UNCOLLECTED',          -- 현장 미수거
        'CHANGE_REQUESTED',     -- 현장변경 요청
        'SUPPLEMENT_REQUESTED', -- 시민 보완요청
        'REJECTED'              -- 접수반려
    )),
    payment_method text not null check (payment_method in (
        'kakaopay', 'naverpay', 'tosspay', 'card', 'transfer', 'cash'
    )),
    payment_status text not null default 'COMPLETED' check (payment_status in (
        'COMPLETED',             -- 결제완료
        'PENDING_TRANSFER',      -- 계좌이체 대기
        'PENDING_CASH_RECEIPT'   -- 현금수납 대기
    )),
    address text not null,
    address_detail text not null,
    latitude double precision,
    longitude double precision,
    zone text check (zone is null or zone in ('청전·의림', '중앙·교동', '하소·영천')),
    assignee text,
    memo text,
    before_photo text,
    after_photo text,
    total_fee integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 인덱스 생성
create index if not exists idx_reports_status on public.reports (status);
create index if not exists idx_reports_zone on public.reports (zone);
create index if not exists idx_reports_assignee on public.reports (assignee);
create index if not exists idx_reports_created_at on public.reports (created_at desc);

-- 3. 품목 내역 테이블 (report_items)
create table if not exists public.report_items (
    id bigserial primary key,
    report_no text not null references public.reports (report_no) on delete cascade,
    name text not null,
    option_name text not null,
    quantity integer not null check (quantity > 0),
    unit_fee integer not null check (unit_fee >= 0)
);

create index if not exists idx_report_items_report_no on public.report_items (report_no);

-- 4. 감사 로그 테이블 (audit_logs)
create table if not exists public.audit_logs (
    id bigserial primary key,
    report_no text not null,
    action text not null,
    actor_role text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_report_no on public.audit_logs (report_no);
create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);

-- 5. RLS (Row Level Security) 설정
alter table public.reports enable row level security;
alter table public.report_items enable row level security;
alter table public.audit_logs enable row level security;

-- reports 정책: 읽기, 쓰기, 수정 허용 (API 레이어 및 클라이언트 연동)
create policy "Allow read reports for all"
    on public.reports for select
    using (true);

create policy "Allow insert reports for all"
    on public.reports for insert
    with check (true);

create policy "Allow update reports for all"
    on public.reports for update
    using (true)
    with check (true);

-- report_items 정책
create policy "Allow read report_items for all"
    on public.report_items for select
    using (true);

create policy "Allow insert report_items for all"
    on public.report_items for insert
    with check (true);

create policy "Allow delete report_items for all"
    on public.report_items for delete
    using (true);

-- audit_logs 정책
create policy "Allow read audit_logs for all"
    on public.audit_logs for select
    using (true);

create policy "Allow insert audit_logs for all"
    on public.audit_logs for insert
    with check (true);

-- 6. Storage 버킷 설정 (waste-photos)
insert into storage.buckets (id, name, public)
values ('waste-photos', 'waste-photos', true)
on conflict (id) do nothing;

-- Storage 버킷 RLS 정책: 누구나 읽기 가능, 누구나 업로드 가능
create policy "Allow public read of waste-photos"
    on storage.objects for select
    using (bucket_id = 'waste-photos');

create policy "Allow public upload to waste-photos"
    on storage.objects for insert
    with check (bucket_id = 'waste-photos');

create policy "Allow public update to waste-photos"
    on storage.objects for update
    using (bucket_id = 'waste-photos');
