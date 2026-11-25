# Our Wedding

두 사람이 결혼 준비를 함께 관리하는 한국어 모바일 우선 웹앱입니다. React, TypeScript, Vite, Tailwind CSS, Supabase를 사용하며 GitHub Pages 배포를 지원합니다.

## 빠른 시작

1. Node.js 22와 npm을 준비합니다.
2. `npm ci`를 실행합니다.
3. `.env.example`을 참고해 `.env.local`을 만들고 Supabase URL 및 Publishable Key를 입력합니다.
4. `npm run dev`로 개발 서버를 실행합니다.
5. Supabase 미설정 시 앱은 **이 브라우저에만 저장되는 데모 모드**로 실행됩니다. 데모 데이터는 다른 기기와 공유되지 않으며 서비스 데이터가 아닙니다.

## 주요 문서

- [구현 계획](./PROJECT_PLAN.md)
- [데이터베이스 및 초기 설치 SQL](./DATABASE_SCHEMA.md)
- [배포 및 Supabase 설정](./DEPLOYMENT_GUIDE.md)
- [보안 및 개인정보 안내](./SECURITY.md)
- [변경 이력](./CHANGELOG.md)

## 현재 범위

Phase 1의 앱 기반, Google 로그인/승인된 프로젝트 멤버 게이트, 홈, 체크리스트, 일정, 예산, 업체 및 GitHub Pages/PWA 빌드 기반을 구현합니다. 미완료 기능은 `PROJECT_PLAN.md`에 정확히 표시합니다. 현재 외부 Supabase 설정과 GitHub Pages 배포는 관리자가 설정한 뒤 수행해야 합니다.
