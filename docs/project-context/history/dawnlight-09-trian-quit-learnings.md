# Dawnlight 작업 일지 v4 - Part 3 (마지막)

**기간**: 2026-05-06
**핵심 주제**: 길드원 길탈 처리 + 핵심 학습 정리

---

## 4. 길드원 길탈 처리

### 4-1. [Firestore] 트리앤 길탈 - 흔적 정리
- **한 줄 요약**: 길드원 트리앤 길탈, 본인 데이터 모두 삭제, 다른 사람 데이터는 보존
- **결정 사항**:
  1. titleWords 2개 → A. doc 삭제 (다른 길드원 새로 구매 가능)
  2. activity 7건 (트리앤 본인 활동) → A. 전부 삭제
  3. pushToken 삭제 → 의도 (길탈했으니 당연)
  4. users/트리앤 doc 삭제 → 의도 (닉네임 다시 쓸 수 있게)
- **apply 결과**:
  - users/트리앤 + 서브컬렉션 (46 docs)
  - members/13 + guestbook 등 (13 docs)
  - petChatLogs/트리앤 + messages (9 docs)
  - activity[nickname=트리앤] (7 docs)
  - characters[owner=트리앤] + history (5 docs)
  - titleWords[owner=트리앤] (2 docs)
  - **합계: 82 docs 삭제**
- **백업 위치**: `guild-homepage/backups/trian-2026-05-06/` (15개 JSON, 복구 가능)
- **보존**:
  - 다른 사람이 트리앤에게 남긴 활동 3건 (검성/Annakiria/언쏘 방명록)
  - users/{X}/visitedMinihomepages 배열의 "트리앤" (배지 카운트용)
  - users/{X}/guestbookTargets 배열의 "트리앤" (배지 카운트용)
- **재사용 가능**: scripts/delete-trian.mjs (다음 길탈자 있을 때 닉네임만 바꿔서 재사용)

---

## 5. 핵심 학습 (다음 작업 시 함정 안 빠지게)

### 5-1. ⭐ Next.js App Router useSearchParams race
- **함정**: 모바일 사파리에서 mount 직후 첫 render에 빈 값 반환
- **봉인**: `useDeepLinkParam(key)` hook 사용 (guild-homepage/src/lib/useDeepLinkParam.ts)
- **새 deep-link 작업 시**: hook만 사용하면 race 영구 봉인
- **만약 hook 못 쓰는 환경**: `useState lazy initializer` + `useSearchParams ?? initial` fallback + useEffect 안에서 fresh 재측정

### 5-2. ⭐ firebase-functions v2 path wildcard mojibake
- **함정**: 한글 doc id가 Latin-1로 잘못 해석되어 mojibake (예: "언쏘" → "ì¸ì")
- **봉인**: 모든 trigger에서 path wildcard 받자마자 UTF-8 재해석
  ```typescript
  const owner = Buffer.from(event.params.owner, "latin1").toString("utf8");
  ```
- **영향 범위**: 한글 nickname을 path wildcard로 받는 모든 trigger
- **영향 없는 trigger**: numeric slot id (`/members/{memberId}`) 또는 auto-generated Firestore IDs

### 5-3. ⭐ Cold-start gesture race (푸시 탭 직후 모달/위젯)
- **함정**: 푸시 탭 touch event가 다음 화면의 backdrop/close 핸들러로 bleed
- **봉인**: InteractionManager + 500ms gate
  ```typescript
  const interactionHandle = InteractionManager.runAfterInteractions(() => {
    timer = setTimeout(() => setOpen(true), 500);
  });
  return () => {
    interactionHandle.cancel();
    if (timer) clearTimeout(timer);
  };
  ```
- **적용 대상**: 푸시 탭 후 자동 오픈되는 모든 모달/위젯 (5-E 편지함, 5-D 채팅, 5-C 한마디 스크롤)

### 5-4. ⭐ expo-router 글로벌 오버레이 hook 선택
- **함정**: `_layout.tsx`에 mount된 컴포넌트(FloatingChat 등)에서 `useLocalSearchParams` 사용 시 layout segment params만 받아 빈 값
- **봉인**: 글로벌 오버레이는 `useGlobalSearchParams` 사용
- **차이**:
  - `useLocalSearchParams`: 호출 컴포넌트가 속한 route segment params
  - `useGlobalSearchParams`: 현재 URL bar의 active route params

### 5-5. ⭐ multi-retry 패턴은 land 후 cancel 필수
- **함정**: multi-retry [100, 500, 1500, 3000]ms 중 늦은 retry가 잘못된 값으로 다시 호출
- **봉인**:
  ```typescript
  let landed = false;
  const doScroll = () => {
    if (landed) return;
    const y = ref.current;
    if (y < 50) return;  // bogus value 가드
    scrollTo(y);
    landed = true;
    for (const h of retryHandles) clearTimeout(h);  // 남은 retry cancel
  };
  ```
- **추가**: onLayout transient 값(첫 paint 직전 작은 양수) 가드 필요

### 5-6. ⭐ RN useFocusEffect로 ref reset (재진입 봉인)
- **함정**: 앱(RN)은 페이지 unmount 안 되니까 boolean 가드 ref가 한 번 set되면 reset 안 됨
- **봉인**:
  ```typescript
  useFocusEffect(useCallback(() => {
    // 자동 오픈 로직
    return () => { lastOpenedIdRef.current = null; }; // 페이지 떠날 때 reset
  }, []));
  ```
- **적용 대상**: 같은 deep-link으로 재진입 가능해야 하는 모든 자동 오픈

### 5-7. ⭐ Functions 자동 정규화 (race-leak 영구 봉인)
- **함정**: OTA 미수령 사용자가 옛 형식 doc 작성 → 매번 마이그레이션
- **봉인**: functions onActivityCreated에서 doc 생성 직후 자동 정규화
- **장점**: 클라이언트 OTA 무관, idempotent (신규 형식이면 no-op), 마이그레이션 영구 불필요

### 5-8. ⭐ 추측 금지, 진단 로그부터
- **패턴**: 같은 race로 여러 번 헛다리 짚는 케이스 반복
- **올바른 절차**:
  1. 디버그 박스 또는 logger.info를 각 분기/시점에 박기
  2. 어느 guard에서 bail하는지 / 어떤 값이 들어오는지 정확히 보기
  3. 그 후 진짜 원인 fix
- **가치 있는 사례**:
  - 1-4 모험기록/사진 race (12시간, 추측 8번 후 진짜 원인 발견)
  - 3-5 키워드 mojibake (진단 로그 박은 후 발견)

### 5-9. ⭐ 푸시 작업은 앱만 적용
- **결정**: 푸시는 앱에서만 발생 → 웹 작업 사실상 무의미
- **예외**: 직접 진입점(편지함 버튼 등) 있는 모달/위젯은 양 레포 일관성 위해 처리

### 5-10. ⭐ OTA 적용은 콜드 스타트 2회 필요
- **메커니즘**: ForceOtaCheck가 mount 시 OTA 다운로드 → 다음 콜드 스타트에서 적용
- **사용자 안내**: 앱 강제 종료 → 재실행 → 또 강제 종료 → 재실행 (2회)
- **race-leak 시나리오**: functions 새 코드 + 앱 옛 코드 → 새 link 형식 못 처리 → Unmatched Route 에러

### 5-11. ⭐ 모달 백드롭 일관성 (양 레포 동시 적용)
- **원칙**: 모달/UI 변경 시 항상 양 레포 (홈피 + 앱) 동시 명시
- **예외**: 푸시 deep-link 등 한쪽만 영향 가는 작업은 영역 명확히

### 5-12. 길탈 처리 패턴
- **흔적 정리 작업**:
  - dry-run으로 컬렉션별 매칭 확인
  - 본인 데이터 / 다른 사람 데이터 구분
  - titleWords / pushToken / user doc 옵션 사용자 결정
  - 백업 후 batch 삭제
- **재사용**: scripts/delete-{nickname}.mjs 패턴

---

## 6. 메모리 저장 사항 (Claude Code 메모리)

다음 두 가지 패턴이 메모리에 저장되어 미래 작업 시 자동 적용됨:

1. **firebase-functions v2 path wildcard mojibake**: 한글 doc id를 path wildcard로 받는 trigger는 무조건 `Buffer.from(...,"latin1").toString("utf8")` 적용
2. **expo-router 글로벌 오버레이 hook**: `_layout.tsx`에 mount된 컴포넌트는 `useGlobalSearchParams` 사용
3. **useDeepLinkParam hook**: 새 deep-link 작업 시 hook 사용 (race 봉인)

---

## 7. PENDING (검증 대기)

### 7-1. 5-B 칭호 검증
- **상태**: 코드는 들어감, 자연 검증 대기
- **검증 방법**: 다음에 누군가 칭호 조합 완성 시 푸시 받아 탭

### 7-2. 5-F 펫 검증
- **상태**: 코드는 들어감, 자연 검증 대기
- **검증 방법**:
  - 펫 선물: 길드원에게 부탁
  - status low: 30분 cron 자연 발생 기다리기

### 7-3. 5-C / 5-D / 5-E 푸시 검증
- **상태**: 사용자 1차 검증 OK
- **추가 검증**: 다양한 시나리오 자연 발생 시 확인

---

## 작업 통계

- **총 작업 시간**: 14시간+ (마라톤)
- **주요 영역**: deep-link 시스템 (최신현황 + 푸시)
- **회귀 fix 횟수**: 7+ (race 패턴 반복)
- **신규 인프라**:
  - `useDeepLinkParam` 공통 hook
  - functions 자동 정규화 (race-leak 영구 봉인)
- **신규 패턴 봉인**:
  - useSearchParams race
  - firebase-functions v2 mojibake
  - cold-start gesture race
  - 글로벌 오버레이 hook 선택
  - multi-retry land 후 cancel
  - useFocusEffect ref reset

---
