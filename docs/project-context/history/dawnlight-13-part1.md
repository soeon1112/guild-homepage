# dawnlight-13-part1: 페이지화 후속 + P2 splash 빌드 + cold-start defer

> **기간**: 2026-05-09 저녁 ~ 2026-05-10 새벽 (compaction 이전 구간)
> **연속**: dawnlight-12-part3 직후 — 모달→페이지 전환(Step 1~6) 작업 종료 후, 잔여 fix + 빌드 + 새 deep-link 회귀 발견까지
> **분량 큰 마라톤이라 part1/part2 분할** — part1은 compaction 이전, part2는 deep-link 4-cycle 마라톤 + 빌드 #10 + 분배

---

## 1-1. [공통][결정] dawnlight-13 시리즈 시작 결정
**한 줄**: 모달→페이지 전환 후속 작업이 워낙 많아져 dawnlight-12-part4가 아닌 dawnlight-13-part1으로 새 시리즈 시작

**배경**:
- dawnlight-12 시리즈는 part1/part2/part3로 페이지화 작업(Step 1~6) 완료
- 이번 채팅 작업이 그 후속이라 -part4로 갈지 -13으로 갈지 결정 필요
- 작업 분량이 빌드 + deep-link 마라톤까지 포함 → 새 시리즈로 묶는 게 인덱스 관리에 깔끔

**결정**:
- dawnlight-13-part1 (이 파일): compaction 이전 — 페이지화 후속 fix + 빌드 + cold-start defer + Fix B 회귀
- dawnlight-13-part2: compaction 이후 — deep-link 4-cycle 마라톤 + cleanup OTA + 빌드 #10 + 분배

---

## 1-2. [앱][공통] 댓글 박스 layout fix
**한 줄**: 페이지화 직후 댓글 박스의 reply input layout 회귀 — flex / minWidth 정리

**관련 파일**:
- `src/components/comments/PhotoCommentItem.tsx`
- `src/components/comments/PhotoComments.tsx`

**배경**:
- Step 4-A/4-B에서 앨범/미니홈피 사진 본문을 페이지화하면서 PhotoComments / PhotoCommentItem를 그대로 이식
- 페이지 컨테이너 레이아웃이 모달과 다르다 보니 reply input가 줄바꿈/넘침
- 양피지 cream 박스 안에서 input width 계산이 깨짐

**진단/함정**:
- 추측 단계: "padding 부족이지" → 부족 이유 안 됨
- 진단: input flex: 1 + 부모 컨테이너의 minWidth 0 누락 → flexbox shrink 안 일어남
- React Native flex 함정: 자식이 flex: 1이어도 부모가 minWidth 0 없으면 측정 단계에서 overflow

**결정**:
- reply input 컨테이너에 `minWidth: 0` + `flexShrink: 1` 명시
- 댓글 list 자체는 View map (FlatList 안 씀, 페이지 안에 들어가니까)
- commit `34efd78`

---

## 1-3. [앱][공통] 하단 네비바 통일 동작 (uiBus emitTabReset)
**한 줄**: BottomNav의 같은 탭 재탭 시 root 복귀 동작을 uiBus 이벤트로 통일

**관련 파일**:
- `src/lib/uiBus.ts`
- `src/components/BottomNav.tsx`
- `app/(tabs)/_layout.tsx`
- `app/(tabs)/members/_layout.tsx`

**배경**:
- 페이지화 후 nested Stack(album, members) 내부에서 같은 탭 재탭 시 동작 일관성 필요
- 사용자 시나리오: 미니홈피 사진 본문에서 BottomNav "내공간" 다시 누름 → 미니홈피 root로 복귀해야
- 모달 시절엔 모달 닫고 그만이었지만, 페이지화 후엔 nested Stack의 [id] 페이지에서 시작 root로 가야

**진단/함정**:
- BottomNav 분기 C noop 첫 fix (commit `76376ad`) — 1차 수정
- 사용자 보고: "내공간" 첫 진입 시엔 본인 미니홈피로 가는데, 길드원 미니홈피 본 뒤에 같은 탭 누르면 비작동
- 2차 진단: nested Stack의 nestedState가 처음엔 undefined → undefined 케이스 누락
- 2차 fix (commit `b151fa4`): nestedState undefined일 때도 root reset emit

**결정**:
- uiBus에 `emitTabReset(tabKey)` / `useTabReset(tabKey, callback)` 패턴 추가
- BottomNav의 active 탭 재탭 감지 → emitTabReset 발화
- 각 nested Stack의 root index에서 useTabReset listen → router.dismissAll + scrollTo top
- nestedState undefined / null 둘 다 reset 처리
- commit `e496f8b`, `76376ad`, `b151fa4`

---

## 1-4. [공통][디자인] DatePickerModal shared 분리
**한 줄**: 일정 작성 페이지의 DatePicker가 다른 곳에서도 쓰이게 되어 shared 컴포넌트로 분리

**관련 파일**:
- `src/components/shared/DatePickerModal.tsx` (신규)
- `app/(tabs)/schedule/new.tsx` 등 호출 사이트

**배경**:
- 페이지화 직후 일정 작성에서 쓰던 DatePicker가 페이지 내부 모달이라는 미묘한 위치에 있었음
- 다른 페이지(편지, 캐릭터 생일 등)에서도 같은 패턴 필요 → shared로

**결정**:
- `src/components/shared/DatePickerModal.tsx` 신설
- props: visible, value, onChange, onClose, mode (date | time | datetime)
- 내부 RN Modal 사용 — 단 페이지 내부에서만 잠깐 뜨는 작은 picker라 키보드 회피 이슈 영향 없음
- commit `672e5fa`

---

## 1-5. [디자인] 새 앱 아이콘 디자인 — Concept 5종 검토 후 Concept 2 선택
**한 줄**: 기존 아이콘 리뉴얼 — 5개 컨셉 SVG 시각화 후 길드 정체성에 맞는 Concept 2 선택

**관련 파일**:
- `assets/icon.png` (1024x1024)
- `assets/adaptive-icon.png` (안드 foreground)
- `app.json` icon / adaptiveIcon 설정

**배경**:
- 기존 아이콘이 임시 디자인 — 새벽빛 길드 cosmic 테마에 안 맞음
- 길드 무드: 새벽빛, 별, 항해, 동료감
- 5개 컨셉 SVG 시각화 (이전 채팅 transcript에 컨셉별 코드)

**컨셉 5종**:
1. 별자리 + "새벽빛" 글자
2. 새벽 그라데이션 + 별 한 점 (선택)
3. 항해선 + 등불
4. 길드 문장 (왕관/방패)
5. 미니멀 별 + 빛줄기

**결정**:
- Concept 2 채택 — 새벽 그라데이션(어두운 보라 → 따뜻한 살구) 위에 별 한 점
- adaptiveIcon backgroundColor `#fef5e6` (살구 cream)
- splash backgroundColor 별도 결정 필요 (1-7 항목)
- commit `5c97dbb`

---

## 1-6. [공통][결정] 빌드 vs OTA 구분 원칙 재확인
**한 줄**: 아이콘/splash/native dep 변경은 빌드, JS 변경은 OTA — 원칙 재확인

**배경**:
- 새 아이콘 디자인 적용 시점에 OTA로 가능한지 문의
- 결론: 아이콘은 native asset이라 OTA 불가, 빌드 필요
- 같이 묶을 변경: splash 새 디자인, dead code import 정리, 새 deep-link route 등록(이 시점엔 아직 모름)

**결정**:
- iOS production + Android preview 둘 다 빌드
- 누적된 변경 묶어서 한 번에 빌드 (시간 절약)
- 빌드 후엔 OTA 가능한 fix만 OTA로

---

## 1-7. [디자인] P2 splash screen 처리
**한 줄**: 새 아이콘 빌드 시 splash backgroundColor 함께 변경 안 했더니 까만 화면(RN 기본) 회귀

**관련 파일**:
- `app.json` splash 섹션
- `assets/splash-icon.png` (cosmic 보라 — 기존)

**배경**:
- Step 5 (avoid-softinput 제거 + 새 빌드) 시 splash 처리 누락
- 사용자 보고: "앱 실행 시 까만 배경(RN 기본 디자인) 슬쩍 보임" — splash 회귀
- 진단 결과: splash-icon.png는 cosmic 보라 그대로, splash.backgroundColor `#0b0821` 그대로 → P2 (빌드 필요, 별도 처리)

**원인 분석**:
- 새 아이콘 디자인 시 adaptiveIcon backgroundColor를 #fef5e6(cream)로 변경
- splash는 기존 cosmic 보라(#0b0821) 그대로
- 결과: 앱 실행 → cosmic splash → JS bundle load 후 cream UI = 색상 충돌

**결정**:
- splash.backgroundColor cosmic 보라(#0b0821) → cream(#fef5e6)으로 변경
- splash-icon.png는 그대로 (cosmic 별 디자인 유지)
- → 별도 빌드 필요 (P2 — P0/P1과 분리)
- commit `e1743f5` (P2 splash 빌드 commit)

---

## 1-8. [공통] react-native-avoid-softinput 라이브러리 정리
**한 줄**: Phase 12 키보드 회피 마라톤 때 시도했던 native 라이브러리 dependency 제거

**관련 파일**:
- `package.json`
- `ios/Podfile.lock`
- `android/app/build.gradle`

**배경**:
- 직전 채팅(dawnlight-12-part1)에서 키보드 회피 12 phase 마라톤
- 마지막에 react-native-avoid-softinput 시도 → 모달 안에서 작동 안 함
- 페이지화 방향 전환 결정 → 라이브러리 더 이상 필요 없음
- Step 5에서 정리

**결정**:
- pnpm remove react-native-avoid-softinput
- pod install + native dep 정리
- 빌드에 함께 포함

---

## 1-9. [앱] iOS Build #10 + Android preview 빌드
**한 줄**: 새 아이콘 + splash + 라이브러리 정리 누적 빌드

**환경 (재확인)**:
- expo SDK 54, RN 0.81.5
- iOS production 채널 + Android preview 채널
- ascAppId: 6764057168
- 자동 배포 정책: iOS production / Android preview

**빌드 결과**:
- iOS Build #10: `dd397e25-144a-49e5-95bb-6f6df39cda7a`
  - IPA: https://expo.dev/artifacts/eas/tjqVGpP1aUPpjmyeAhygdE.ipa
- Android preview: `d833a747-053b-4985-8e73-41d081e9ffac`
  - https://expo.dev/accounts/eonsom/projects/dawnlight-app/builds/d833a747-053b-4985-8e73-41d081e9ffac
- Commit: `e1743f5` (P2 splash 빌드)

---

## 1-10. [앱][공통] 사용자 분배 + 첫 회귀 보고
**한 줄**: 길드원 분배 후 3가지 회귀 동시 보고됨

**사용자 보고 (3건)**:
1. ⭐ **"← 사진첩으로" / "← 앨범으로" 작동 안 함**: 화면 깜빡임 + 본문에 머무름 (페이지화 직후 OTA의 router.replace 패턴 회귀)
2. **cold-start 첫 deep-link 시도 시 "존재하지 않는 사진" + iOS 일부 충돌**: 어플 재시작 후 두 번째 시도부터 정상
3. **앱 실행 시 까만 배경 슬쩍**: P2 splash 회귀 (1-7에서 진단됨, 별도 빌드 필요)

**우선순위 결정**:
- P0: 문제 1 (← 사진첩으로 회귀) — 가장 시급, 화면 깜빡임 = 사용자가 직접 막힘
- P1: 문제 2 (cold-start race) — 확정, fix 즉시 적용 가능
- P2: 문제 3 (splash) — 빌드 필요, 별도 처리

**원칙 확인**:
- 가설 만들지 마, 디버그 박스로 확정 후 fix
- iOS / Android 둘 다 동일 증상 — RN race 패턴

---

## 1-11. [앱] P1 cold-start defer (InteractionManager.runAfterInteractions)
**한 줄**: 푸시 알림 cold-start 시 PushTapHandler가 Stack mount 완료 전에 router.push해서 race

**관련 파일**:
- `app/_layout.tsx` — PushTapHandler

**배경**:
- 사용자 보고 #2 (1-10): cold-start 첫 deep-link 시도 시 실패
- 어플 재시작 후 두 번째 시도부터 정상
- 패턴: dawnlight-08-push-deeplink.md의 "cold-start gesture race"와 동일

**진단**:
- expo-notifications의 `getLastNotificationResponseAsync()` 호출이 Stack mount 완료 전에 실행됨
- 그 시점에 router.push 호출 → expo-router가 아직 준비 안 된 상태
- 결과: route resolve 실패 → "존재하지 않는 사진" Alert
- iOS 일부 케이스에선 native crash까지 (Stack mount race)

**Fix 코드 패턴**:
```ts
useEffect(() => {
  const sub = Notifications.addNotificationResponseReceivedListener((res) => {
    const link = res?.notification?.request?.content?.data?.link;
    if (typeof link === "string") navigateLink(link);
  });
  if (!coldStartHandledRef.current) {
    coldStartHandledRef.current = true;
    // ⭐ cold-start은 Stack mount 완료 후 처리 (race 방지)
    InteractionManager.runAfterInteractions(() => {
      Notifications.getLastNotificationResponseAsync()
        .then((res) => {
          const link = res?.notification?.request?.content?.data?.link;
          if (typeof link === "string") navigateLink(link);
        })
        .catch(() => {});
    });
  }
  return () => sub.remove();
}, []);
```

**검증**:
- OTA 적용 (강제 종료 2회 후 cold-start) → 첫 시도부터 정상
- iOS 충돌 없음
- Warm-tap (이미 켜진 상태에서 알림 클릭)은 listener 그대로 — 영향 없음

**결정**:
- 확정 fix, OTA 즉시 적용
- 이후 모든 cold-start 처리에 같은 패턴 적용 권고

---

## 1-12. [앱] Fix B — "← 사진첩으로" / "← 앨범으로" router.replace 패턴 (P0 1차 시도)
**한 줄**: 본문 페이지에서 backLink 누를 때 photoParam이 sticky하게 남아 redirect 사이클 유발

**관련 파일**:
- `app/(tabs)/members/photo.tsx` — onPress (line 211 근처)
- `app/(tabs)/album/photo.tsx` — onPress (line 203 근처)
- `app/(tabs)/members/[id].tsx` — photoParam useEffect
- `app/(tabs)/album/index.tsx` — photoParam useEffect

**배경**:
- 사용자 보고 #1: 화면 깜빡 + 본문 머무름
- 처음엔 추측: "router.back() 대신 router.replace 패턴이 잘못됐나?"
- 진단 vs 추측 — 일단 디버그 박스로 확정 필요 (1-13 항목)

**최초 가설(추측 단계)**:
- router.replace의 params가 이전 URL의 photo query를 자동으로 안 지움
- 그래서 [id].tsx mount 시 photoParam이 여전히 살아있음
- photoParam useEffect가 redirect를 다시 trigger → photo.tsx 다시 mount → 깜빡임

**Fix B 시도(가설 기반, 추측 단계)**:
- members/photo.tsx onPress에서 router.replace 시 photo/comment param **명시적으로 빈 문자열로 덮어쓰기**
  ```ts
  router.replace({
    pathname: "/members/[id]",
    params: { id: memberId, section: "minihome-photos", photo: "", comment: "" },
  });
  ```
- album/photo.tsx 동일 패턴 (id 페이지로 가는 게 아니라 album/index로)

**Fix A 추가 가드**:
- members/[id].tsx photoParam useEffect 안에서 sectionParam 가드:
  ```ts
  if (sectionParam) {
    if (isDebugUser) emitDebugLog("[ID_PHOTO_EFFECT]", "skipped (section present)", { sectionParam });
    return;
  }
  ```
- 의미: section 명시적 destination으로 왔으면 photo redirect skip

**OTA 1 (Fix A + Fix B 동시 적용)**:
- 사용자 검증 결과 부분 호전 — 깜빡임은 줄었지만 완전히 사라지진 않음
- 다른 회귀 패턴이 더 있음 (1-14 ~ 디버그 박스 + part2 4-cycle 마라톤으로 이어짐)

---

## 1-13. [앱] BackLinkDebugBox 디버그 인프라 도입
**한 줄**: console.log는 사용자가 디바이스 콘솔 못 보니 무용지물 — 화면 디버그 박스로 전환

**관련 파일**:
- `src/components/_debug/BackLinkDebugBox.tsx` (신규)
- `src/lib/uiBus.ts` — emitDebugLog / useDebugLog / clearDebugLog 추가

**배경**:
- Fix B 시도 후에도 회귀 잔존 + 새로운 mismatch 패턴 보고됨
- "alarm 1 정상, alarm 2 실패" 같은 랜덤 케이스 — 추측으로 못 잡음
- console.log 추가 OTA했지만 사용자가 Mac/Console.app 안 씀 → 무용
- ⭐ **화면 디버그 박스 + 사용자 한정 가드**가 정답

**디버그 박스 사양**:
- 위치: `src/components/_debug/BackLinkDebugBox.tsx`
- 사용자 한정 가드: `loginNick === "언쏘"` (다른 길드원 0 영향)
- 위치: `position: 'absolute', bottom: 100, right: 8` (BottomNav 위쪽)
- 크기: width 240, maxHeight 280 (이후 360으로 확장)
- 배경: `rgba(0,0,0,0.85)`, 글자 #fff8d6, fontSize 9
- zIndex 9999 + `pointerEvents: 'box-none'` (박스 자체 터치 통과)
- 최근 이벤트 15개 → 25개 (확장 시)
- 각 줄: `HH:MM:SS.mmm CATEGORY message` + 다음 줄 데이터 들여쓰기
- "지우기" 버튼 + "닫기 X" 버튼 (트리거만 보이게)

**uiBus 확장**:
```ts
// emit
emitDebugLog(category: string, message: string, data?: any)
// hook
useDebugLog(maxEntries?: number) → entries[]
// clear
clearDebugLog()
```

**호출 사이트 (1차 추가)**:
- `members/photo.tsx`: mount/unmount/fetch result/onPress/router.replace called
- `album/photo.tsx`: 동일 패턴 ([ALBUM_PHOTO] / [BACK_LINK] album/photo)
- `members/[id].tsx`: photoParam useEffect entered/redirecting/skipped
- `members/[id].tsx`: sectionParam useEffect entered/scrolling
- `album/index.tsx`: photoParam useEffect entered/redirecting

**Mount 위치**:
- `app/_layout.tsx` 또는 `(tabs)/_layout.tsx` 자식
- 모든 페이지 위에 보이게 (StatusBar / BottomNav 가림 없도록 위치 조정)

**디버그 박스 라이프사이클** (이번 part1 + part2 동안):
1. 1차 추가 (이 시점, commit `7d937a0`)
2. 추가 호출 사이트(`4829fc8`): WhispersFeed onPress, navigateLink push, [id] params snapshot, photo ALERT not found, PhotosSection D2 onPress
3. cleanup OTA 1차 (`2520f83`) — Fix B 검증 통과 후 제거 시도
4. 회귀 재발견 → 재추가 (다음 단계)
5. 4-cycle 마라톤 → 최종 cleanup OTA (part2 마지막)

**원칙 (확립)**:
- 가설 1번 실패 시 즉시 디버그 인프라
- 디버그 박스는 사용자 한정 (다른 길드원 0 영향)
- 추측 5번보다 디버그 1번이 빠름
- 사용자 발견 시나리오는 정확함 — 그대로 시나리오 재현해서 캡처

---

## 1-14. [앱][결정] cleanup OTA 1차 + 디버그 박스 재추가
**한 줄**: Fix B 부분 호전 후 디버그 박스 제거 OTA → 사용자가 또 다른 회귀 발견 → 재추가

**관련 commits**:
- `2520f83` — cleanup OTA 1차 (디버그 박스 제거)
- `7d937a0`, `4829fc8` — 디버그 박스 재추가 + 추가 호출 사이트 (PHOTOS_SECTION_TAP 포함)

**배경**:
- Fix B 검증 시 일부 시나리오 통과 → "fix됐다" 판단 → 디버그 박스 제거 OTA
- 그러나 사용자가 다른 시나리오에서 회귀 재발견:
  - "알림 1 → 본문 → ← 사진첩으로 → 알림 2 클릭 → 본문 안 들어가짐 ('존재하지 않는 사진' Alert)"
- 이건 Fix B로 해결 안 되는 다른 race
- 디버그 박스 재추가 + 더 많은 호출 사이트 ([WHISPERS_TAP], [NAVIGATE_LINK], [PHOTOS_SECTION_TAP])

**핵심 학습** (성급한 cleanup 금물):
- "한 시나리오 통과 = fix 완료" 아님
- 사용자가 발견한 모든 시나리오 5~10회 반복 검증 후에만 cleanup
- 분배 전 시나리오 검증 강제 (이후 정착)

---

## 1-15. [공통][결정] 작업 일지 작성 시도 (single file 425줄)
**한 줄**: 4-cycle 마라톤 직전, 작업 분량 많아져 작업 일지 part1.md 작성 시도 → 425줄 단일 파일 작성 → 사용자가 분할 재작성 요청

**배경**:
- 새 시리즈(dawnlight-13) 시작 시점
- 1-1 ~ 1-14 + 4-cycle 마라톤(part2 영역)이 한 채팅에 다 들어가서 분량 폭증
- 일단 단일 파일로 작성 → 425줄
- 새 채팅에서 사용자가 "compaction 이전/이후 시간순 분할 재작성" 요청

**결정**:
- 시간순 분할: part1 = compaction 이전, part2 = compaction 이후 (이 파일이 part1)
- 가이드라인:
  - 같은 주제 묶기
  - 추측 → 진단 → 진짜 원인 패턴 강조
  - 태그 [홈페이지][앱][공통][결정][디자인]
  - 항목 형식: `N-N. [태그] 한 줄 제목` + 한 줄 요약 + 관련 파일 + 배경 + 오류/함정 + 결정 사항
  - 600줄 넘으면 분할
  - 핵심 학습 + PENDING 마지막

---

## ⭐ part1 핵심 학습

### A. 빌드 vs OTA 구분 원칙
- **빌드 필요**: 아이콘, splash, native dep, app.json native config
- **OTA 가능**: JS 변경, expo-router route 추가/제거, 컴포넌트 수정
- 누적 변경 묶어서 한 번에 빌드 (시간/사용자 재설치 부담 절약)

### B. 추측 → 진단 전환 시점
- **가설 1번 실패 시 즉시 디버그 인프라**
- 추측 5번 시도 후 진단으로 가는 건 시간 낭비
- 사용자 발견 시나리오는 정확하니 그대로 재현

### C. 화면 디버그 박스가 console.log보다 우월
- 사용자가 디바이스 콘솔 못 봄 (Mac/Xcode 없음)
- 화면 디버그 박스 + 사용자 한정 가드(`loginNick === "언쏘"`)
- 다른 길드원에게 0 영향 — 안전한 디버깅

### D. cleanup OTA는 검증 5~10회 후에만
- "한 시나리오 통과 = fix 완료"는 함정
- 사용자가 알린 모든 시나리오 반복 검증
- 분배 전 시나리오 강제 검증 (이번에 학습)

### E. cold-start race는 InteractionManager로 해결
- expo-notifications cold-start handler가 Stack mount 전에 실행됨
- `InteractionManager.runAfterInteractions(() => ...)`로 wrap
- 모든 native cold-start 처리에 같은 패턴 적용

### F. expo-router router.replace의 sticky params 함정
- router.replace로 새 params 줘도 이전 URL의 query string 자동 안 지움
- → photoParam이 sticky하게 남음
- 명시적으로 `params: { ..., photo: "", comment: "" }` 빈 문자열 덮어쓰기 필요
- + photoParam useEffect에서 sectionParam 가드 (Fix A)

---

## PENDING — part2로 이어지는 작업

1. **deep-link 4-cycle 회귀 마라톤** (part2):
   - Fix A + Fix B로 부분 호전 후에도 잔존 회귀
   - 디버그 박스 캡처 분석 → 새 root cause 발견
   - 4 cycles의 fix 마라톤 (각 cycle별 다른 root cause)
   - usePathname 가드 fix가 최종 해결

2. **빌드 #10 P2 splash** — 이미 완료 (1-9), part2의 분배 단계로 이어짐

3. **최종 cleanup OTA + 분배** — part2

4. **다음 채팅 PENDING** (part2 마지막에서 명시):
   - ⭐ @닉네임 멘션 알림 작업
   - dead code 정리 (KeyboardDebugBox, AlbumPhotoViewer/MinihomePhotoViewer의 PhotoViewerModal 함수, AuthModal.tsx, CharacterForm.tsx 849줄, modalKeyboard.ts liftSv)
   - 미래 알람: Firestore 보안 규칙 만료 (2027-05-01), TestFlight 90일

---

**part1 끝 → part2(deep-link 4-cycle 마라톤 + cleanup + 빌드 + 분배)로 계속**
