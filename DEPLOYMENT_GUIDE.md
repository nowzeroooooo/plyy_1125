# 배포 및 외부 서비스 설정

## GitHub Pages

1. 저장소 Settings > Secrets and variables > Actions > Variables에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`를 등록합니다. 이 Publishable Key는 브라우저에 포함되므로 권한은 RLS로 보호해야 합니다. `service_role`/Secret Key 또는 OAuth 비밀키는 절대 등록하거나 노출하지 마세요.
2. Settings > Actions > General에서 저장소 정책이 `GITHUB_TOKEN`의 `contents: write`를 허용하는지 확인합니다. workflow는 배포 job에만 해당 권한을 부여합니다.
3. 변경사항을 `main`에 병합하면 자동 배포됩니다. 또는 Actions > Deploy Our Wedding > Run workflow에서 `main`을 선택해 수동 실행할 수 있습니다. 타입 검사, ESLint, 테스트, 빌드가 모두 성공해야 배포하며 Pull Request는 브랜치를 수정하지 않고 검증만 수행합니다.
4. 첫 배포 후 저장소에 `gh-pages` 브랜치가 생성됐는지 확인합니다. Settings > Pages > Build and deployment > Source에서 **Deploy from a branch**, Branch `gh-pages`, 폴더 `/(root)`를 선택하고 Save를 누릅니다.
5. workflow는 `dist`만 `gh-pages` 브랜치에 orphan commit으로 게시하고 `.nojekyll`을 포함합니다. 빌드 job 전달용 임시 artifact는 하루 뒤 삭제됩니다. 배포 브랜치에는 빌드 파일만 저장됩니다.
6. 프로젝트 사이트 URL은 `https://<GitHub 사용자명>.github.io/<저장소명>/` 형식입니다. 첫 배포와 Pages 설정이 완료되기 전에는 실제 접속 여부를 확인할 수 없습니다.

Vite는 Actions의 `GITHUB_REPOSITORY`에서 프로젝트 하위 경로를 계산하며 `plyy_1125` 저장소는 `/plyy_1125/`를 사용합니다. `<사용자명>.github.io` 저장소는 루트 경로로 배포합니다. 라우팅은 HashRouter라 서버 rewrite가 필요하지 않습니다.

## 로컬 개발 및 데모

`.env.local`에 Supabase 값이 없으면 로컬 전용 데모 모드가 표시됩니다. 데모 데이터는 브라우저 localStorage에 저장되므로 해당 브라우저에서만 보이고, 실계정 서비스 데이터와 연결되지 않습니다. 실제 Google OAuth / 공동 데이터는 Supabase를 구성해야 작동합니다.

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

Supabase Project Settings > API에서 Project URL과 Publishable key를 확인합니다. 환경 변수는 빌드 시 포함됩니다. GitHub Actions에서 배포 변수 누락 시 명시적인 안내와 함께 실패합니다.

## Supabase 무료 운영 참고

무료 요금제의 한도·중지 정책은 변경될 수 있으므로 Supabase 공식 가격 및 프로젝트 대시보드에서 최신 내용을 확인하세요. 무료 프로젝트가 일시 중지된 경우 Supabase Dashboard에서 해당 프로젝트를 선택해 Resume/복구 메뉴를 확인하고, 백업·보존 정책 및 복구 가능 여부를 먼저 확인하세요. 무료 플랜으로 상시 가동이나 복구 시간을 보장할 수 없습니다.

## iPhone PWA

Safari에서 배포 URL을 열고 공유 > 홈 화면에 추가를 누릅니다. PWA는 정적 앱 리소스만 사전 캐시하며 인증, Supabase 응답, 개인 데이터/첨부파일은 캐시하지 않습니다. 오프라인 데이터 편집은 지원하지 않습니다.
