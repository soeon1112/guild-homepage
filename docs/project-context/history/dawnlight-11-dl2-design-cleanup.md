# 새벽빛 작업 일지 v4 — Part 2
## 2026-05-08 (Dawnlight 2 마무리 라운드)

> Part 1 의 디자인 정리 이후, 앱 호환성 / 모든 길드원 공개 / cosmic 부분 폐기까지.

---

## 2-1. [앱] 앱 앨범 모달 원본 사진 안 뜸 수정
- **한 줄 요약**: 앱 앨범 게시판 미리보기 사진 클릭 시 모달 안 원본 사진 영역이 빈 공간 → 정상화.
- **배경**: 미니홈피 사진첩 모달은 정상 동작, 앨범만 사진 안 뜸.
- **오류 / 함정**:
  - 의심 원인: source uri / width-height 0 / contentFit / expo-image vs RN Image
  - Claude Code 진단 후 정확한 spec 적용

## 2-2. [공통] 미니홈피 사진첩 모달 원본 사진 표시 (cover X)
- **한 줄 요약**: 미니홈피 사진첩 모달 안 사진이 cover (잘림) 으로 표시 → contain 또는 원본 비율로 변경.
- **배경**: 미리보기는 cover (정사각 폴라로이드) OK, 모달은 원본이어야 함.
- **함정**: 폴라로이드 패턴 코드를 모달에도 그대로 적용한 잘못.

## 2-3. [앱] 앱 노을 그라데이션 비율 조정
- **한 줄 요약**: 앱 메인 배경 LinearGradient stop 위치 조정. 남색 비율 줄이고 노을 (warm peach) 위로 올림.
- **배경**: 웹은 비율 OK, 앱만 남색 너무 많아 cosmic 우주와 차별 약함.
- **결정 사항**: 앱만 변경 (웹 그대로). stop 위치 70% → 50~60% 로.

## 2-4. [앱] 상점 / MY 페이지 폰트 미적용 수정
- **한 줄 요약**: 웹 상점/MY 폰트 적용됨, 앱만 미적용 → dl2 wrapper class / fontFamily 추가.
- **함정**: 다른 dl2 페이지 패턴 참조하여 통일. cosmic 폰트 (serif) override 잔존 가능.

## 2-5. [앱] 안드 출첵 후 글로우 효과 정상화
- **한 줄 요약**: 출첵 완료 후 "오늘의 항해를 기록했어요" 버튼 글로우가 안드만 옅음 / 위치 불명확 → 정상화.
- **오류 / 함정**:
  - **헛다리**: "오늘의 항해를 기록하기" (출첵 전) 버튼으로 오해 → 사용자 정정
  - **사용자 의도**: 출첵 완료 후 변경된 버튼 글로우
  - **해결**: shadowColor + shadowOffset + shadowOpacity + shadowRadius + **elevation 안드 필수** 패턴 적용
- **학습**: RN 안드 글로우는 elevation 없으면 거의 안 보임. iOS shadow* 만으로는 부족.

## 2-6. [공통] 익명 편지 모달 z-index 정리
- **한 줄 요약**: 메인 익명 편지 (PaperPlaneLetters) "띄우기 모달" + "편지함 모달" 이 하단바/채팅/펫 아이콘에 가려짐 → 최상단으로.
- **결정 사항**: z-index 9999 + 안드 elevation 24 패턴.

## 2-7. [공통] 모든 길드원에게 dawnlight2 공개 ⭐
- **한 줄 요약**: featureFlags.ts 의 isDawnlight2Enabled 가 모든 nickname 에 대해 true 리턴 (옵션 B).
- **관련 파일**: `guild-homepage/src/lib/featureFlags.ts:14-19`, `dawnlight-app/src/lib/featureFlags.ts:12-17`
- **배경**: 모든 길드원이 dl2 톤 보게 하기 위해.
- **결정 사항**:
  - 옵션 B 선택: `return true;` (단순 한 줄 변경)
  - DAWNLIGHT2_USERS 리스트는 historical 참고용 유지
  - nickname null 가드 유지 (비로그인 보호)
- **commit**: 2d7ad6b
- **OTA**: 안드 019e04e2 / iOS 019e04e3

## 2-8. [공통] cosmic 깜빡임 진단 + 결론 ⭐⭐ (가장 중요한 진단 패턴)
- **한 줄 요약**: 메인 진입 시 cosmic 우주 테마 잠깐 보이는 깜빡임 보고 → 진단 결과 hook 이미 항상 true → 구조적으로 깜빡임 불가능.
- **오류 / 함정** ⭐⭐⭐:
  - **사용자 보고 1**: "메인에서 자꾸 리뉴얼 화면 뜨기전에 기존 우주테마가 자꾸 뜨네"
  - **헛다리 1차 가설**: useDawnlight2 가 false → true 전환 시 깜빡임 → hook SSR 시점 dl2 강제 (한 줄 변경)
  - **사용자 보고 2**: "그 깜빡임 적용했는데도 깜빡이네; 어쩔 수 없나보네 이거 완전 폐기할 때까지는...맞아?"
  - **헛다리 2차 가설**: cosmic 분기 평가 자체가 깜빡임 원인 → cosmic 폐기 명령 던짐
  - **진단 결과** (Claude Code): hook 이미 항상 true → 구조적으로 깜빡임 불가능. cosmic 분기는 모두 dead code.
  - **사용자 재확인**: 실제 진입 시 깜빡임 안 보임 (이미 해결됨)
  - **진짜 원인 추정**: Vercel CDN edge cache 또는 OTA 도달 지연. 이전 빌드 hold.
- **결정 사항**:
  - 깜빡임 자체는 이미 해결
  - cosmic 폐기는 dead code 정리 효과만 → B 절충안 진행
- **학습** ⭐⭐⭐:
  - 사용자 보고 ≠ 즉시 가설로 점프. 진단 먼저.
  - **Vercel CDN edge cache + OTA 도달 지연 = 깜빡임 / 미적용 의심 1순위**
  - hook 이미 처리됐는지 verbatim grep 으로 검증.
  - "여전히 안 됨" 보고 시 코드 변경 제안 전 캐시 / 도달 지연 의심.

## 2-9. [공통] cosmic 우주 테마 부분 폐기 (B 절충안)
- **한 줄 요약**: featureFlags 정리 + cosmic 컴포넌트 파일 삭제. inline 분기 (~500곳) 는 dead code 로 남김.
- **관련 파일**:
  - 앱: `src/lib/featureFlags.ts` (DAWNLIGHT2_USERS / isDawnlight2Enabled 제거, useDawnlight2 hook 만 남기고 return true)
  - 홈피: `src/lib/featureFlags.ts` 동일
  - 앱: `src/components/CosmicBackground.tsx` 삭제 + 5 importer 정리 ((tabs)/_layout, mypage, shop, guild-test, admin/guild-test-results)
  - 앱: cosmic 메인 위젯 6종 삭제 (NebulaWhispers, TodaySky, ShootingStarLetter, WhispersToStars, StarOfDay, GuildTestBanner)
  - 앱: `(tabs)/index.tsx` → Dawnlight2MainPage 직접 return
  - 홈피: `app/components/redesign/CosmicBackground.tsx` 삭제
  - 홈피: `ChromeShell.tsx` → dl2 chrome 만 / `MainGate.tsx` → Dawnlight2MainPage 직접 return / cosmic 메인 위젯 6종 삭제
- **결정 사항**:
  - 옵션 B 절충안 (featureFlags 만 + cosmic 파일 삭제)
  - cosmic 컴포넌트 파일: 삭제 (git history 에 남음)
  - 양 레포 진행: 앱 먼저 → 홈피 (안전 우선)
- **commit**: 홈피 9060f23 / 앱 836eafe
- **OTA**: 안드 0786aa06 / iOS 3385b8ac
- **미정리** (다음 라운드, 추후 점진 정리):
  - CardNebula (BadgesSection 등 활성 dl2 path 와 얽힘)
  - TopHeader cosmic (dl2 Topbar 가 AuthModal/ErrorToast import)
  - CollapsibleSection / Wardrobe / KeywordsSection / BgmPlayer / ProfileSection / AdventureLogSection / GuestbookSection / PhotosSection cosmic 버전 (members/[id] binary search wiring 잔존)
  - inline `isDawnlight2 && dl2Styles.X` ~500 dead 분기

## 2-10. [결정] 앱 아이콘 변경 폐기
- **한 줄 요약**: 앱 아이콘 dl2 톤 변경 = native 리소스 (mipmap-*/ic_launcher.png 등) → OTA 불가, EAS Build 필수 → 빌드 부담으로 폐기.
- **결정 사항**: 다음 큰 기능 추가 시 같이 변경.

## 2-11. [결정] 메모리 정리 (#4, #8 해제)
- **해제된 메모리**:
  - #4: 푸시 알림 딥링크 메인 위치 검증 (메인 위젯 순서 변경 후 anchor 정상 작동 확인)
  - #8: 미니홈피 anchor 4-set 포팅 (recordSectionY + onLayout 컴포넌트 기반)
- **결정 사항**: 메인 위젯 + 미니홈피 anchor 모두 안전. 코드 수정 X.

## 2-12. [공통] 출석 streak 로직 + 연속 출석 배지 발급
- **한 줄 요약**: attend_7 / attend_30 / attend_100 배지 streak 누적 / 연속 계산 로직 추가.
- **배경**: badges.ts 에 배지 정의만 있고 streak 누적 / 연속 계산 / 발급 로직 부재 (메모리 #5).
- **결정 사항**:
  - Firestore members 에 streak 필드 추가 (streak / lastAttendDate / maxStreak)
  - 출석 함수: 어제 출석 시 streak +1 / 그제 이전 시 reset 1 / 오늘 이미 출석 X
  - 배지 발급: streak >= 7 / 30 / 100 도달 시 부여 (재발급 X)
  - 소급 적용 (백필) 옵션 — Claude Code 결정
- **commit / OTA**: 별도 진행 (badgeCheck.ts 분리 commit)

## 2-13. [공통] 프사 정사각 crop UI 도입
- **한 줄 요약**: 프사 업로드 시 1:1 정사각 crop UI 추가. 미니홈피 / 길드원 목록에서 잘림 방지.
- **배경**: 비정사각 원본 업로드 시 cover + 정사각 컨테이너 패턴으로 잘림 발생 (메모리 #6).
- **결정 사항**:
  - 홈피: react-easy-crop 또는 react-image-crop
  - 앱: expo-image-picker allowsEditing + aspect [1, 1]
  - 기존 프사 그대로 (마이그레이션 X), 새 업로드부터 적용
- **관련 파일**: 5개 파일 + commit 분리 (badgeCheck attendance backfill 와 별도 commit)

## 2-14. [공통] 앨범 사진 수정 UI 출연자 선택 통일
- **한 줄 요약**: 앨범 사진 작성 UI 의 클릭 선택 (MemberPickerModal) 패턴을 수정 UI 에도 동일 적용.
- **관련 파일**:
  - 홈피: `app/components/shared/MemberPickerModal.tsx` (추출, 재사용), `app/album/page.tsx`, `app/components/shared/AlbumPhotoViewer.tsx`
  - 앱: `src/components/shared/MemberPicker.tsx` (추출, 재사용), `app/(tabs)/album.tsx`, `src/components/shared/AlbumPhotoViewer.tsx`
- **배경**: 작성 UI 는 클릭 선택 (정상), 수정 UI 는 옛 닉네임 수기 입력 (잘못).
- **결정 사항**:
  - 같은 컴포넌트 재사용 (MemberPickerModal 추출)
  - iOS Modal 중첩 금지 (메모리) — 앱은 picker 가 Modal 이 아닌 View, 부모 Modal 안에 absoluteFill 백드롭 + 카드로 띄움
  - data 구조 그대로 (string[] 닉네임 배열)
- **commit**: 858cf0c
- **OTA**: 안드 019e0742 / iOS 019e0744

## 2-15. [공통] 푸시 알림 / 최신현황 deep-link 전체 점검 + 수정 ⭐
- **한 줄 요약**: cosmic 폐기 후 푸시 / 최신현황 딥링크 5종 점검 → useLocalSearchParams race + autoOpenCommentId destructure 누락 + targetCommentId prop 부재 발견 + 수정.
- **관련 파일**:
  - `dawnlight-app/src/components/dawnlight2/widgets/PaperPlaneLetters/index.tsx` (useLocalSearchParams → useGlobalSearchParams)
  - `dawnlight-app/src/components/dawnlight2/MainPage.tsx` (useGlobalSearchParams + letter 위치 스크롤 + letterYRef)
  - `dawnlight-app/src/components/minihompi/PhotosSectionD2.tsx` (autoOpenCommentId destructure + PhotoViewerModal forward)
  - `dawnlight-app/src/components/shared/MinihomePhotoViewer.tsx` (targetCommentId prop + scrollRef + multi-retry 스크롤)
  - `dawnlight-app/app/(tabs)/members/[id].tsx` (useGlobalSearchParams + cosmic 분기 + TEMP 주석 정리)
- **오류 / 함정** ⭐⭐:
  - **사용자 보고**: "푸시 익명 편지 → 메인 열리고 깜빡하고 끝. 이전 채팅에서 다 처리됐다더니 안 됨"
  - **헛다리 1차** (이전 진단): "anchor 안전, 코드 수정 X" 보고. 사용자 직감 무시하고 코드 보고만 신뢰.
  - **사용자 직감**: "편지뿐 아니라 한마디 / 모험기록 / 사진첩 / 방명록 모두 깨졌을 수 있음"
  - **재진단**: 5종 시나리오 verbatim 점검:
    - 버그 1: useLocalSearchParams race (cold-start tap 시 query-only delta reactive X)
    - 버그 2: MainPage 의 letter 위치 스크롤 누락
    - 버그 3: PhotosSectionD2 의 autoOpenCommentId destructure 누락 (type 에는 있으나 함수 내 사용 X)
    - 버그 4: 앱 PhotoViewerModal 의 targetCommentId prop 자체 부재 (홈피만 있었음)
    - 버그 5: members[id] useLocalSearchParams race + cosmic 분기 + TEMP 주석 잔존
  - **진짜 원인**: cosmic 폐기 후 일부 wiring 누락 + race 패턴 (FloatingChat 이 useGlobalSearchParams 쓰는 동일 이유)
  - **해결**: 모두 useGlobalSearchParams 통일 + 누락 prop / 함수 / 스크롤 로직 보강
- **학습**:
  - "anchor 정상 작동" 진단 보고 ≠ 실제 동작 정상. 사용자 검증 = ground truth.
  - cosmic 폐기 시 wiring 누락 가능성 항상 의심.
  - useLocalSearchParams cold-start race 패턴은 useGlobalSearchParams 로 봉인.
- **commit**: 3ee1da0
- **OTA**: 안드 019e0717 / iOS 019e0718

## 2-16. [결정] 모험기록 푸시 트리거 재진단 ⭐
- **한 줄 요약**: 이전 라운드 "모험기록 푸시 트리거 없음" 보고 잘못 → 실제로 latest.ts onActivityCreated 가 generic 트리거 역할 (verbatim 검증 완료).
- **오류 / 함정** ⭐⭐:
  - **사용자 보고**: "모험기록 푸시 받고 있는데 왜 트리거 없다고?"
  - **헛다리** (이전 진단): myspace.ts 만 보고 "dedicated trigger 없음 → 트리거 없음" 잘못 결론.
  - **진짜 원인**: dedicated trigger 는 없지만 latest.ts 의 generic onActivityCreated 가 처리 (TYPES_WITH_DIRECT_TRIGGER 에 adventure 없음 → fall-through → "latest" 카테고리 push 발송).
  - **재진단 결과**: 트리거 chain (logActivity → onActivityCreated → activityNormalize rewriteAdventureLink → sendPush → PushTapHandler → navigateLink → members/[id] section scroll) verbatim 처음부터 끝까지 정상.
  - **결론**: 코드 fix 불필요. 마지막 OTA (3ee1da0) 가 useLocalSearchParams race 도 봉인. 사용자가 OTA 받은 후 새 푸시로 검증 필요.
- **학습** ⭐:
  - "트리거 없음" 결론 절대 X. 사용자 푸시 수신 = ground truth = 트리거 존재 확정.
  - dedicated trigger 가 없어도 generic activity trigger (latest.ts) 가 처리 가능.
  - 사용자 직감 무시하고 코드 보고만 신뢰 = 잘못된 결론.

---

## PENDING (다음 라운드 진행 예정)

### P-1. cosmic dead 분기 ~500곳 점진 정리
- **상태**: B 절충안에서 보류. 다음 페이지 작업할 때 그때그때 정리.

### P-2. 모험기록 푸시 OTA 적용 후 검증
- **상태**: 마지막 OTA (3ee1da0) 가 race 봉인. 사용자 강제종료 2회 + 새 푸시 테스트 필요.

---

## 핵심 학습 ⭐ (이번 라운드)

### L-1. 진단 우선, 추측 금지 ⭐⭐⭐
- 사용자 "여전히 안 됨" 보고 → 즉시 가설로 점프 X. 진단 먼저.
- **사례**: cosmic 깜빡임 — hook 이미 항상 true 인데 추측으로 폐기 명령 던짐. 진단 후 캐시 / 도달 지연이 진짜 원인 추정.
- **체크 순서**:
  1. 사용자 캡쳐 = ground truth
  2. verbatim grep 으로 코드 상태 검증
  3. Vercel CDN cache / OTA 도달 시점 의심
  4. 그 다음 코드 변경 제안

### L-2. RN 안드 호환성 (반복 발견) ⭐⭐
1. **AnimatedG transform string interpolation 안드 silent crash** — IslandHeroD2 사례
2. **typecheck 통과 ≠ runtime 동작** — RN 전용 호환 속성만 사용
3. **shadowColor + elevation** 안드 글로우 필수 패턴
4. **react-native-svg `<G>` transform** = 정적 string 만 안전
5. **Animated.View + transform translateY/scale** = 안전 패턴

### L-3. 사용자 의도 파싱 정확도 ⭐⭐
- 모호 표현 ("한 줄 가로", "들여쓰기", "두 번째 줄") = 시각 예시 (캡쳐 / 시각화 위젯) 로 확인
- 추측 해석 X. 헷갈리면 다시 묻기.
- 4번 폐기 후 5번째 확정 = 시간 낭비. 한 번에 정확히.
- **사례**: 댓글 layout 5번 시도 후 "게시판 댓글 스타일" 로 확정.

### L-4. flex layout 우측 메타 침범 방지
- flex 1 + min-width 0 + flex-shrink 0 만으로 부족
- **word-break: break-all** 한글 wrapping 필수
- 명시적 width / padding-right 같이 박아야 안전

### L-5. binary search 패턴 (안드 강제종료 진단)
- 컴포넌트 5~10개 동시 마운트 시 어느 게 크래시 원인인지 모를 때
- 한 단계마다 OTA → 사용자 진입 시도 → 결과 한 단어 보고
- 가장 큰 변경 = 의심 1순위 가정 X. 작은 애니 패턴이 native crash 원인일 수 있음.
- **사례**: PhotosSectionD2 (1056 insertions) 의심 1순위였으나 실제는 IslandHeroD2 (1단계).

### L-6. ErrorBoundary 한계
- RN native crash 는 JS ErrorBoundary 로 catch 못 함
- binary search 또는 실제 컴포넌트 isolate 가 정답

### L-7. Claude Code 진단 보고 거짓말 패턴
- "정상 적용됨" 보고 → 사용자 캡쳐 시 미적용
- 해결: verbatim grep 결과 첨부 강제. 사용자 캡쳐 = ground truth.

### L-8. 인프라 함정
- **Vercel CDN edge cache + OTA 도달 지연** = 깜빡임 / 미적용 의심 1순위
- **OTA 적용 콜드 스타트 2회** 필요
- 푸시 작업은 앱만 적용 (웹 무의미)

### L-9. dead code 폐기 ROI 작음
- 깜빡임 같은 사용자 영향 없으면 보류 가능
- 인라인 분기 ~500곳 정리 vs 작업 위험 + 시간 = ROI 작음
- 점진 정리 (다음 페이지 작업 때 그때그때) 가 효율

### L-10. 협업 패턴
- **자동 배포 정책 명시** = 매 명령마다
- **verbatim grep 강제** = Claude Code 보고 검증
- **양 레포 동시 작업** = "홈피 + 앱 동시" 명시
- **단계별 typecheck pass** = 큰 작업도 안전하게

### L-11. 사용자 직감 신뢰 ⭐⭐
- "이상한데?" → 진짜 이상
- "적용 안 됐어" → 진짜 적용 X
- "여전히 깜빡거려" → 다른 원인 (캐시 / OTA 도달) 의심
- **이전 사례**: STAR 알고리즘 / 푸시 중복 / framer-motion / dl2 댓글 layout / 미니홈피 안드 강제종료 모두 사용자 직감으로 발견

### L-12. ⭐ 작업 일지 정리 시 가이드 준수
- "내가 했어 말 안 했어도 프롬프트 받았으면 완료"
- 진행 중 / 결과 대기 / 폐기 분류 정확히 (사용자 확인 받기)
- 시간순 정렬

---

## End of Part 2
