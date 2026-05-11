# 새벽빛 길드 — 핵심 학습 / 함정 패턴 모음

> **목적**: 같은 함정 다시 안 빠지게 모든 학습 포인트 한 곳에 정리
> **마지막 업데이트**: 2026-05-10
> **사용법**: 새 작업 시작 전 관련 카테고리 훑기. 비슷한 증상이면 봉인 패턴 즉시 적용.

---

## 0. 가장 중요한 원칙 ⭐⭐⭐

### 0-1. "추측 말고 진단부터"
- **추측 5번~8번** 후에야 진짜 원인 발견한 사례 다수
- 안 되는 문제 만나면:
  1. 디버그 박스 / logger.info / console.log 박기
  2. 어느 분기에서 bail하는지 / 어떤 값이 들어오는지 정확히 보기
  3. 그 후 진짜 원인 fix
- **추측 → 코드 수정 → 빌드(20분) → 안 됨 → 다른 추측 → 무한 반복** 패턴 절대 금지

### 0-2. ⭐⭐⭐ fix 1번 실패 = 즉시 디버그 박스 (다음 가설 시도 금지)
- **함정**: Phase 1 fix 안 됐는데 Phase 2 가설 세워서 또 fix → 또 안 됨 → 또 가설 → 무한 반복
- **봉인 (강제)**:
  - **fix 1번 실패 = 가설 무효**
  - 다음 가설 세우지 말고 **무조건 디버그 박스로 실측**
  - 실측값 받은 후에 root cause 확정 → 그제서야 다음 fix
- **이유**:
  - 디버그 박스 1시간 << 잘못된 fix 시도 + 빌드/OTA + 사용자 검증 + 또 안 됨
  - 사용자 시간 + 사용자 신뢰 손실 (재빌드 1번 = APK 재설치 부담 + 길드원들 영향)
- **사례**: 키보드 회피 4 phase 헛수고 (2026-05-09). Phase 1 실패 후 Phase 2 (controller 도입, native 변경, 재빌드) → Phase 3 (nested KeyboardProvider) → Phase 4 (RN core API) 다 가설로 진행. Phase 4 후에야 디버그 박스 박음. 처음부터 디버그 박스 박았으면 RN core API로 OTA만으로 끝났을 작업.

### 0-3. ⭐⭐ 진단 에이전트 권장안도 검증 없으면 추측
- **함정**: 진단 보고서가 자신감 있는 어조로 권장안 제시하면 검증 없이 받음
- **증상**: 권장안 따라 큰 변경(native/재빌드/라이브러리) 진행 → 효과 없음 → 또 다른 권장안 → 반복
- **봉인 (강제)**:
  - **"표준 솔루션", "공식 권장", "확실히 90%"** 같은 단어 → **즉시 의심**
  - 진단 보고서가 라이브러리 추가 / native 변경 / 큰 refactor 권장하면 → **디버그 박스로 작동 검증 후에만 진행**
  - "왜 이게 표준인가? 이 케이스에서도 작동하는가?" 검증 없이 받지 말 것
- **사례**: 키보드 controller 권장안 — RN Modal 안에서 작동 안 하는 라이브러리를 "표준 솔루션"이라고 받음. 실측했으면 즉시 발견. 결과: native 패키지 추가 + 재빌드 1번 + 사용자 APK 재설치 헛수고.

### 0-4. ⭐⭐ JS-only 옵션 우선 검토 (native 변경은 마지막)
- **원칙**: 진단에 여러 fix 옵션이 있으면 OTA로 가능한 것부터
- **이유**: native 변경 비용 큼:
  - 재빌드 시간 (10~20분)
  - EAS 빌드 크레딧 / 시간 소모
  - 사용자 새 APK 설치 부담
  - native 호환성 위험 (옛 빌드 OTA fallback 등)
- **순서**:
  1. JS 로직 수정 (OTA 가능)
  2. 컴포넌트 구조 변경 (OTA 가능)
  3. RN core API 활용 (OTA 가능)
  4. **그 다음** native 라이브러리 추가 / app.json 변경 / 자산 변경 (재빌드 필수)
- **사례**: 키보드 사태 — controller(native) 권장안 갔지만 결과적으로 RN core Keyboard.addListener(JS only)로 풀림. 처음부터 RN core API 시도했어야.

### 0-5. 사용자 직감 신뢰 ⭐⭐
- 사용자(소언) "이상한데?" → 진짜 이상
- "적용 안 됐어" → 진짜 적용 X (Claude Code 보고 무시하고 캡쳐 우선)
- "여전히 깜빡거려" → 다른 원인 (캐시 / OTA 도달) 의심
- "이럴 거면 처음부터 디버그 했어야지" → 정확한 지적, 즉시 디버그 박스 단계로 전환
- **사용자가 발견한 진짜 버그 사례**: STAR 알고리즘 / 푸시 중복 / framer-motion + fixed / 댓글 layout 5번 시도 / 미니홈피 안드 강제종료 / 키보드 4 phase 헛수고 짚음 / **채팅 row 두 번째 클릭 함정 짚음 (2026-05-10)** / **최신현황 누구2 강조 누락 짚음 (2026-05-10)**

### 0-6. ⭐⭐⭐ 사전 재검증으로 진단 오판 검출 (NEW, 2026-05-10)
- **함정**: 진단 결과 신뢰하고 작업 시작했더니 진단이 잘못된 케이스
- **증상**: 진단에서 "dead" 판정한 컴포넌트가 실제로 살아있음 / 의존성 누락 / 호출 사이트 잘못 식별
- **봉인 (강제)**:
  - 모든 작업 명령에 **사전 재검증 단계 (A/B/C/D)** 박기
  - 진단 결과와 다르면 **즉시 작업 중단** + 사용자 보고 + 결정 대기
  - "진단대로 그냥 진행" 절대 X
- **사례** (2026-05-10 dawnlight-14):
  - **C-1 축소판 Wardrobe live 발견**: 진단에서 "dead" 판정 → 사전 재검증에서 ProfileSectionD2가 cosmic Wardrobe 그대로 mount 중 발견 → 즉시 중단
  - **BgmPlayer 연쇄 dead**: ProfileSection.tsx의 dead reference 자동 검출 → BgmPlayer 복원 + 별도 라운드
  - **TopHeader 상수 의존성**: 진단 첫 회 누락, 추가 진단으로 발견
  - **AlbumPhotoViewer 5-2b 자리**: 진단에서 본체 분기로 잘못 판단, 실제로는 AlbumViewerMetaInner 안 → 사전 검증 + 빌드 1차 에러로 검출
- **원칙**: 진단 신뢰하되 작업 직전 verbatim 한 번 더 확인. 시간 추가는 적고 사고 방지 효과 큼.

### 0-7. ⭐⭐ git add -A 사고 방지 (NEW, 2026-05-10)
- **함정**: dead-code 정리 시 untracked 민감 파일 (Firebase 키 등) 다수 존재 시 `git add -A` 실수 → 키 파일까지 staged
- **증상**: 발견 안 되면 commit 후 GitHub 푸시 → 민감 정보 노출 사고
- **봉인 (강제)**:
  - 모든 작업 명령에 **specific add** 강제 명시 (`git add 파일1 파일2 ...`)
  - `git add -A` / `git add .` 절대 X
  - Claude Code가 발견 시 자동 중단 + 보고
- **보호 대상 untracked 파일**:
  - `GoogleService-Info.plist` (Firebase iOS 키)
  - `google-services.json` (Firebase Android 키)
  - `dawnlight-guild-3181d3388f9f.json` (서비스 계정 private key)
  - `.env.example`, `.firebaserc`, `firebase.json` 일부
- **사례**: 2026-05-10 cosmic dead-chain 정리 시 발견 → specific add로 변경, 민감 파일 6개 untracked 그대로 보존.

### 0-8. ⭐⭐ 같은 row 두 번째 클릭 함정 (NEW, 2026-05-10)
- **함정**: useEffect 의존성에 같은 값 두 번째 들어오면 변화 감지 안 됨 → 발화 X
- **증상**: 글로벌 오버레이 (FloatingChat 등) deep-link이 첫 클릭만 작동, 두 번째부터 X
- **푸시는 정상, row 클릭만 안 되는 차이**:
  - 푸시: 매번 다른 messageId → 자연 변화 감지
  - row 클릭: 같은 messageId 반복 → 변화 X
- **봉인 (강제) — `router.setParams` 패턴**:
  ```typescript
  useEffect(() => {
    if (!chatParam) return;
    let timer = ...;
    InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        setOpen(true);
        router.setParams({ chat: undefined }); // 특정 key만 제거
      }, 500);
    });
  }, [chatParam, nickname]);
  ```
- **`router.replace("/")` vs `router.setParams({ key: undefined })`**:
  - `router.replace("/")` 위험: 메인 페이지 모든 query 제거 (letter/whispers 등 다른 구독자 영향)
  - `router.setParams({ key: undefined })` 안전: 특정 key만 제거, history stack 안 만짐
- **적용 범위**:
  - 글로벌 오버레이 (FloatingChat, 모달) → 영향 받음 (페이지 unmount 안 됨)
  - 페이지 이동 deep-link → 자동 해결 (mount/remount)
- **사례**: 채팅 row 두 번째 클릭 함정 fix (commit 04aecb3, 2026-05-10). 사용자가 직감으로 발견. chat.ts:44-48 주석에 이미 단서 있었음.

### 0-9. ⭐ 페이지 이동 vs 글로벌 오버레이 함정 차이 (NEW, 2026-05-10)
- **차이**:
  - **페이지 이동** (board/notice/album/members 등): 같은 row 두 번째 클릭 시 unmount/remount → 자동 발화 ✅
  - **글로벌 오버레이** (FloatingChat, modal): 페이지 그대로 + URL만 변경 → 같은 URL이면 변화 감지 X
- **진단 시 체크**:
  - deep-link 처리 위치가 mount 영역인지 (페이지 이동) / 글로벌 영역인지 (오버레이) 확인
  - 글로벌이면 같은 URL 두 번째 처리 패턴 필요
- **사례** (2026-05-10):
  - 🔴 채팅 (FloatingChat): 함정 확실
  - 🔴 별똥별 편지 (PaperPlaneLetters): 같은 함정이지만 최신현황에 안 뜸 (익명) → 영향 X
  - 🔴 웹 미니홈피 (hashHandledRef): 같은 페이지 stay 시 함정
  - 🟢 게시판/앨범/미니홈피 row 클릭: 페이지 이동이라 자동 해결

---

## 1. React / Next.js 함정 (홈페이지)

### 1-1. ⭐⭐ useSearchParams race (Next.js App Router)
- **함정**: 모바일 사파리에서 mount 직후 첫 render에 빈 값 반환
- **증상**: 모바일에서 deep-link 작동 안 됨, scrollY 안 변함, 빈 값으로 처리됨
- **봉인**: `useDeepLinkParam(key)` hook 사용
  - 위치: `guild-homepage/src/lib/useDeepLinkParam.ts`
  - lazy-init useState + useSearchParams ?? 체이닝
- **만약 hook 못 쓰는 환경**:
  ```typescript
  const [initial] = useState(() =>
    typeof window !== "undefined"
      ? window.location.hash.slice(1).split("#")[0] || ""
      : ""
  );
  // useEffect 안에서 fresh 재측정
  ```
- **사례**: 모험기록/사진/일정/board/guestbook deep-link (12시간 마라톤, 추측 8번 후 발견)

### 1-2. ⭐ transform: scale() + position: fixed 함정 (framer-motion)
- **함정**: 부모에 `transform: scale()` 걸려있으면 자식의 `position: fixed`가 viewport가 아니라 부모 박스 기준으로 잡힘
- **증상**: 채팅창 안 사진 클릭 → lightbox가 채팅창 안에 작게 클립됨
- **봉인**: `createPortal(lightbox, document.body)`로 transform context escape

### 1-3. flex 1 + min-width 0만으로 우측 메타 침범 방지 부족
- **함정**: 한글 텍스트는 영문처럼 한 덩어리로 안 잘리고 우측 영역 침범
- **봉인**:
  ```css
  word-break: break-all;
  /* 좌측 본문: flex 1 + min-width 0 + padding-right */
  /* 우측 메타: flex-shrink 0 + 명시적 width */
  ```

### 1-4. Vercel CDN edge cache 깜빡임 ⭐⭐
- **함정**: Vercel CDN edge cache + OTA 도달 지연 → "이전 빌드 hold" 현상
- **봉인**: 코드 변경 제안 전에 캐시 / 도달 지연 의심 우선
- **체크 순서**:
  1. 사용자 캡쳐 = ground truth
  2. verbatim grep으로 코드 상태 검증
  3. Vercel CDN cache / OTA 도달 시점 의심
  4. 그 다음 코드 변경 제안

### 1-5. React 19 JSX 네임스페이스 변경 (NEW, 2026-05-09)
- **함정**: React 19에서 JSX 네임스페이스가 `JSX.IntrinsicElements` → `React.JSX.IntrinsicElements`로 변경
- **증상**: TypeScript 빌드 에러 (`Cannot find namespace 'JSX'`)
- **봉인**: 컴포넌트에서 `JSX.X` 직접 참조 시 `React.JSX.X`로 변경
- **사례**: 멘션 시스템 MentionText 컴포넌트 (2026-05-09)

---

## 2. React Native / 앱 함정

### 2-1. ⭐⭐ react-native-svg `<G>` transform interpolated string 안드 silent crash
- **함정**: `Animated.createAnimatedComponent(G)` + interpolated string transform 패턴이 안드에서 silent native crash
- **증상**: 안드만 흰 화면 + 강제종료. iOS 정상.
- **봉인**: Animated.View + transform translateY/scale 패턴만 안전

### 2-2. ⭐ Cold-start gesture race (푸시 탭 직후 모달/위젯)
- **함정**: 푸시 탭 touch event가 다음 화면의 backdrop/close 핸들러로 bleed
- **봉인**:
  ```typescript
  let timer: ReturnType<typeof setTimeout> | null = null;
  const interactionHandle = InteractionManager.runAfterInteractions(() => {
    timer = setTimeout(() => setOpen(true), 500);
  });
  return () => {
    interactionHandle.cancel();
    if (timer) clearTimeout(timer);
  };
  ```

### 2-3. ⭐ expo-router 글로벌 오버레이 hook 선택
- **함정**: `_layout.tsx`에 mount된 컴포넌트에서 `useLocalSearchParams` 사용 시 빈 값
- **봉인**: 글로벌 오버레이는 `useGlobalSearchParams` 사용

### 2-4. ⭐ multi-retry 패턴은 land 후 cancel 필수
- **함정**: multi-retry [100, 500, 1500, 3000]ms 중 늦은 retry가 잘못된 값으로 다시 호출
- **봉인**:
  ```typescript
  let landed = false;
  const doScroll = () => {
    if (landed) return;
    const y = ref.current;
    if (y < 50) return;
    scrollTo(y);
    landed = true;
    for (const h of retryHandles) clearTimeout(h);
  };
  ```

### 2-5. ⭐ RN useFocusEffect로 ref reset (재진입 봉인)
- **함정**: 앱(RN)은 페이지 unmount 안 되니까 boolean 가드 ref가 한 번 set되면 reset 안 됨
- **봉인**:
  ```typescript
  useFocusEffect(useCallback(() => {
    return () => { lastOpenedIdRef.current = null; };
  }, []));
  ```

### 2-6. iOS Pressable 두 겹 안에 ScrollView 금지
### 2-7. iOS borderRadius + overflow:hidden 안에 애니메이션 자식 금지
### 2-8. iOS SVG layer invalidation (1초마다 리렌더) — useCallback/useMemo 캐시
### 2-9. ErrorBoundary는 RN native crash 못 잡음
### 2-10. typecheck 통과 ≠ runtime 동작 (RN web CSS 속성 silently 무시)
### 2-11. RN 안드 글로우 elevation 필수

### 2-12. ⭐⭐ 같은 row 두 번째 클릭 함정 (NEW, 2026-05-10)
**0-8 참조** — useEffect deps 같은 값 반복 시 발화 X. 글로벌 오버레이만 영향, 페이지 이동은 자동 해결.

봉인: `router.setParams({ key: undefined })` 패턴.

### 2-13. ⭐ navigateLink path 변환 패턴 (NEW, 2026-05-10)
- 앱 deep-link 처리: `src/lib/navigateLink.ts`
- 형식 변환:
  - `/board/<id>` → `/board?id=<id>`
  - `/notice/<id>` → `/notice?id=<id>`
  - `/album?photo=<id>` → `/album/photo?id=<id>`
  - `/?chat=<id>` → 변환 X (그대로 통과, FloatingChat이 처리)
- 호출 사이트: `app/_layout.tsx` PushTapHandler + `WhispersFeed/index.tsx` row onPress

---

## 3. Firebase / Functions 함정

### 3-1. ⭐⭐ firebase-functions v2 path wildcard mojibake
- **함정**: 한글 doc id가 Latin-1로 잘못 해석되어 mojibake
- **봉인**: 모든 trigger에서 path wildcard 받자마자 UTF-8 재해석
  ```typescript
  const owner = Buffer.from(event.params.owner, "latin1").toString("utf8");
  ```

### 3-2. ⭐ 푸시 토큰 중복 (같은 폰에 여러 계정 로그인)
- **함정**: 같은 푸시 토큰이 두 user doc에 등록 → broadcast 트리거가 두 번 발송
- **봉인**: `getRecipientsForCategory`에 token 기준 dedupe 추가

### 3-3. Cloud Function 트리거 경로 실수
### 3-4. Functions 자동 정규화 (race-leak 영구 봉인)

### 3-5. ⭐ 알림 토글 시스템 (이미 운영 중, 2026-05-10 확인)
- **인프라**:
  - Firestore: `users/{nickname}.notificationSettings` (각 카테고리 boolean)
  - Backend: `recipients.isCategoryEnabled` (모든 trigger 자동 체크)
  - UI: `src/components/NotificationSettingsCard.tsx` (dl2 톤, 11개 토글)
  - 양쪽 동기화: AsyncStorage + Firestore
- **카테고리 (11개)**: notice / chat / latest / whisper / myspace / album / board / schedule / pet / letter / proposal
- **mention 제외 (의도적)**:
  - 강제 발송 정책 (`forceSend: true`)
  - 사용자가 직접 부르는 거라 OFF 해도 푸시 가는 게 자연
  - categories.ts 주석에 명시
- **기본값**: 모든 카테고리 ON, 마이그레이션 불필요

---

## 4. EAS / 빌드 / OTA 함정

### 4-1. EAS production 채널 미생성
- **함정**: `eas channel:create production` 안 하면 production 빌드가 OTA 못 받음

### 4-2. ⭐ OTA 적용 콜드 스타트 2회 필요
- **메커니즘**: ForceOtaCheck가 mount 시 OTA 다운로드 → 다음 콜드 스타트에서 적용
- **사용자 안내**: 앱 강제 종료 → 재실행 → 또 강제 종료 → 재실행 (2회)

### 4-3. 네이티브 패키지는 OTA 불가
### 4-4. 자동 배포 정책 = 정확히 2채널 (안드 preview + iOS production)
### 4-5. WebView 라우트 부재 (404) — 홈피에 라우트 추가

---

## 5. Firestore 함정

### 5-1. Firestore 보안 규칙 만료 (현재 2027-05-01)
### 5-2. Storage 무료 플랜 위치 불일치 → Blaze + asia-northeast3
### 5-3. 캐시 버스팅 필수 (이미지)

---

## 6. 디자인 / UI 함정

### 6-1. 이미지에 filter/blur/opacity 적용 금지
### 6-2. 투명 PNG 버튼에 box-shadow 금지 → drop-shadow()
### 6-3. 버튼 이미지에 글자 포함 금지
### 6-4. v0.dev 디자인 이식 시 스타일 손실 주의

### 6-5. ⭐⭐ 사용자 의도 정확히 파싱 (모호 표현 시각 예시 필요)
- **함정**: "한 줄 가로", "들여쓰기", "두 번째 줄" 같은 모호 표현 추측 해석
- **봉인**: 모호 표현 시각 예시 (캡쳐 / 시각화 위젯) 로 확인 후 명령

### 6-6. 모바일 input 자동 확대 → 폰트 16px 이상 + maximum-scale=1
### 6-7. 키보드 처리 (모바일/앱 차이)
- **모바일 웹**: 키보드 올라올 때 BottomNav 숨기기 = 모바일(width<768)만
- **앱**: KeyboardAvoidingView 또는 KeyboardAwareScrollView
- **공통**: 채팅/댓글 전송 후 input.focus() 필수, 전송 버튼 onTouchStart에 `e.preventDefault()`

### 6-8. 안드 영상 동시 자동재생 크래시 → 그리드는 첫 프레임 + ▶, iOS만 자동재생

---

## 7. 협업 / 작업 흐름 함정

### 7-1. ⭐ Claude Code 진단 보고 거짓말 패턴
- **함정**: "정상 적용됨" 보고 → 사용자 캡쳐 시 미적용
- **봉인**: 모든 명령에 verbatim grep 결과 + 사용자 캡쳐 = ground truth

### 7-2. 앱 작업 누락 패턴
### 7-3. wiring 새로 짤 때 이전 라운드 결정 사항 누락
### 7-4. 임시 리셋 코드를 컴포넌트 안에 두기 금지 → scripts/ 폴더
### 7-5. 데이터 변경 전 백업 필수
### 7-6. 길탈 처리 패턴 (재사용 scripts/delete-{nickname}.mjs)
### 7-7. 푸시 작업은 앱만 적용

### 7-8. 모달 백드롭 일관성 (양 레포 동시)
- **원칙**: 모달/UI 변경 시 항상 양 레포 (홈피 + 앱) 동시 명시

### 7-9. dead code 폐기 ROI 작음 → 점진 정리
### 7-10. ⭐⭐ dead code 통합 함정 (운영 컴포넌트 식별)
- **함정**: 진단 에이전트가 가리킨 파일이 dead code인 채로 통합 진행
- **봉인**: import 그래프 grep으로 호출 사이트 검증 강제
- **사례**: 웹 멘션 GuildChat.tsx dead code 통합 (2026-05-09)

### 7-11. ⭐⭐ 진단 에이전트 권장안 = 추측, 검증 강제
- **함정**: 진단 자신감 있는 어조 → 검증 없이 큰 변경 진행

### 7-12. ⭐⭐⭐ 사전 재검증 강제 (NEW, 2026-05-10)
**0-6 참조** — 진단 결과 신뢰하되 작업 직전 verbatim 한 번 더 확인. 사고 방지 효과 큼.

### 7-13. ⭐⭐ git add -A 사고 방지 (NEW, 2026-05-10)
**0-7 참조** — specific add 강제. 민감 파일 (Firebase 키 등) untracked 다수 시 위험.

### 7-14. ⭐ type-only import 분리 패턴 (NEW, 2026-05-10)
- **상황**: 컴포넌트 통째 제거 시 살아있는 type만 외부에서 의존
- **봉인**: 살아있는 type을 별도 파일로 이전 후 컴포넌트 삭제
  - 예: `ProfileSection.tsx` → type MemberDoc만 → `src/types/minihompi.ts`로 이전 → ProfileSection.tsx 통째 삭제
- **장점**: 컴포넌트와 type 분리 → 응집도 ⭐, dead-code 정리 용이
- **사례**: ProfileSection / TopHeader 통째 제거 (commit b8d9e36 / 5ea4688, 2026-05-10)

### 7-15. ⭐ 분할 작업 원칙 — 표시/입력 분할 (NEW, 2026-05-10)
- **상황**: 멘션 통합 같은 큰 작업 (자리 수 多)
- **분할 패턴**:
  - 표시 통합 (5-2a, 5-3a): 위험 낮음 (텍스트 컴포넌트 교체만)
  - 입력 통합 (5-2b, 5-3b): 위험 중간 (cursor/state/Fragment 분리)
- **장점**:
  - 각 단계 검증 통과 후 다음 진행
  - 회귀 발생 시 추적 쉬움
  - 사용자 부담 분산
- **사례**: 멘션 Phase 5-2/5-3 (앨범/미니홈피) 5-2a/5-2b, 5-3a/5-3b 분할 진행

### 7-16. ⭐ 정규식 false positive 검증 패턴 (NEW, 2026-05-10)
- **상황**: 새 정규식 추가 시 다른 메시지 형식과 충돌 가능성
- **봉인**:
  - 모든 카테고리 message 형식 grep
  - 새 정규식 패턴이 다른 카테고리와 겹치는지 확인
  - 0 매칭이면 안전, 1건이라도 있으면 정규식 정밀화
- **사례**: 최신현황 MENTION_RE 추가 (2026-05-10) — activityNormalize.ts grep 결과 "언급" 단어 사용처 0 → false positive 0 확인 후 진행

---

## 8. 진단 패턴 ⭐⭐

### 8-1. 디버그 박스 패턴
- 화면에 정보 표시하는 작은 오버레이 박스
- 사용자 한정 노출 패턴 (nickname 검사로 운영 사용자 영향 0)

### 8-2. ⭐⭐⭐ fix 1번 실패 = 즉시 디버그 박스 (다음 시도 X)
**0-2 참조**

### 8-3. binary search 패턴 (안드 강제종료 진단)
- 컴포넌트 5~10개 동시 마운트 시 한 단계마다 OTA → 사용자 진입 시도

### 8-4. dump-state 진단 패턴
- Firestore 데이터 상태 dump (예: `dump-push-state.mjs <닉네임>`)

### 8-5. verbatim grep 강제
- "정상 적용됨" 보고 받으면 verbatim grep 결과 첨부 강제
- 사용자 캡쳐 = ground truth, 코드 진단 보고와 충돌 시 캡쳐 우선

### 8-6. ⭐⭐ 추측 → 진단 → 진짜 원인 패턴 (NEW 사례 추가, 2026-05-10)
- 채팅 row 함정 추적 과정:
  - 1차 추측: 멘션 트리거 link 형식 문제? → verbatim 확인 결과 일반 채팅과 동일
  - 2차 추측: navigateLink 처리 차이? → 같은 함수 호출
  - 3차 추측: expo-router race? → 부분적 단서
  - **진짜 원인**: useEffect 의존성 같은 값 반복 함정 (chat.ts:44-48 주석에 단서)
- **원칙**: 추측 없이 verbatim 코드 + 사용자 검증으로 좁히기. 코드 주석 단서 항상 확인.

---

## 9. Vercel 함정

### 9-1. 무료 플랜 한도 초과 → Pro 업그레이드
### 9-2. GitHub↔Vercel 웹훅 끊김 → Disconnect/Reconnect

---

## 10. 메타 / 일반 원칙

### 10-1. 같은 함정 N번 반복 → 공통 hook으로 봉인
### 10-2. 사용자 페이스 존중 ("그만하시는 게..." 금지)
### 10-3. 단순 작업은 진단 X, 바로 적용
### 10-4. 자동 배포 정책 매번 명시
### 10-5. 작업 일지 정리 가이드
- "내가 했어 말 안 했어도 프롬프트 받았으면 완료"로 간주
- 시간순 정렬
- 추측 → 진단 → 진짜 원인 패턴 따로 강조 (가장 가치 있는 학습)

### 10-6. ⭐ 옛 인프라 재발견 패턴 (NEW, 2026-05-10)
- **상황**: 메모리/계획에는 PENDING이지만 실제로는 이미 완성된 케이스
- **확인 패턴**:
  - 진단 단계에서 "이거 이미 있나?" 검색 우선
  - grep으로 컴포넌트/Firestore 필드/trigger 코드 verbatim 확인
  - 있으면 변경 0, 메모리만 갱신
- **사례**: 알림 토글 시스템 (2026-05-10) — 메모리에 "PENDING"이었으나 실제로는 NotificationSettingsCard + Firestore schema + Backend toggle 체크 모두 완성되어 운영 중. 진단 후 변경 0 결정, 메모리만 갱신.

---

## 끝

> 이 파일은 새벽빛 길드 프로젝트의 모든 함정/패턴 모음입니다.
> 새 작업 시작 전 관련 카테고리 훑기.
> 비슷한 증상이면 봉인 패턴 즉시 적용.
> 옛 작업 디테일은 master-index.md → 해당 dawnlight-NN 파일에서 찾으세요.
