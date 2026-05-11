# Dawnlight 작업 일지 v4 - Part 2

**기간**: 2026-05-06
**핵심 주제**: 푸시 알림 deep-link 시스템

---

## 3. 푸시 알림 deep-link 진단 + 작업

### 3-1. [결정] 푸시 알림 매핑 정의
- **한 줄 요약**: 사용자가 푸시 알림 deep-link 매핑 정의
- **결정 사항**:
  - **A. 최신현황 deep-link과 동일**: 공지 / 게시판 / 게시판 댓글 / 일정 / 앨범 사진 / 앨범 댓글 / 미니홈피 키워드 / 방명록 / 방명록 답글 / 사진 댓글 / 한마디 수정 / 모험노트 / 칭호 / BGM / 프로필 사진 / 기분 / MBTI / 투력 / 미니홈피 사진 / 배지
  - **B. 특별 처리**:
    - 한마디란 푸시: 메인 페이지 한마디란 스크롤 위치
    - 채팅 푸시: 메인 + 채팅창 자동 오픈
    - 편지 푸시: 메인 + 별똥별 편지함 자동 오픈
    - 펫 푸시: 메인만

---

### 3-2. [결정] 푸시 작업은 앱만 적용
- **한 줄 요약**: 푸시는 앱에서만 발생 → 웹 작업 사실상 무의미
- **결정 사항**:
  - 앞으로 푸시 관련 작업은 앱만 적용
  - 단, 직접 진입점이 있는 모달/위젯은 양 레포 일관성 위해 처리 (예: 5-E 편지함은 직접 클릭 가능)

---

### 3-3. [공통] 푸시 deep-link 진단 결과
- **한 줄 요약**: 푸시 카테고리 두 갈래 - latest 경로(작동) + direct 경로(link 없음, 모두 noop)
- **진단 결과**:
  - **latest 경로** (✅ link forward됨): status / mood / bgm / mbti / profile_image / adventure / combat / title / photo / badge / admin
  - **direct 경로** (❌ link 미forward): notice / board / board_comment / schedule / album / album_comment / keyword / guestbook / minihome_photo_comment
  - **활동 doc 자체 안 만들어지는 푸시**: whisper / chat / letter / pet (별도 처리 필요)

---

### 3-4. [공통] 5-A direct trigger 10종에 data.link 추가
- **한 줄 요약**: 10종 direct trigger의 push payload에 link 필드 추가
- **관련 파일**:
  - functions/src/triggers/notice.ts
  - functions/src/triggers/board.ts (3개 함수)
  - functions/src/triggers/album.ts (2개 함수)
  - functions/src/triggers/schedule.ts
  - functions/src/triggers/myspace.ts (4개 함수)
  - dawnlight-app/src/lib/navigateLink.ts (`/notice/X` → `/notice?id=X` rewrite)
  - dawnlight-app/app/(tabs)/notice.tsx (useLocalSearchParams + lastDeepLinkIdRef)
- **오류 / 함정**:
  - **증상**: 공지 푸시 탭 시 "Unmatched Route Page could not be found"
  - **헛다리 짚은 시도**: 작업 보고에 "navigateLink만 git tracked, notice.tsx + functions는 untracked" → "fix 누락 가능성"
  - **진짜 원인**: 코드는 정상. **OTA 미수령 race-leak**.
    - functions가 새 코드로 배포 → `/notice/X` 푸시 발사
    - 사용자 디바이스는 아직 새 navigateLink OTA 못 받음
    - 옛 navigateLink가 `/notice/X` 그대로 router.push → Unmatched Route
  - **해결**: 앱 강제 종료 → 재실행 1회 (ForceOtaCheck가 OTA 다운로드) → 다시 강제 종료 → 재실행 → 새 코드로 작동
- **핵심 학습**: OTA 적용은 콜드 스타트 1회 + ForceOtaCheck → 다음 콜드 스타트에서 적용. 즉 강제 종료 + 재시작 2회 필요

---

### 3-5. [앱] ⭐ 키워드 푸시 mojibake fix (firebase-functions v2)
- **한 줄 요약**: 키워드 푸시가 안 가는 silent bail 추적 → mojibake (UTF-8 → Latin-1) 발견
- **관련 파일**:
  - functions/src/triggers/myspace.ts (onKeywordCreated)
  - functions/src/triggers/pet.ts (onPetGiftCreated)
- **오류 / 함정**: ⚠️ 가장 가치 있는 학습 포인트
  - **증상**: 키워드 푸시 자체가 안 감 (탭 이전에 푸시 미수신)
  - **헛다리 짚은 시도**:
    - 1차 진단: "햇빛한줌이 앱 미설치" → 사용자 검증 환경 문제로 단정 (잘못된 단정)
    - 사용자 정정: "테스트 계정으로 언쏘에게 추가했는데 언쏘가 못 받음" - 언쏘는 정상 사용자
  - **진짜 원인 발견 과정** (진단 로그 박은 후):
    - 함수 invoke됐는데 sendPush 호출 안 됨 = silent bail
    - 어느 guard에서 막히는지 모름 → 진단 로그 추가 (각 guard 직전에 logger.info)
    - 로그 결과:
      ```
      [keyword] doc data
        author: "테스트"        ← OK
        owner: "ì¸ì"            ← ⚠️ GARBLED
      [keyword] BAIL guard2: no recipient
      ```
    - **firebase-functions v2의 path wildcard 인코딩 버그**: 한글 doc id가 Latin-1로 잘못 해석되어 mojibake
    - "언쏘" UTF-8 바이트(ec 96 b8 ec 8f 98)를 Latin-1로 잘못 해석 → "ì¸ì"
  - **해결**:
    ```typescript
    const owner = Buffer.from(event.params.owner, "latin1").toString("utf8");
    ```
    - onKeywordCreated, onPetGiftCreated 둘 다 적용
- **핵심 학습**:
  1. **silent bail은 추측 금지, 진단 로그부터 박기**
  2. firebase-functions v2 path wildcard에서 한글 doc id 사용 시 Latin-1 mojibake 자동 발생 → UTF-8 재해석 패턴 필수
  3. 1차 진단이 가설을 하나에 단정하면 위험 (햇빛한줌 사례만 보고 사용자 환경 문제로 단정한 잘못)

---

### 3-6. [공통] 5-B 칭호 logActivity link 누락 fix
- **한 줄 요약**: 칭호 활동 link 인자 누락 + 앱은 logActivity 호출 자체 없었음
- **관련 파일**:
  - guild-homepage/app/shop/page.tsx:333 (link 인자 추가)
  - dawnlight-app/app/shop.tsx (logActivity 호출 신규 추가)
- **배경**:
  - 웹: 4번째 인자 link 누락
  - 앱: 칭호 장착 시 logActivity 호출 자체 없음 (homepage parity 누락)
- **해결**:
  - link: `/members/${nickname}` (nickname URL은 members/[id] 라우트가 NFC/NFD 폴백 처리)

---

### 3-7. [공통] 푸시 카테고리 prefix 정리
- **한 줄 요약**: 푸시 알림 본문이 카테고리 접두사 때문에 잘림
- **관련 파일**:
  - functions/src/triggers/latest.ts (`[최신현황]` 제거)
  - functions/src/triggers/myspace.ts (`[내 공간]` → `[내공간]` 7곳)
- **결정 사항**:
  - latest 경로: 접두사 완전 제거 ("[최신현황] X" → "X")
  - myspace: 스페이스 제거 ("[내 공간]" → "[내공간]")
  - 다른 카테고리는 그대로

---

### 3-8. [앱] 5-E 편지 - 별똥별 편지함 자동 오픈
- **한 줄 요약**: 편지 푸시 탭 시 메인 + 별똥별 편지함 모달 자동 오픈
- **관련 파일**:
  - functions/src/triggers/letter.ts (link 추가)
  - dawnlight-app/src/components/ShootingStarLetter.tsx
  - guild-homepage/app/components/redesign/ShootingStarLetter.tsx
- **배경**:
  - 편지 push 페이로드: 익명성 유지 위해 letterId 노출 X
  - link: `/?letter=true` 단순 플래그
- **오류 / 함정 (1차)**:
  - **증상**: 푸시 탭 시 메인 페이지 진입 + 모달이 검게 깜빡 → 즉시 닫힘
  - **헛다리 짚은 가설**: useSearchParams race / nickname race / lastLetterHandledRef 가드 잘못
  - **진짜 원인**: ⭐ **Cold-start gesture race**
    - InboxModal의 backdrop이 Pressable + onPress={onClose}
    - 푸시 탭 touch event가 화면 전환 + Modal mount 사이에 RN gesture system으로 전달
    - mount 직후 backdrop의 onPress 핸들러가 잡아챔 → onClose() 호출 → 닫힘
  - **해결** (5-E 편지 패턴):
    ```typescript
    let timer: ReturnType<typeof setTimeout> | null = null;
    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => setInboxOpen(true), 500);
    });
    return () => {
      interactionHandle.cancel();
      if (timer) clearTimeout(timer);
    };
    ```
    - **InteractionManager.runAfterInteractions**: cold-start animation/transition 끝날 때까지 대기
    - **추가 500ms setTimeout**: native gesture queue까지 drain
- **핵심 학습**: ⭐ **Cold-start gesture race 패턴** - 푸시/네비게이션 후 모달 자동 오픈 시 InteractionManager + 500ms gate 필수

---

### 3-9. [공통] 5-E 편지 모달 백드롭 일관성 fix (앱 + 웹)
- **한 줄 요약**: 편지함 모달 백드롭이 마음 띄우기와 다름 → 통일
- **관련 파일**:
  - dawnlight-app/src/components/ShootingStarLetter.tsx (InboxModal 백드롭)
  - guild-homepage/app/components/redesign/ShootingStarLetter.tsx
- **배경**:
  - ComposeModal: 백드롭 dim + blur 정상
  - InboxModal: 의도적으로 transparent 처리됐던 것 (디자인 결정)
- **오류 / 함정**:
  - 1차: 앱만 적용. 사용자 짚음: "웹피씨모바일은 전혀 적용 안 됐다"
  - 2차: 웹도 동일하게 통일
- **해결**: 양 레포에서 InboxModal도 ComposeModal과 동일한 dim + blur 적용

---

### 3-10. [홈피] 앨범 사진 모달 백드롭 일관성 fix
- **한 줄 요약**: 앨범 사진 모달 백드롭이 너무 투명 → 다른 모달과 동일 dim 적용
- **관련 파일**:
  - guild-homepage 앨범 photo viewer
  - dawnlight-app 앨범 photo viewer
- **결정 사항**: 다른 모달과 일관된 dim+blur 백드롭

---

### 3-11. [Firestore] 테스트 편지 3건 삭제
- **한 줄 요약**: 사용자가 검증용으로 보낸 테스트 편지 정리
- **삭제 대상**: '테스트' → '언쏘'에게 보낸 편지 3건 ("테스트입니다.", "...2", "...3")

---

### 3-12. [앱] 5-F 펫 푸시 - 메인 페이지 진입
- **한 줄 요약**: 펫 푸시 탭 시 메인만 진입 (모달 자동 오픈 X)
- **관련 파일**: functions/src/triggers/pet.ts (2곳: onPetGiftCreated, petStatusAlertSweep)
- **배경**: link: "/" 단순 메인 진입

---

### 3-13. [앱] 5-C 한마디 푸시 - 메인 페이지 한마디란 스크롤
- **한 줄 요약**: 한마디 푸시 탭 시 메인 + 한마디란 위치로 스크롤
- **관련 파일**:
  - functions/src/triggers/whisper.ts (link 추가)
  - dawnlight-app/app/(tabs)/index.tsx (메인 페이지 deep-link 처리)
  - dawnlight-app/src/components/WhispersToStars.tsx (onLayout 부착)
- **오류 / 함정** (회귀 2번):
  - **1차 회귀**:
    - **증상**: 푸시 탭 시 메인 페이지 진입했는데 검게 깜빡 → 윗쪽으로 이동
    - **원인**: cold-start gesture race + ScrollView mount 시점 race
    - **해결**: InteractionManager + 500ms gate 패턴 (5-E 편지 패턴 동일)
  - **2차 회귀** (사용자가 한마디란 위치로 잘 가다가 즉시 윗쪽 점프 호소):
    - **헛다리 짚은 시도**: useFocusEffect 패턴 / lastWhispersHandledRef 가드 점검
    - **진짜 원인**: ⭐ **multi-retry 클램핑 함정 + 첫 land 후에도 retry 계속 발화**
      - `<View onLayout>`이 cold-start mount 시 첫 paint 직전 transient 단계에서 매우 작은 양수 y(예: 8) 잠깐 보고
      - whispersYRef가 8로 set → scrollTo(max(0, 8-16)) = scrollTo(0)
      - 첫 retry 정상 land 후 2초 뒤 두 번째 retry가 잘못된 값으로 다시 호출
    - **해결**:
      ```typescript
      let landed = false;
      const doScroll = () => {
        if (landed) return;          // layer 2: land 후 skip
        const y = whispersYRef.current;
        if (y < 50) return;          // layer 1: bogus value 가드
        scrollRef.current.scrollTo({ y: y - 16, animated: false });
        landed = true;
        for (const h of retryHandles) clearTimeout(h);  // 남은 retry cancel
      };
      ```
- **핵심 학습**:
  1. **multi-retry는 land 후 cancel 필수** - 안 그러면 늦은 retry가 다시 잘못된 값으로 호출
  2. **onLayout transient 값 주의** - 첫 paint 직전에 작은 양수 y 잠깐 보고 가능 → minimum threshold 가드 필요

---

### 3-14. [앱] 5-D 채팅 푸시 - 메인 + 채팅창 자동 오픈
- **한 줄 요약**: 채팅 푸시 탭 시 메인 + 채팅 floating 위젯 자동 오픈
- **관련 파일**:
  - functions/src/triggers/chat.ts (link 추가, messageId 박아 unique URL)
  - dawnlight-app/src/components/FloatingChat.tsx
- **오류 / 함정** (회귀 1번):
  - **1차 작업**: useLocalSearchParams로 chat param 받음 + InteractionManager + 500ms gate
  - **회귀 증상**: 푸시 탭 시 메인 페이지만 보이고 채팅창 자동 오픈 X
  - **헛다리 짚은 가설**: nickname race / setOpen 호출됐는데 close / unmount race
  - **진짜 원인**: ⭐ **글로벌 오버레이의 useLocalSearchParams 한계**
    - FloatingChat은 (tabs)/_layout.tsx의 글로벌 오버레이
    - `useLocalSearchParams`는 호출 컴포넌트가 속한 route segment의 params만 받음
    - layout segment(`/(tabs)`)는 보통 빈 params → chatParam 항상 null
  - **해결**:
    ```typescript
    - import { useLocalSearchParams } from "expo-router";
    + import { useGlobalSearchParams } from "expo-router";
    
    - const params = useLocalSearchParams<{ chat?: string }>();
    + const params = useGlobalSearchParams<{ chat?: string }>();
    ```
  - **expo-router 두 hook 차이**:
    - `useLocalSearchParams`: 호출 컴포넌트가 속한 route segment의 params
    - `useGlobalSearchParams`: 현재 URL bar의 active route params
- **핵심 학습**: ⭐ **_layout.tsx에 mount된 글로벌 컴포넌트는 useLocalSearchParams 대신 useGlobalSearchParams 사용 필수**

---

