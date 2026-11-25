# 데이터베이스 및 Supabase 설치

`supabase/migrations/202611250001_initial_schema.sql`은 초기 테이블, 인덱스, RLS, 승인 사용자 전용 권한 정책 및 비공개 `wedding-private` Storage 버킷을 생성합니다. Supabase SQL Editor에서 파일 전체를 실행하세요. 앱은 별도 project UUID 설정 없이 현재 사용자의 승인된 멤버십에서 프로젝트를 찾습니다.

## 관리자 초기 설정

1. Supabase 프로젝트를 만들고 Authentication > Providers > Google에서 Google OAuth를 활성화합니다.
2. Authentication > URL Configuration의 Site URL과 Redirect URLs에 `https://<GitHub 사용자명>.github.io/<저장소명>/` 및 로컬 `http://localhost:5173/`을 추가합니다. Google Cloud OAuth 설정의 승인된 리디렉션 URI에는 Supabase가 표시하는 callback URL을 등록합니다.
3. 두 사용자가 Google로 한 번 로그인한 뒤 Authentication > Users에서 각 UUID를 확인합니다.
4. SQL Editor에서 프로젝트 한 개와 승인 멤버 둘을 생성합니다. UUID와 표시 이름은 실제 값을 사용하고 공개 저장소에 붙여넣지 마세요.

```sql
insert into public.wedding_projects (name, wedding_date, budget_target, groom_name, bride_name)
values ('Our Wedding', '2027-09-05', 0, '신랑', '신부')
returning id;
```

반환된 프로젝트 UUID와 Auth UUID를 사용해 관리자 권한으로 각각 실행합니다.

```sql
insert into public.project_members (project_id, user_id, role, display_name)
values ('<프로젝트 UUID>', '<첫 번째 Auth UUID>', 'groom', '<표시 이름>');
insert into public.project_members (project_id, user_id, role, display_name)
values ('<프로젝트 UUID>', '<두 번째 Auth UUID>', 'bride', '<표시 이름>');
```

`project_members`는 사용자가 직접 쓰거나 권한을 변경할 수 없습니다. 승인되지 않은 Google 계정은 데이터 접근을 허용받지 않습니다. 공개 가입을 끄려면 Authentication > Settings > User Signups에서 신규 가입을 비활성화하세요. Google OAuth 로그인은 provider 설정에 따라 기존 계정 로그인에도 사용됩니다.

## 초기화 데이터와 날짜 변경

승인 사용자의 첫 앱 접속 때 `initialize_wedding_defaults`가 기본 예산 카테고리와 31개 기준 체크리스트를 생성합니다. 프로젝트별 초기화 마커와 고유 키로 중복을 막고, 사용자가 삭제한 기본 항목을 다음 로그인 때 되살리지 않습니다. 예식일을 변경할 때 체크리스트 날짜 재계산에 동의하면 `save_wedding_settings`가 설정 저장과 기본 항목의 마감일 계산을 한 트랜잭션으로 처리합니다. 사용자 정의 일정/체크리스트는 변경하지 않습니다.

현재 스키마는 tasks/events/expenses/vendors의 공동 관리 기반입니다. 각 행은 project_id로 격리되고 프로젝트 간 외래키 오연결은 복합 외래키가 차단합니다. 사용자 데이터 테이블은 RLS 정책으로 보호되며, Supabase에서 실제로 실행하기 전 SQL 정책과 Storage 동작은 미검증 상태입니다.
