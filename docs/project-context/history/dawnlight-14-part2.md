# dawnlight-14 — 2026-05-10 작업 일지 (Part 2)

> Part 2: 멘션 시스템 Phase 5-2 / 5-3 완성 + 채팅 함정 fix + 최신현황 강조 + 알림 토글 진단

---

## 시간순 작업 목록 (계속)

---

### 2-1. [공통] Phase 5-1 검증 (재확인)

**한 줄 요약**: dawnlight-12에서 던지고 검증 못 한 Phase 5-1 (게시판 멘션)이 실제로 들어갔는지 진단

**진단 결과**: ✅ 완료 + 검증 가능
- 앱 cf1f7ab (본 작업) + b2ea658 (deep-link 정밀 스크롤 보강)
- 웹 41ed2e2 + f4b4b9f
- 게시판 본문/댓글 멘션 입력+표시 완료 (양 레포)
- 영문 우선 정렬 헬퍼 isHangulStart 적용
- PostBody 활용으로 앱 공지 본문 표시 자동 커버 (보너스)
- React 19 JSX fix (c533f9d) 적용됨

**결정 사항**: Phase 5-2 작업 즉시 시작 가능

---

### 2-2. [공통] Phase 5-2a — 앨범 멘션 표시 통합

**한 줄 요약**: 앨범 캡션/댓글/답글 텍스트에 멘션 강조 표시 적용

**관련 파일**:
- 앱 `app/(tabs)/album/photo.tsx` (3곳): 캡션 (line 308) + 댓글 (line 824) + 답글 (line 887)
- 웹 `app/components/shared/AlbumPhotoViewer.tsx` (5곳): 캡션 + 댓글본문 + 댓글미리보기 + 답글본문 + 답글미리보기

**배경**:
- dawnlight-13에서 AlbumPhotoViewer 모달 → 앱은 페이지화, 웹은 모달 유지
- 1-2/1-3 dead-code 정리 후 살아있는 영역에 멘션 표시 통합

**결정 사항** (Q1/Q2):
- Q1: 앱은 dl2={true} 하드코딩 (featureFlags 풀공개 정책과 일관)
- Q2: 웹 5곳 모두 통합 (인라인 미리보기 포함)

**오류 / 함정**:
- 진단에서 className "minihome-photo-caption" / "minihome-gb-msg" 공유 발견
  - 미니홈피 사진뷰어와 className 공유
  - 사전 검증 결과 CSS 스타일 공유일 뿐 컴포넌트 호출 별개 → 영향 0 확인
- AlbumPhotoViewer는 dead-code 정리 후라 살아있는 export 절대 보호 명시

**검증**:
- typecheck 양 레포 0 errors
- 웹 빌드 26 라우트 정상
- 보호 영역 0 변경

**commit**: 앱 85e909a / 웹 cbedf46 "feat(mention/p5-2a): 앨범 캡션/댓글 멘션 표시 통합"
**OTA**: 안드 e0129b05 / iOS 8bc2e1df / Vercel cbedf46

---

### 2-3. [공통] Phase 5-2b — 앨범 멘션 입력 통합

**한 줄 요약**: 앨범 신규 업로드/캡션 수정/댓글/답글 입력 영역에 @닉네임 자동완성 통합

**관련 파일**:
- 앱 (4자리, 3 파일):
  - `app/(tabs)/album/photo-upload.tsx` (캡션 신규)
  - `app/(tabs)/album/photo-edit.tsx` (캡션 수정)
  - `app/(tabs)/album/photo.tsx` (댓글 + 답글 per-item)
- 웹 (4자리, 2 파일):
  - `app/album/page.tsx` (캡션 신규)
  - `app/components/shared/AlbumPhotoViewer.tsx` (캡션 편집 + 댓글 + 답글 per-item)

**배경**:
- Phase 5-1 게시판 패턴 1:1 복제
- 답글은 per-item state (CommentItem wrapper 안 useState)

**오류 / 함정** ⭐:
- **답글 위치 진단 함정**:
  - 진단에서 photo.tsx line 932-944 답글 입력이 main 본체 분기인지 CommentItem 안인지 모호
  - 작업 명령에 "CommentItem 안이면 작업 중단" 명시
  - 사전 재검증 결과: CommentItem 함수 안 (line 660 시작) → per-item state 필요
  - 사용자 결정 (a) per-item state로 진행
- **웹 빌드 1차 TS 에러 자동 fix**:
  - editCaptionMentionCursor scope 불일치 (AlbumViewerMetaInner 별개 함수로 발견)
  - 진단에서 AlbumViewerMetaInner를 본체로 잘못 판단
  - 실제로는 캡션 편집 input이 AlbumViewerMetaInner 안 → state도 거기로 이동
  - 자동 fix 한 번 만에 빌드 통과

**보호 영역**:
- 5-2a 표시 통합 영향 0 (MentionText 카운트 그대로)
- 백엔드 트리거 / 멘션 라이브러리 / dl2 D2 0
- 페이지 라우팅 / Firebase doc fetch / 댓글 작성·삭제 로직 0

**검증**:
- typecheck 0 errors (양 레포)
- MentionPicker 카운트 앱 4 + 웹 4 = 8건
- 5-2a MentionText 카운트 그대로 (앱 3 + 웹 5)

**commit**: 앱 5807872 / 웹 921f694 "feat(mention/p5-2b): 앨범 캡션/댓글/답글 멘션 입력 통합"
**OTA**: 안드 06f37008 / iOS 7f20eb3a / Vercel 921f694

---

### 2-4. [앱] 채팅 row 두 번째 클릭 함정 fix ⭐⭐

**한 줄 요약**: 같은 채팅 row 두 번째 클릭 시 채팅창 안 열리는 함정 해결 (router.setParams로 chat param 정리)

**관련 파일**:
- `src/components/FloatingChat.tsx` (+8/-2)
  - import line 42: `router` 추가
  - useEffect 안 setTimeout 콜백: `router.setParams({ chat: undefined })` 1줄 추가

**배경**:
- 사용자 보고: 채팅 푸시는 정상, 최신현황 row 클릭은 1차만 작동, 2차/3차부터 안 됨
- 멘션 알림이 다 비슷한 증상일 수 있다는 우려로 전체 진단

**오류 / 함정** ⭐⭐⭐:
- **추측 → 진단 → 진짜 원인 발견 패턴**:
  - 1차 진단: 멘션 트리거의 link 형식 의심 → verbatim 확인 결과 일반 채팅과 100% 동일 (/?chat={messageId})
  - 2차 진단: 푸시와 navigateLink 같은데 동작 다름 → expo-router same-segment race 의심
  - 3차 진단: 같은 row 여러 번 클릭 케이스 분석 → useEffect 의존성 [chatParam, nickname], chatParam 같은 값 반복 → 변화 없음 → 발화 X
  - **진짜 원인**: chat.ts:44-48 주석에 이미 단서:
    > "messageId in URL (not a constant flag) so a second chat push can re-fire"
    > 푸시는 messageId 매번 다름 (다른 메시지) → 변화 감지 OK
    > row 클릭은 같은 messageId 반복 → 변화 X → 발화 X

- **함정 영향 범위 추가 진단** (소언님 우려):
  - 모든 글로벌 오버레이 / deep-link 함정 영향 확인
  - 진단 결과:
    - 🔴 채팅: 함정 확실
    - 🔴 별똥별 편지: 같은 패턴이지만 최신현황에 안 뜸 (익명 푸시만) → 영향 X
    - 🔴 웹 미니홈피 hashHandledRef: 같은 페이지 stay 시 함정 가능
    - 🟡 게시판/앨범 댓글 정밀 스크롤: 사용자 검증 결과 페이지 이동이라 자동 복귀 → 영향 X
    - 🟢 다른 row 클릭: 페이지 이동 시 mount/remount로 자연 해결

- **fix 옵션 4가지 비교**:
  - 옵션 1: navigateLink chat link만 nonce → 영향 격리
  - 옵션 2: 모든 link nonce → 영향 광범위
  - 옵션 3: 글로벌 bus signal → 복잡
  - 옵션 4: router.replace("/") → URL 정리, 단순
  - **(a) router.setParams({ chat: undefined })** ← 채택
    - chat param만 제거, 다른 query (whispers/letter) 보존
    - history stack 안 만짐 (router.replace보다 안전)
    - cold-start race 위험 X

- **사전 검증에서 router.replace 위험점 발견**:
  - 메인 페이지 useGlobalSearchParams 구독자:
    - MainPage.tsx (whispers, letter)
    - PaperPlaneLetters (letter)
  - router.replace("/") 시 letter / whispers param 다 제거 → 다른 deep-link 영향 가능
  - → 옵션 (a) router.setParams로 변경 (chat만 제거)

**핵심 학습**:
1. **푸시와 row 클릭의 본질적 차이**:
   - 푸시: 매번 다른 messageId → 자연스럽게 useEffect deps 변화
   - row 클릭: 같은 messageId 반복 → deps 변화 없으면 함정
2. **router.replace vs router.setParams**:
   - replace는 모든 query 제거 (다른 구독자 영향)
   - setParams({ key: undefined })는 특정 key만 제거 (격리)
3. **글로벌 오버레이 + same-page navigation 함정 패턴**:
   - 페이지 이동 deep-link은 mount/remount로 자연 해결
   - 글로벌 오버레이 (modal/overlay)는 페이지 그대로 → 같은 URL 두 번째 인식 안 됨

**검증** (사용자 직접):
- 1차 클릭 → 채팅창 열림 ✓
- 2차/3차/4차 클릭 → 모두 정상 ✓
- 푸시 탭 → 정상 ✓
- 다른 row (letter/whispers) → 정상 ✓

**commit**: 04aecb3 "fix(chat): 같은 채팅 row 두 번째 클릭 시 채팅창 자동 오픈 (router.setParams로 chat param 정리)"
**OTA**: 안드 4c515bec / iOS 01430c01

---

### 2-5. [공통] Phase 5-3a — 미니홈피 멘션 표시 통합

**한 줄 요약**: 미니홈피 방명록/사진/댓글 텍스트에 멘션 강조 표시 적용

**관련 파일**:
- 앱 (5자리, 2 파일):
  - `src/components/minihompi/GuestbookSectionD2.tsx` (entry + 답글 wrapper)
  - `app/(tabs)/members/photo.tsx` (캡션 + 댓글 + 답글)
- 웹 (7자리, 2 파일):
  - `app/components/redesign/minihompi/GuestbookSectionD2.tsx` (entry + 답글 wrapper)
  - `app/components/shared/MinihomePhotoViewer.tsx` (캡션 + 댓글본문 + 댓글미리보기 + 답글본문 + 답글미리보기)

**배경**: 5-2a 앨범 패턴 1:1 복제 (방명록/사진 영역)

**오류 / 함정**:
- **5-2a와 차이 자동 처리**:
  - 5-2a 앨범 인라인 미리보기: `<span className="minihome-gb-msg">: {content}</span>` 단일 span
  - 5-3a 미니홈피 인라인 미리보기: `<span className="text-text-sub"> : </span>{content}` — ": " 별도 span + content raw
  - 5-3a는 content 부분만 `<MentionText as="span">` wrap, ": " span 그대로 보존

**보호 영역**:
- members/[id].tsx (앱 본체) 0 변경 — sticky redirect / photoParam 흐름 보존
- members/[id]/page.tsx hashHandledRef 영역 0 변경
- 방명록 페이지네이션 점프 / 사진 댓글 정밀 스크롤 0 변경
- MinihomePhotoViewer 살아있는 export 0 변경

**검증**:
- typecheck 0 errors
- 5-2a/5-2b 영향 0 (MentionText 카운트 그대로)

**commit**: 앱 ee2a4e9 / 웹 ca43217 "feat(mention/p5-3a): 미니홈피 방명록/사진/댓글 멘션 표시 통합"
**OTA**: 안드 4bfc3b41 / iOS e2916081 / Vercel ca43217

---

### 2-6. [공통] Phase 5-3b — 미니홈피 멘션 입력 통합

**한 줄 요약**: 미니홈피 방명록/사진 캡션/댓글/답글 입력 영역에 @닉네임 자동완성 통합

**관련 파일**:
- 앱 (6자리, 4 파일):
  - `src/components/minihompi/GuestbookSectionD2.tsx` (entry + 답글 wrapper per-item)
  - `app/(tabs)/members/photo.tsx` (댓글 + 답글 wrapper per-item)
  - `app/(tabs)/members/photo-edit.tsx` (캡션 수정 multiline)
  - `app/(tabs)/members/photo-upload.tsx` (캡션 신규)
- 웹 (6자리, 3 파일):
  - `app/components/redesign/minihompi/GuestbookSectionD2.tsx` (entry + 답글 wrapper)
  - `app/components/redesign/minihompi/PhotosSectionD2.tsx` (캡션 신규, UploadModalD2 안)
  - `app/components/shared/MinihomePhotoViewer.tsx` (캡션 편집 + 댓글 + 답글 wrapper)

**배경**: 5-2b 앨범 패턴 1:1 복제 (방명록/사진 영역)

**결정 사항**:
- **사진 업로드 캡션 활성 자리 결정**:
  - PhotosSectionD2.tsx의 UploadModalD2 (line 506) — dl2 활성 ✅ 통합 대상
  - members/[id]/page.tsx의 PhotoSection (line 1372) — cosmic 분기 (dl2 풀공개 후 비로그인 fallback) → 0 변경
  - hashHandledRef 영역 (line 256-275)과 cosmic PhotoSection 거리 ~1100줄 → 분리 안전

**보호 영역**:
- members/[id].tsx (앱 본체) 0 변경
- members/[id]/page.tsx hashHandledRef 영역 절대 X
- 방명록 페이지네이션 (autoJumpEntryId) / 사진 댓글 정밀 스크롤 (multi-retry / cancelled flag) 0
- 답글 표시 layout 0 변경

**검증**:
- typecheck 0 errors
- MentionPicker 카운트 앱 6 + 웹 6 = 12건
- 5-3a MentionText 카운트 그대로

**commit**: 앱 a6c7cec / 웹 1606935 "feat(mention/p5-3b): 미니홈피 방명록/사진 캡션/댓글/답글 멘션 입력 통합"
**OTA**: 안드 1a7040fc / iOS d60c8f9a / Vercel 1606935

---

### 2-7. [공통] 최신현황 row 멘션 강조 — 누구2/우리길원들 추가

**한 줄 요약**: "X님이 Y님을 언급했습니다" 에서 Y(멘션 대상)도 navy 강조, "우리길원들"은 coral 강조

**관련 파일**:
- 앱 `src/components/dawnlight2/widgets/WhispersFeed/index.tsx` (+44/-2)
- 웹 `app/components/dawnlight2/widgets/WhispersFeed/index.tsx` (+38/-2)

**배경**:
- 사용자 발견: 최신현황 row "누구1님이 누구2님을 언급했습니다"에서 누구1만 굵게, 누구2는 plain
- 멘션 대상이 강조 안 되면 부자연

**오류 / 함정**:
- **NICKNAME_RE의 lazy quantifier 한계**:
  - 현재 정규식: `/^(.*?)([^\s'"]+?)님(.*)$/` lazy match
  - 첫 번째 "님" 매칭만 추출 → 누구1만 강조, 누구2는 nickSuffix에 plain
- **fix 옵션 3가지 비교**:
  - 옵션 1: 백엔드 message 형식 변경 (`@${target}님을`) — 옛 activity 호환성 문제
  - 옵션 2: 프런트 정규식 추가 — 백엔드 0, 옛 activity 자동 호환 ⭐
  - 옵션 3: type === "mention" 분기 — 옵션 2와 거의 동일
- **MENTION_RE false positive 검증**:
  - activityNormalize.ts 모든 message 형식 grep: 다른 카테고리는 "...했어요" 끝맺음
  - "언급" 단어 사용처 0 → false positive 0

**결정 사항** (Q1/Q2/Q3):
- Q1: 옵션 2 (프런트 정규식)
- Q2: 누구1 = ink (기존 bodyNick), 누구2 = mention navy #2a4570, 우리길원들 = mention coral #b85420
- Q3: 누구2에도 Dl2TitlePrefix 적용 (둘 다 칭호 표시), 우리길원들은 가상 엔트리라 칭호 없음

**구현**:
- MENTION_RE: `/^(.+?)님이 (.+?)(님을|을) 언급했습니다$/`
- 매칭 시: 누구1 + 누구2/우리길원들 둘 다 강조 렌더
- 매칭 X: NICKNAME_RE fallback (기존 그대로)

**색상 토큰 검증**:
- MentionText.tsx line 28-29 verbatim 확인:
  - dl2 개별 멘션 navy: `#2a4570`
  - dl2 우리길원들 coral: `#b85420`
- WhispersFeed에 동일 색상 적용 (디자인 통일)

**보호 영역**:
- 백엔드 0 (mention.ts message 형식 그대로, 옛 activity 자동 호환)
- NICKNAME_RE 0 변경 (mention 외 row 강조 보존)
- navigateLink / row 클릭 / link 처리 0
- 5-1~5-3 멘션 통합 / 채팅 함정 fix 영향 0

**검증**:
- typecheck 양 레포 0 errors
- MENTION_RE false positive 0

**commit**: 앱 29bc0dd / 웹 5b7c4cf "feat(mention): 최신현황 멘션 row에서 누구2/우리길원들 강조 추가"
**OTA**: 안드 696e892e / iOS 8a6168d9 / Vercel 5b7c4cf

---

### 2-8. [결정] 알림 토글 시스템 진단 — 변경 0

**한 줄 요약**: MY 페이지 알림 토글 시스템이 이미 완전히 구현되어 운영 중인 것 확인, 변경 0 결정

**진단 결과**:
- **이미 완성된 인프라**:
  - Firestore schema: `users/{nickname}.notificationSettings` ✅
  - Backend toggle 체크: `recipients.isCategoryEnabled` (모든 trigger 자동) ✅
  - MY 페이지 UI: `NotificationSettingsCard` (dl2 톤 적용) ✅
  - AsyncStorage + Firestore 양쪽 동기화 ✅
  - 기본값 모두 ON, 마이그레이션 불필요 ✅
- **현재 노출 카테고리 (11개)**: notice / chat / latest / whisper / myspace / album / board / schedule / pet / letter / proposal

**메모리 계획 vs 현재 구현 차이**:
- 매칭 6개: 공지/채팅/최신/내공간/앨범/게시글
- 충돌 1개: **멘션** — 메모리 계획에 있지만 코드 주석에 "강제 발송 정책으로 토글 의도적 제외" 명시
- 추가 5개: whisper/schedule/pet/letter/proposal — 메모리에 없는 카테고리

**결정 사항** (Q1/Q2):
- Q1: 멘션 토글 추가? → **(a) 그대로 (강제 발송 정책 유지)** — 직접 부르는 거라 OFF 해도 푸시 가는 게 자연
- Q2: 추가 5개 카테고리 정리? → **(a) 그대로 (11개 다 노출)** — 사용자에게 더 많은 컨트롤

**결론**: 변경 0, 시스템 그대로 유지

**메모리 업데이트**: 옛 계획 → 완료 상태로 전환

---

## 멘션 시스템 최종 완성 ⭐

| 영역 | 입력 | 표시 | 푸시+딥링크 |
|------|-----|-----|------------|
| 채팅 | ✅ | ✅ | ✅ + row 함정 fix |
| 게시판 | ✅ | ✅ | ✅ |
| 앨범 (캡션 + 댓글 + 답글) | ✅ | ✅ | ✅ |
| 미니홈피 방명록 (entry + 답글) | ✅ | ✅ | ✅ |
| 미니홈피 사진 (캡션 + 댓글 + 답글) | ✅ | ✅ | ✅ |
| 최신현황 row 강조 (누구1 + 누구2/우리길원들) | - | ✅ | - |

**보너스**:
- 공지 본문 (앱) — 표시 자동 적용 (PostBody 활용)
- @우리길원들 전체 멘션 — 모든 영역에서 작동, coral 강조

**보류**:
- Phase 5-4 제안 본문 — 사용자 결정으로 보류

---

## 핵심 학습 ⭐⭐⭐

### 1. ⭐⭐⭐ 진단 오판도 사전 재검증으로 잡힘

이번 세션의 가장 큰 패턴. 진단 결과 신뢰하되 작업 직전 한 번 더 verbatim 재검증으로 사고 방지.

**사례**:
- **C-1 축소판 Wardrobe live 발견**: 진단에서 "dead" 판정 → 사전 재검증에서 ProfileSectionD2가 cosmic Wardrobe 그대로 mount 중 발견 → 즉시 중단
- **BgmPlayer 연쇄 dead**: ProfileSection.tsx의 dead reference 자동 검출 → BgmPlayer 복원 + 별도 라운드
- **TopHeader 상수 의존성**: 진단 첫 회 누락, 추가 진단으로 발견

**원칙**: 모든 작업 명령에 **사전 재검증 단계** 박기. 진단 결과와 다르면 즉시 중단.

---

### 2. ⭐⭐ 같은 row 두 번째 클릭 함정 패턴

**원인**: useEffect 의존성에 같은 값 두 번째 들어오면 변화 감지 안 됨 → 발화 X

**구분**:
- **푸시**: 매번 다른 messageId → 자연 변화 → 정상
- **row 클릭**: 같은 messageId 반복 → 변화 X → 함정

**적용 범위**:
- 글로벌 오버레이 (FloatingChat, ShootingStarLetter 등) → 영향 (페이지 unmount 안 됨)
- 페이지 이동 deep-link → 자동 해결 (mount/remount)
- 글로벌 오버레이 deep-link 처리 시 항상 의식

**fix 패턴**: `router.setParams({ key: undefined })` — 특정 key만 제거, 다른 query 보존, history stack 안 만짐

---

### 3. ⭐⭐ git add -A 사고 방지

dead-code 정리 시 발견: untracked 민감 파일 (Firebase 키 등) 다수 존재 시 `git add -A` 위험.

**원칙**: 모든 작업 명령에 **specific add 강제** + Claude Code가 자동 중단 + 보고

**보호 대상**:
- GoogleService-Info.plist (Firebase iOS 키)
- google-services.json (Firebase Android 키)
- dawnlight-guild-3181d3388f9f.json (서비스 계정 private key)
- .env.example, .firebaserc, firebase.json

---

### 4. ⭐⭐ 추측 → 진단 → 진짜 원인 패턴 (반복)

이번 세션 대표 사례 (채팅 row 함정):
- 1차 추측: 멘션 트리거 link 형식 문제? → verbatim 확인 결과 일반 채팅과 동일
- 2차 추측: navigateLink 처리 차이? → 같은 함수 호출
- 3차 추측: expo-router race? → 부분적 단서
- **진짜 원인**: useEffect 의존성 같은 값 반복 함정 (chat.ts 주석에 단서)

**원칙**: 추측 없이 verbatim 코드 + 사용자 검증으로 좁히기.

---

### 5. ⭐ 페이지 이동 vs 글로벌 오버레이 함정 차이

같은 deep-link 시스템인데 동작 양상이 다른 케이스 다수.

**페이지 이동** (board/notice/album/members 등):
- 같은 row 두 번째 클릭 시 페이지 이동 → unmount/remount → 자동 발화
- 함정 영향 거의 X

**글로벌 오버레이** (FloatingChat, 모달):
- 같은 row 두 번째 클릭 시 페이지 그대로 → URL만 변경
- 같은 URL이면 변화 감지 X → 함정

---

### 6. ⭐ type-only import vs runtime import 분리

ProfileSection 통째 처리 시 사용한 패턴:
- type MemberDoc은 `src/types/minihompi.ts` 별도 파일로 이전
- 컴포넌트 파일과 type 정의 분리 → 응집도 ⭐

**적용 가능**: 다른 cosmic 파일 처리 시 살아있는 type만 분리 후 컴포넌트 삭제

---

### 7. ⭐ MENTION_RE false positive 검증 패턴

새 정규식 추가 시 다른 메시지 형식과 충돌 가능성 verbatim 검증:
- activityNormalize.ts에서 모든 카테고리 message 형식 grep
- 새 정규식 패턴이 다른 카테고리와 겹치는지 확인
- 0 매칭이면 안전, 1건이라도 있으면 정규식 정밀화

---

### 8. ⭐ 분할 작업 원칙 (5-2/5-3 패턴)

큰 작업은 표시 / 입력 분할:
- 표시 통합 (5-2a, 5-3a): 위험 낮음 (텍스트 컴포넌트 교체만)
- 입력 통합 (5-2b, 5-3b): 위험 중간 (cursor/state/Fragment 분리)
- 각 단계 검증 통과 후 다음 진행

회귀 발생 시 추적 쉬움 + 사용자 부담 분산.

---

## PENDING

### Dead-code 정리 다음 라운드
- **C-2**: board / album / notice / proposals cosmic 분기 제거 (4 페이지)
- **C-3**: shared 모듈 cosmic 분기 (DatePickerModal, AlbumPhotoViewer)
- **C-4**: live 6건 색상 swap (페이지 root 4 + FloatingChat 2)
- **Wardrobe.tsx**: swap 대상 (dl2가 mount 중이라 삭제 X)
- 모두 끝나면 colors.abyss/abyssDeep 팔레트 자체 폐기 가능

### 멘션 작업 보류
- **Phase 5-4 제안 본문** (사용자 결정으로 보류)
  - schema 변경 동반 (title → title + description)
  - 옛 문서 호환성 결정 필요
- **공지 댓글 / 제안 댓글 인프라 신규** (인프라 자체 없어서 멘션도 X)

### 기타 미래 작업
- **GuildChat.tsx dead 삭제** (정리 차원)
- **Functions Node 20 deprecation** (2026-10-30 마감)
- **TestFlight 90일 갱신** (2026-08-01경)
- **Firestore 보안 규칙 만료** (2027-05-01)

### 검증 대기 (자연 발생 시)
- 다양한 멘션 시나리오 (개별 / 우리길원들 / 푸시 / 최신현황)
- 채팅 row 함정 fix 장기 동작

---

## commit hash 정리 (이번 세션)

### Dead-code 정리 (Part 1)
| Commit | 설명 | net |
|--------|------|-----|
| a6d1d6a | KeyboardDebugBox + dead 함수 | -2564 |
| 6c20ba0 | unused import + styles 통째 | -667 |
| 95b9f9d | AuthModal + CharacterForm + modalKeyboard | -1699 |
| 5bd27a3 | cosmic dead-chain 3파일 | -606 (git) |
| b8d9e36 | ProfileSection + BgmPlayer | -1558 |
| 5ea4688 | TopHeader | -454 |

### 멘션 시스템 (Part 2)
| Commit (앱 / 웹) | 설명 |
|------|------|
| 85e909a / cbedf46 | 5-2a 앨범 표시 |
| 5807872 / 921f694 | 5-2b 앨범 입력 |
| 04aecb3 / — | 채팅 row 두 번째 클릭 함정 fix |
| ee2a4e9 / ca43217 | 5-3a 미니홈피 표시 |
| a6c7cec / 1606935 | 5-3b 미니홈피 입력 |
| 29bc0dd / 5b7c4cf | 최신현황 누구2/우리길원들 강조 |

---

## 끝

> 이 세션은 dead-code 약 -8861줄 정리 + 멘션 시스템 완성 (앨범 + 미니홈피 + 최신현황 강조) + 채팅 row 함정 fix.
> 안전 장치 (사전 재검증 / specific add / 진단 오판 검출) 여러 번 작동.
> 다음 세션에서 dead-code 정리 마무리 (C-2 ~ C-4) 또는 다른 영역 진행.
