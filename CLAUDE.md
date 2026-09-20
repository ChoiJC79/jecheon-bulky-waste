# Claude Code 작업 인수인계

## 프로젝트 목적

제천시 대형폐기물 신고를 시민·접수 담당자·현장 수거 담당자·최종 담당자가 함께 처리하는 위치기반 관리 시스템으로 구현한다.


## 시스템 아키텍처 (GitHub - Supabase - Vercel)

1. **저장소 및 CI/CD (GitHub)**:
   - Git 리포지토리: `ChoiJC79/jecheon-bulky-waste`
   - Vercel과 GitHub 연동을 통한 자동 배포

2. **데이터베이스 및 스토리지 (Supabase)**:
   - PostgreSQL RLS 기반 테이블:
     - `reports`: 대형폐기물 신고 메인 내역 (배출위치, 상태, 수거구역, 담당자 등)
     - `report_items`: 품목 내역 (품목명, 규격옵션, 수량, 수수료)
     - `audit_logs`: 상태 변경 및 작업 감사 로그
   - Storage 버킷:
     - `waste-photos`: 배출 전 사진, 수거 완료 사진, 미수거/현장변경 증빙 사진 저장 (Public URL)
   - 스키마 마이그레이션: `supabase/migrations/20260914000000_initial_schema.sql`
   - 시드 데이터: `supabase/seed.sql`

3. **호스팅 및 서버리스 API (Vercel)**:
   - 정적 프론트엔드 호스팅:
     - `index.html`: 시민 배출신고 웹 앱 (스마트 품목검색, 지도 위치지정, 사진촬영, 접수증)
     - `staff.html`: 내부 접수·배정 및 데이터 검증 대시보드
     - `tablet.html`: 현장 수거 기사 전용 모바일/태블릿 웹 앱 (길찾기, 완료/미수거/변경요청)
   - Serverless Functions (`api/`):
     - `GET/POST /api/reports`: 목록 조회 및 신규 신고 접수
     - `GET /api/reports/[reportNo]`: 신고 건별 상세 조회
     - `PATCH /api/reports/[reportNo]/status`: 배정, 완료, 미수거, 변경요청, 수납확인 처리
     - `GET /api/reports/export.csv`: 정합성 검증용 CSV 다운로드
     - `GET /api/verification`: 데이터 정합성 검증 집계 API
     - `GET /api/staff-assignees`: 수거구역 및 차량 담당자 목록
     - `GET /api/payment-account`: 계좌이체 수납 계좌 안내
     - `GET /api/health`: 헬스체크

4. **로컬 개발 및 테스트 호환성**:
   - `server.mjs`: 로컬 개발용 Node.js HTTP 서버 (Supabase 환경변수 감지 시 Supabase 연동, 미설정 시 로컬 SQLite 자동 폴백)

## 반드시 지킬 기준

- 외부 시민 서비스와 새올행정망 내부 시스템을 직접 DB 연결하지 않는다.
- 수거자의 상시 위치추적과 이동경로 저장을 구현하지 않는다.
- 현장 위치는 작업 건을 열거나 처리할 때만 사용한다.
- 최종 담당자에게 임의 SQL 실행 또는 DB 쓰기 권한을 제공하지 않는다.
- 카드번호나 계좌 비밀번호를 저장하지 않는다.

## 실행과 검증

```bash
# 로컬 개발 서버 실행
npm run dev

# 단위 및 기능 테스트 (10개 테스트 스위트)
npm test

# Vercel 로컬 개발 시뮬레이션
npx vercel dev
```

## 기준 문서

- `README.md`: 프로젝트 전체 개요 및 Supabase-Vercel 배포 가이드
- `docs/00-프로젝트-컨텍스트.md`
- `docs/01-망분리와-내부업무-설계.md`
- `docs/02-역할분담-개발백로그.md`
- `docs/03-대형폐기물-품목선택-설계.md`

