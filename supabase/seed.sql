-- 제천시 대형폐기물 시스템 초기 시드 데이터 (supabase/seed.sql)

INSERT INTO public.reports (
    report_no, status, payment_method, payment_status,
    address, address_detail, latitude, longitude,
    zone, assignee, memo, total_fee, created_at, updated_at
) VALUES
(
    'JC-20260914-000101', 'RECEIVED', 'card', 'COMPLETED',
    '충청북도 제천시 의병대로 123 (청전동)', '101동 앞 분리수거장 옆',
    37.1425, 128.2114, '청전·의림', NULL, NULL, 5000,
    now() - interval '2 hours', now() - interval '2 hours'
),
(
    'JC-20260914-000102', 'ASSIGNED', 'kakaopay', 'COMPLETED',
    '충청북도 제천시 중앙로 45 (중앙동)', '상가 뒤편 골목길 전신주 앞',
    37.1350, 128.2080, '중앙·교동', '이청소 (2호차·중앙교동)', NULL, 12000,
    now() - interval '5 hours', now() - interval '1 hour'
),
(
    'JC-20260914-000103', 'COLLECTED', 'naverpay', 'COMPLETED',
    '충청북도 제천시 용두대로 78 (하소동)', '주공아파트 3단지 주차장 입구',
    37.1290, 128.1920, '하소·영천', '박자원 (3호차·하소영천)', NULL, 8000,
    now() - interval '1 day', now() - interval '3 hours'
),
(
    'JC-20260914-000104', 'UNCOLLECTED', 'card', 'COMPLETED',
    '충청북도 제천시 칠성로 12 (교동)', '주택 대문 앞',
    37.1390, 128.2150, '중앙·교동', '이청소 (2호차·중앙교동)', '배출 장소에 폐기물이 나와있지 않음', 3000,
    now() - interval '8 hours', now() - interval '2 hours'
),
(
    'JC-20260914-000105', 'CHANGE_REQUESTED', 'cash', 'PENDING_CASH_RECEIPT',
    '충청북도 제천시 의림대로 300 (모산동)', '의림지 솔밭공원 입구 관리실 옆',
    37.1720, 128.2250, '청전·의림', '김수거 (1호차·청전의림)', '규격 상이(신고된 것보다 규격이 큼, 2인용 소파 -> 4인용)', 5000,
    now() - interval '4 hours', now() - interval '30 minutes'
);

INSERT INTO public.report_items (report_no, name, option_name, quantity, unit_fee) VALUES
('JC-20260914-000101', '의자', '회전의자', 1, 5000),
('JC-20260914-000102', '소파', '3인용 이상', 1, 12000),
('JC-20260914-000103', '책상', '양수책상(서랍 양쪽)', 1, 8000),
('JC-20260914-000104', '선풍기', '소형/스탠드', 1, 3000),
('JC-20260914-000105', '소파', '2인용', 1, 5000);

INSERT INTO public.audit_logs (report_no, action, actor_role, created_at) VALUES
('JC-20260914-000101', 'REPORT_CREATED', 'CITIZEN', now() - interval '2 hours'),
('JC-20260914-000102', 'REPORT_CREATED', 'CITIZEN', now() - interval '5 hours'),
('JC-20260914-000102', 'ASSIGNED', 'RECEPTION', now() - interval '1 hour'),
('JC-20260914-000103', 'REPORT_CREATED', 'CITIZEN', now() - interval '1 day'),
('JC-20260914-000103', 'ASSIGNED', 'RECEPTION', now() - interval '18 hours'),
('JC-20260914-000103', 'COLLECTED', 'FIELD', now() - interval '3 hours'),
('JC-20260914-000104', 'REPORT_CREATED', 'CITIZEN', now() - interval '8 hours'),
('JC-20260914-000104', 'ASSIGNED', 'RECEPTION', now() - interval '4 hours'),
('JC-20260914-000104', 'UNCOLLECTED', 'FIELD', now() - interval '2 hours'),
('JC-20260914-000105', 'REPORT_CREATED', 'CITIZEN', now() - interval '4 hours'),
('JC-20260914-000105', 'ASSIGNED', 'RECEPTION', now() - interval '2 hours'),
('JC-20260914-000105', 'CHANGE_REQUESTED', 'FIELD', now() - interval '30 minutes');
