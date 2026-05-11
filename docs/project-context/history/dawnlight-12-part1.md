# dawnlight-12 — 2026-05-09 작업 일지 (Part 1)

> 이 파일은 새벽빛 길드 모바일 앱/홈페이지 작업의 2026-05-09 세션 기록입니다.
> Part 1: 멘션 시스템 / deep-link 정밀 스크롤 / AuthModal / 아이콘 / 우주 컨셉 회귀
> Part 2: 키보드 마라톤 (Phase 1~12) — 미해결 상태로 인계
> Part 3: 핵심 학습 + PENDING

---

## 시간순 작업 목록

---

### 1-1. [공통] 마음 들여다보기 배너 dl2 톤 복구

**한 줄 요약**: /guild-test 진입 배너를 cosmic 폐기 후 dl2 톤으로 신규 제작

**관련 파일**:
- 메인 위젯 (마음 들여다보기 배너)

**배경**: cosmic 톤이 폐기되면서 이 배너가 톤 깨진 상태. dl2 톤으로 통일 필요.

**오류 / 함정**:
- 4번의 디자인 시행착오 발생
- 결국 기존 /guild-test 페이지에서 사용 중이던 초승달 자산 재사용 패턴으로 확정
- **학습**: 새 자산 만들지 말고 이미 살아있는 자산 재사용이 더 빠름

---

### 1-2. [홈페이지] 제안 게시판 헤더 정렬

**한 줄 요약**: 제안 게시판 헤더 중앙 정렬 → 왼쪽 정렬 (다른 게시판과 통일)

**관련 파일**: 제안 게시판 페이지

**배경**: 다른 게시판들은 왼쪽 정렬인데 제안만 중앙 정렬이라 통일성 깨짐.

---

### 1-3. [공통] 브레드크럼 dl2 톤 정비

**한 줄 요약**: 모든 게시판/미니홈피 브레드크럼을 cosmic → dl2 톤으로 통일

**관련 파일**: 게시판/미니홈피 브레드크럼 컴포넌트

---

### 1-4. [공통] 오늘의 항해자 logActivity 누락 fix

**한 줄 요약**: 키워드 선물/유리병 쪽지가 최신현황에 안 뜨던 문제 — TodaysVoyager에 logActivity 호출 추가

**관련 파일**:
- 앱: TodaysVoyager 컴포넌트
- 홈피: TodaysVoyager 컴포넌트

**배경**: 키워드/쪽지 흐름이 활동 기록되지 않아 최신현황에 안 뜸.

**오류 / 함정**:
- logActivity 호출이 누락되어 있었음 (기존 작업 시 빠뜨림)
- 양 레포 모두 동일하게 누락 → 양쪽 동시 수정

---

### 1-5. [앱] 길드원 '나슈타' 길탈 처리

**한 줄 요약**: 나슈타 길드원 탈퇴 처리 (백업 후 데이터 정리)

**관련 파일**: scripts/delete-nashuta.mjs

**배경**: 길탈 신청. core-learnings 7-6 (길탈 처리 패턴 재사용).

**결정 사항**: 백업 → batch 삭제 → backups/nashuta-2026-05-09/ 보존

---

### 1-6. [공통] @닉네임 멘션 시스템 구축 (대규모)

**한 줄 요약**: 채팅/게시판/공지/앨범/미니홈피/제안 등 12곳에 @닉네임 멘션 자동완성 + 강제 푸시 + 강조 표시 시스템 구축

**관련 파일**:
- 인프라 (양 레포 동시):
  - `src/lib/mentions.ts` — 멘션 파싱/매칭 라이브러리
  - `src/components/MentionPicker.tsx` — 자동완성 UI
  - `src/components/MentionText.tsx` — 강조 표시
  - `src/lib/useMentionCandidates.ts` — 후보 hook
- Functions:
  - `functions/src/categories.ts` — "mention" 카테고리 추가
  - `functions/src/lib/recipients.ts` — forceSend 옵션
  - `functions/src/triggers/mention.ts` — 신규 451줄 (멘션 트리거)
  - `functions/.gitignore` — `lib/` → `/lib/` 수정 (src/lib/ 추적되도록)
- 채팅 (Phase 4):
  - 앱: `src/components/FloatingChat.tsx`
  - 웹: `app/components/redesign/FloatingChat.tsx`
- 게시판 (Phase 5-1):
  - 본문/댓글/공지 본문 (PostBody 활용)
  - 정렬: 영문 우선 → 한글, @우리길원들 맨 위 고정 (isHangulStart 헬퍼)

**배경**: 길드원들이 댓글/채팅에서 특정인 호출하기 어려움. 표준 멘션 시스템 구축.

**결정 사항**:
- 적용 10곳: 채팅 / 앨범본문(캡션) / 앨범댓글 / 게시판본문 / 게시판댓글 / 공지본문 / 제안본문 / 미니홈피방명록(인라인) / 미니홈피사진본문 / 미니홈피사진댓글
- 자동완성 UI, @우리길원들 hardcode, 강제 푸시(forceSend), 색깔+굵게 강조
- mention 카테고리 신규
- 자기 자신 제외, 1글-1대상-1푸시 dedupe
- @우리길원들 + @개별닉 동시 시: 우리길원들 fan-out만 발사
- 정렬: 영문 우선 → 한글, @우리길원들 맨 위 고정
- 닉네임 변경 시 stale mention 그대로 둠
- 제안 본문: schema 분리 (title + description) 옵션 A 채택, backfill 안 함

**진행 상황**:
- ✅ Phase 1+2: 인프라 라이브러리 (양 레포 + functions)
- ✅ Phase 3+6: activity rewriter + 멘션 트리거
- ✅ Phase 4: 채팅 (FloatingChat 양 레포)
- ✅ Phase 5-1: 게시판 본문+댓글+정렬
- ⏸️ **Phase 5-2 PENDING: 앨범 본문 + 앨범 댓글**
- ⏸️ **Phase 5-3 PENDING: 미니홈피 (방명록 인라인 + 사진 본문/댓글)**
- ⏸️ **Phase 5-4 PENDING: 제안 본문 (schema 분리 동반)**
- ⏸️ 공지 댓글 / 제안 댓글 인프라는 별도 라운드 (이번 세션 제외)

**오류 / 함정** ⭐:

#### 함정 1: 웹 멘션 dead code 통합 (Phase 4 채팅)
- **증상**: Phase 4에서 웹 멘션 통합 후 운영 채팅에 반영 안 됨 (commit 4번 박았는데도)
- **진단 에이전트가 처음 가리킨 파일**: `app/components/GuildChat.tsx:346`
- **헛다리 짚은 것**: GuildChat.tsx에 통합 코드 박았으나 dead code였음 (어디서도 import X)
- **진짜 원인**: 진짜 운영 컴포넌트는 `app/components/redesign/FloatingChat.tsx` (`app/layout.tsx`에서 import)
- **해결**: import 그래프 grep으로 호출 사이트 검증 후 redesign/FloatingChat.tsx에 통합
- **학습** (core-learnings 7-10):
  - 통합 작업 전 import 그래프 verbatim 확인 강제
  - 빌드 산출물에 string literal grep으로 운영 반영 검증
  - 함수 이름은 mangle되지만 한글/고유 문자열은 보존됨

#### 함정 2: Vercel 빌드 4연속 실패 (React 19 JSX 네임스페이스)
- **증상**: 멘션 commit cd317f3, 0eae75a, fa18d8f, e235e28 모두 Vercel 빌드 실패
- **진짜 원인**: React 19에서 글로벌 JSX 네임스페이스 제거됨
- **해결**: `import type { JSX } from "react"` 한 줄 추가 (commit c533f9d)

---

### 1-7. [공통] 게시판 댓글 deep-link 정밀 스크롤 fix

**한 줄 요약**: 게시판 댓글 deep-link 시 정밀 위치 스크롤 (앨범/미니홈피와 동일 패턴)

**관련 파일**:
- 앱: `app/(tabs)/board.tsx` (+42 -20)
- 웹: `app/board/[id]/page.tsx` (+25 -13)

**배경**:
- 진단: 앨범/미니홈피사진/방명록 자동 작동, 게시판 댓글만 미완성
- AlbumPhotoViewer.tsx:737-769 패턴 차용 (cancelled flag + tryScroll 재귀 + landed 봉인)
- 푸시 + 최신현황이 navigateLink 공유라 한 fix로 양쪽 커버

**해결 패턴**:
- useFocusEffect cleanup으로 ref 리셋
- multi-retry land 후 cancel (core-learnings 2-4)
- attempt >= 8 한도 (200ms × 8 = 1.6s + 초기 100ms)

**OTA 발사**:
- 앱 Android preview: 7b079f4c-e365-4ed4-b0f4-31d7f4d08146
- 앱 iOS production: 46b006d5-b65d-47aa-ae7c-a1a76bada381
- 웹 main: 41ed2e2..f4b4b9f

**검증**: 자연스럽게 발생할 때 검증 (이번 세션에서는 검증 시간 없어서 보류)

---

### 1-8. [앱] AuthModal dl2 디자인 + 중앙 정렬

**한 줄 요약**: 로그인 모달을 cosmic 톤 → dl2 톤으로 리뉴얼 + 화면 중앙 정렬

**관련 파일**:
- 앱: `src/components/AuthModal.tsx` (+9 -1)
- 웹: `app/components/redesign/TopHeader.tsx` (+8 -0)

**배경**: dl2 풀공개 후 AuthModal만 cosmic 톤이라 어색.

**진행**:
- 디자인 톤 변경 (rgba(42,31,74,0.95) + lavender hairline + sunsetGold pill)
- 중앙 정렬: closeArea justifyContent "flex-start" → "center"
- 웹: `alignItems: "safe center"` inline (Tailwind v4 cascade 회피 위해 인라인 specificity)

**오류 / 함정**:
- 중앙 정렬 작업 시 사용자가 키보드 가림 동작 보호 명시 (별도 cmd 진행 중인 키보드 fix 결과 침해 X)
- 디자인 + 중앙 정렬 두 단계로 나눠서 작업

---

### 1-9. [앱] dl2 로그인 버튼 누락 fix

**한 줄 요약**: dl2 풀공개 시 누락된 로그인 버튼을 dl2 Topbar에 추가

**관련 파일**:
- 앱: `src/components/dawnlight2/Topbar.tsx`
- commit 8bb5571

**배경**: dl2 풀공개 후 Topbar에 로그인 버튼이 없어서 비로그인 사용자가 진입 불가능.

**해결**: CreamLoginButton 추가 + AuthModal mount

---

### 1-10. [앱] 새벽빛 별자리 아이콘 자산 복구

**한 줄 요약**: 4월 25일에 만든 별자리 아이콘 자산이 사라진 사건 — generate-icons.mjs 실행으로 복구

**관련 파일**:
- `assets/icon.png`
- `assets/adaptive-icon.png`
- `assets/splash-icon.png`
- commit 66afdda

**배경**:
- Phase 2 키보드 빌드(commit f6a4343) 설치 후 사용자가 placeholder 아이콘 발견
- "이전 채팅에서 만든 별자리 아이콘이 사라졌다" 보고

**오류 / 함정** ⭐:

#### 진단 에이전트의 잘못된 결론
- **첫 진단 결과**: "git log --all이 Initial commit 1번뿐. placeholder는 항상 그대로. 사용자 기억 착각."
- **사용자 강력 반박**: "아니 직접 코드가 만들어줘서 쓰던 아이콘인데"
- **재진단 (전수조사)**:
  - `scripts/generate-icons.mjs` 디자인 스크립트 살아있음 (4월 25일 작성)
  - `@resvg/resvg-js` devDep 설치됨
  - 그러나 PNG 결과물 git에 commit된 적 없음 → 어느 시점에 placeholder로 회귀
- **진짜 원인**: 디자인 스크립트는 살아있는데 실행 결과 PNG가 git에 commit 안 됨 → 무심코 reset / Expo CLI 재초기화 / 수동 회귀로 placeholder 회귀
- **해결**: `node scripts/generate-icons.mjs` 실행 → PNG 3개 생성 → git commit (재발 방지)

**학습**:
- 진단 에이전트의 단정적 결론도 사용자 기억과 충돌하면 재진단
- 자산 생성 스크립트는 결과물도 반드시 git commit

**빌드 정책 결정**:
- 아이콘은 native 자산이라 OTA 불가 → 재빌드 필수
- 다음 native 변경 (키보드 fix가 native면) 묶어서 1회 빌드 결정 → **결과적으로 키보드 fix가 OTA만으로 가능했지만 키보드 작업이 미해결로 끝나서 빌드 보류 상태**

---

### 1-11. [공통] 옛 빌드 사용자 우주 컨셉 회귀

**한 줄 요약**: 새 빌드 미설치 사용자에게 우주 컨셉이 보이는 현상 — OTA fallback 정상 메커니즘으로 확정

**배경**:
- 길드원들 보고: 갑자기 dl2 대신 우주 컨셉이 보임
- 사용자(소언) 본인은 새 빌드 설치라 dl2 정상

**오류 / 함정**:
- **헛다리 짚은 것**: featureFlags 회귀 / cosmic dead code 살아남기 / 8bb5571 commit이 분기 깨뜨림 등 의심
- **진짜 원인**: native runtime 호환성 문제. Phase 2 빌드(controller 추가) 후 새 OTA가 옛 빌드한테는 호환 안 맞아 차단됨 → EAS가 자동으로 호환 가능한 옛 OTA로 fallback → 그 시점이 dl2 풀공개 이전일 가능성 → 우주 컨셉 보임
- **결정**: 진단 별도 안 함, 새 빌드 배포로 자동 해소되는 정상 메커니즘

**iOS 보너스 발견**:
- iOS 옛 빌드 켜자마자 충돌 → 다시 실행 시 dl2 화면 보임 (dl2 풀공개는 적용된 시점 OTA로 fallback) → 그러나 로그인 버튼 fix(8bb5571) 이전 OTA라 로그인 버튼 누락
- 같은 메커니즘 확인

**학습**:
- 빌드 매트릭스 + runtimeVersion 호환성 이해 필요
- 옛 빌드 사용자는 새 OTA 못 받을 수 있음 → 옛 OTA로 fallback
- "갑자기 옛 화면이 보임" = OTA fallback 정상 동작 가능성 우선 의심 (core-learnings 1-4 확장)

---

(Part 2로 이어짐 — 키보드 마라톤)
