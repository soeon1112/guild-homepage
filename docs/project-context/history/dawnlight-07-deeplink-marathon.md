# Dawnlight 작업 일지 v4 - Part 1

**기간**: 2026-05-05 ~ 2026-05-06 (14시간+ 마라톤)
**핵심 주제**: deep-link 시스템 구축 (최신현황 + 푸시 알림)
**참여**: Claude(claude.ai) - 디자인/판단 가이드, Claude Code - 실제 코드 작업

---

## 1. Deep-link 마라톤 (최신현황 NebulaWhispers)

### 1-1. [공통] NebulaWhispers 닉네임 매칭 - message → 닉네임 추출
- **한 줄 요약**: 최신현황 메시지에서 닉네임 추출하는 정규식 도입
- **관련 파일**: 웹 + 앱 NebulaWhispers
- **배경**: 최신현황 카드 클릭 시 작성자 미니홈피로 이동하기 위해 닉네임 필요. message 필드에서 "X님이..." 패턴 추출
- **결정 사항**: 정규식 `/^(.*?)([^\s'"]+?)님(.*)$/` 사용. 웹(c88c283) + 앱(007dab3) mirror

---

### 1-2. [공통] Phase 1 deep-link 적용 - adventure / guestbook / combat
- **한 줄 요약**: 모험노트, 방명록, 투력 활동에 deep-link 추가
- **관련 파일**:
  - 웹/앱 미니홈피 AdventureLogSection, GuestbookSection
  - 웹/앱 combat 관련 logActivity
- **배경**:
  - adventure: `/members/${id}#minihome-adventure`
  - guestbook: `/members/${id}#minihome-guestbook`
  - combat: `/combat?nick=${owner}` (data-nick 속성 부착)
- **결정 사항**: 옛 doc 마이그레이션 진행 (75건 등)

---

### 1-3. [공통] 사진첩 deep-link + 앱 푸시 탭 핸들러
- **한 줄 요약**: 사진 댓글 deep-link + 앱 PushTapHandler 추가
- **관련 파일**:
  - 웹 PhotosSection (V2)
  - 앱 _layout.tsx (PushTapHandler)
  - 앱 navigateLink 헬퍼
  - 앱 NebulaWhispers click handler
- **배경**:
  - `minihome_photo_comment` + photo: link에 commentId 추가
  - V2 PhotosSection에 fits-defer 패턴 이식 (앨범 댓글 패턴)
  - 앱: addNotificationResponseReceivedListener + cold start 처리
  - navigateLink: hash → ?section= 변환

---

### 1-4. [공통] ⭐ 회귀 4개 fix 마라톤 (모험기록/사진 race)
- **한 줄 요약**: 모바일 사파리 race로 모험기록/사진 deep-link 작동 안 됨 → 8가지 시도 후 진짜 원인 발견
- **관련 파일**:
  - guild-homepage/app/members/[id]/page.tsx
  - PhotosSection.tsx
  - AdventureLogSection.tsx
  - CollapsibleSection.tsx (interactive 분기)
  - NebulaWhispers.tsx
- **오류 / 함정**: ⚠️ 가장 가치 있는 학습 포인트
  - **증상**: 모바일에서 모험기록/사진 활동 클릭 → scrollY 487에서 안 변함. 뭘 해도 안 됨.
  - **헛다리 짚은 시도들** (12시간 동안):
    1. paddingBottom maxScroll clamp 의심
    2. framer-motion AnimatePresence height:0 race 의심
    3. Vercel deploy stuck 의심
    4. Suspense wrap 누락 의심
    5. URL hash 중복(#minihome-adventure#minihome-adventure) 의심
    6. initialDeepLinkRef 빈 값 race 의심
    7. CollapsibleSection collapsed 의심
    8. behavior:smooth 의심
  - **진짜 원인 발견 과정** (디버그 박스 여러 차례 박은 후):
    - **모바일 사파리 useSearchParams race**: mount 직후 첫 render에서 빈 값 반환
    - `useState lazy initializer`로 mount 시점 hash 직접 캡처해야 함
    - `window.scrollTo({behavior:"smooth"})`가 hash-navigation 컨텍스트에서 silent fail
    - 사진 path는 hash 없이 ?photo=만 있어서 `target=""`로 bail되던 문제
  - **해결**:
    - `useState(() => window.location.hash.slice(1).split("#")[0] || "")` lazy init
    - useEffect 안에서 fresh hash 재측정
    - `?photo=` 케이스 → `minihome-photos` fallback
    - brute-force 다중 scroll: `window.scrollTo(0, y) + documentElement.scrollTop + body.scrollTop`
    - multi-retry [100, 500, 1500, 3000]ms
    - opacity 게이트 700ms reveal
    - paddingBottom 200vh→300vh
    - NebulaWhispers `<Link>` → `<a>` + `router.push` (hash concat 회귀 봉인)
    - CollapsibleSection mount 시 plain render (framer-motion height race 봉인)
- **핵심 학습**:
  1. **추측 8번 후 진짜 원인 발견 케이스** - 추측 금지, 진단 로그부터
  2. 디버그 박스에 useEffect 진입 분기/상태를 모두 push해야 어디서 bail하는지 보임
  3. Next.js App Router의 `useSearchParams`는 모바일에서 race condition - lazy init 필수

---

### 1-5. [공통] 사진 모달 두 번째 클릭 시 안 뜨는 회귀 (앱)
- **한 줄 요약**: 앱에서 같은 사진 활동 두 번째 클릭 시 모달 안 뜸
- **관련 파일**: dawnlight-app/src/components/minihompi/PhotosSection.tsx (commit 492949f)
- **오류 / 함정**:
  - **증상**: 처음엔 정상, 메인 갔다 다시 같은 활동 누르면 페이지만 뜨고 모달 X
  - **원인**: `autoOpenedRef` 가드가 boolean이라 한 번 set되면 다음에 mount 안 함. 앱은 컴포넌트가 unmount/remount 안 되어 ref reset 안 됨
  - **해결**: `useFocusEffect` 패턴 도입
    ```
    useFocusEffect(useCallback(() => {
      // 자동 오픈 로직
      return () => { lastOpenedIdRef.current = null; }; // 페이지 떠날 때 reset
    }, []));
    ```
- **핵심 학습**: 앱(RN)은 페이지 unmount 안 되니까 `useEffect` + boolean ref 안 됨. `useFocusEffect`로 진입 시점 + cleanup으로 ref reset 패턴 사용

---

### 1-6. [홈피] OTA 강제 체크 + Functions 자동 정규화
- **한 줄 요약**: 옛 클라이언트가 옛 형식 doc 작성해도 자동 변환 - 마이그레이션 영구 불필요
- **관련 파일**:
  - dawnlight-app/app/_layout.tsx (ForceOtaCheck 추가)
  - functions/src/lib/activityNormalize.ts (신규)
  - functions/src/triggers/latest.ts (onActivityCreated 시작부)
- **배경**:
  - OTA 미수령 사용자가 옛 코드로 활동 작성 → race-leak 반복
  - 매번 마이그레이션 돌리는 건 비효율
- **결정 사항**: 옵션 A 선택 (Cloud Functions 자동 정규화)
- **해결**:
  - functions onActivityCreated에서 doc 생성 직후 link/message 정규화
  - 옛 형식이면 patch update, 신규 형식이면 no-op (idempotent)
  - 클라이언트 OTA 무관 race-leak 영구 봉인

---

### 1-7. [공통] 게시판 게시글/댓글 deep-link
- **한 줄 요약**: 게시글 + 게시글 댓글 deep-link 추가
- **관련 파일**:
  - 웹 board/[id]/page.tsx
  - 앱 board.tsx (단일 파일 list/detail mode)
  - 앱 navigateLink (board rewrite)
- **배경**:
  - 웹: `/board/[id]?comment=Y` → fits-defer + multi-retry
  - 앱: navigateLink rewrite (`/board/X` → `/board?id=X`)
  - 앱 board.tsx: detail mode 자동 진입
- **오류 / 함정**:
  - **증상 1 (웹)**: 댓글 위치 스크롤 안 됨, 페이지 top
  - **증상 2 (앱)**: "Unmatched Route Page could not be found"
  - **원인**:
    - 웹: useSearchParams race (1-4와 동일)
    - 앱: `/board/[id]` 라우트 자체가 없음 (단일 파일 mode-state)
  - **해결**:
    - 웹: useState lazy initializer + 트리플 fallback
    - 앱: navigateLink에서 `/board/X` → `/board?id=X` rewrite + board.tsx에 useLocalSearchParams 추가
    - 앱 댓글 스크롤은 별도 turn으로 보류 (cardY + listOffsetInCardRef + commentYInListRef 합산 absolute y, multi-retry, commit 5134fb4)

---

### 1-8. [공통] 일정 deep-link
- **한 줄 요약**: 최신현황 일정 항목 클릭 시 해당 일정 모달 자동 오픈
- **관련 파일**:
  - 웹/앱 schedule.tsx
- **배경**:
  - logActivity link: `/schedule` → `/schedule?id=${newRef.id}`
  - mount 후 schedules 로드 시점에 setYear/Month/setSelectedDate 호출
  - multi-retry로 비동기 로드 race 대응
- **결정 사항**: 옛 doc 마이그레이션 0건 (자동 prune됨)

---

### 1-9. [공통] 방명록 페이지네이션 점프
- **한 줄 요약**: entry가 1페이지 아닌 다른 페이지에 있을 때 자동 페이지 이동 + entry 위치 스크롤
- **관련 파일**:
  - 웹 GuestbookSection.tsx, members/[id]/page.tsx
  - 앱 GuestbookSection.tsx, members/[id].tsx
- **배경**:
  - link 형식: `/members/${id}?guestbook=${entryId}` (hash → ?param)
  - 웹: findIndex → `Math.floor(idx / PER_PAGE)` 페이지로 setPage → scrollIntoView
  - 앱: findNodeHandle + measureLayout + multi-retry
- **마이그레이션**: 75건 변경 후 apply
- **오류 / 함정**:
  - **증상**: 앱 ✅, 웹 PC/모바일 ❌ (1페이지 그대로)
  - **원인**: useSearchParams race - 일정/게시글 댓글 fix와 동일 패턴
  - **해결**: 트리플 fallback (searchParams ?? initialGuestbookEntryId(lazy-init) ?? null), useEffect 안에서 window.location.search 직접 재측정

---

### 1-10. [홈피] ⭐ useDeepLinkParam 공통 hook 도입
- **한 줄 요약**: useSearchParams race 함정 영구 봉인을 위한 공통 hook
- **관련 파일**:
  - guild-homepage/src/lib/useDeepLinkParam.ts (신규)
  - 5개 사용처 마이그레이션 (members/[id], board/[id], combat, schedule, GuestbookSection)
- **배경**:
  - 같은 race로 12시간 동안 5번 회귀 (모험기록/일정/board/photos/guestbook)
  - 매번 useState lazy initializer 패턴 적용 → 새 작업마다 함정 반복
- **결정 사항**: 공통 hook 만들어서 영구 봉인
- **API**:
  - `useDeepLinkParam(key)` - lazy-init useState + useSearchParams ?? 체이닝
  - `useDeepLinkHash()` - mount-time hash 캡처
  - `readDeepLinkParam(key)` - useEffect 안 fresh 재측정
- **핵심 학습**: 같은 함정 N번 반복하면 공통 hook으로 봉인. 다음 deep-link 작업 시 useDeepLinkParam("X") 한 줄로 race 봉인

---

### 1-11. [홈피/앱] 정리 - 디버그 코드 + BuildBadge 제거
- **한 줄 요약**: 12시간 마라톤 끝, 디버그 박스/콘솔 로그/BuildBadge 모두 제거
- **관련 파일**:
  - guild-homepage/app/members/[id]/page.tsx (-97 라인)
  - dawnlight-app/app/_layout.tsx (-37 라인)

---

## 2. 사진 모달 지연 조정

### 2-1. [홈피] 사진 모달 + 앨범 모달 setViewer 1200ms → 800ms
- **한 줄 요약**: deep-link 모달 자동 오픈 시 페이지 먼저 보이고 모달 뒤늦게 뜨는 느낌 개선
- **관련 파일**:
  - PhotosSection.tsx
  - album/page.tsx
- **배경**:
  - 직전 fix에서 모달 race 봉인 위해 1200ms로 늦춤
  - 사용자 피드백: 너무 늦게 뜨는 느낌
- **결정 사항**: 800ms로 통일 (700ms reveal + 100ms 여유, race 안전)

---

