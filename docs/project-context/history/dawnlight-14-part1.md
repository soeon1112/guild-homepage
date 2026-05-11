# dawnlight-14 — 2026-05-10 작업 일지 (Part 1)

> Part 1: dead-code 대규모 정리 (6 commit, -7548줄 git tracked)
> Part 2: 멘션 시스템 완성 (Phase 5-2/5-3 + 채팅 함정 fix + 최신현황 강조)

---

## 시간순 작업 목록

---

### 1-1. [앱] KeyboardDebugBox + dead 함수 제거 (Step 6 1차)

**한 줄 요약**: KeyboardDebugBox 본체 + AlbumPhotoViewer/MinihomePhotoViewer dead 함수 통째 제거

**관련 파일**:
- `src/components/_debug/KeyboardDebugBox.tsx` (삭제, -315줄)
- `src/components/_debug/` 폴더 자체 삭제
- `src/components/shared/AlbumPhotoViewer.tsx` (-1197/+1)
  - PeopleField / AlbumPhotoViewer / CommentsSection / CommentItem 4개 함수 제거
- `src/components/shared/MinihomePhotoViewer.tsx` (-870/+5)
  - PhotoViewerModal / PhotoComments / PhotoCommentItem 3개 함수 제거
- `src/lib/modalKeyboard.ts` (-183/+0)
  - useModalScrollKeyboardPad 함수 통째 제거
  - useModalKeyboardLift의 liftSv 반환 제거
- `src/components/dawnlight2/widgets/CabinLogs/index.tsx` (-8/+3)
- `app/(tabs)/members/photo.tsx` (-3/+3)

**배경**: 
- dawnlight-13에서 모달 → 페이지화 작업 완료
- Step 6 dead-code 정리가 OTA로 던져졌지만 deep-link 회귀 마라톤 때문에 검증 못 함
- 이번 세션에서 진단 결과 ❌ 미정리 발견 → 다시 정리

**결정 사항**:
- 보호 영역: 살아있는 export (resolveFileType / ModalBtn / type 등) 모두 보존
- CharacterForm.tsx 의 useModalKeyboardLift 사용 (liftStyle만) → 영향 0 확인

**검증**:
- typecheck EXIT=0
- grep 4건 모두 0건 (KeyboardDebugBox / PhotoViewerModal / useModalScrollKeyboardPad / liftSv)
- 6 files changed, +18 / -2564

**commit**: a6d1d6a "chore(dead-code): KeyboardDebugBox + PhotoViewerModal + AlbumPhotoViewer 함수 제거"
**OTA**: iOS e37fc5ee / 안드 48cbd052

---

### 1-2. [앱] unused import + styles 통째 제거 (Step 6 2차)

**한 줄 요약**: AlbumPhotoViewer + MinihomePhotoViewer의 dead 함수 제거 후 남은 unused import + dead styles 객체 정리

**관련 파일**:
- `src/components/shared/AlbumPhotoViewer.tsx` (-157, 884→727줄)
  - firestore/storage/RN/expo/local import 27건 제거
  - dl2Styles StyleSheet 객체 통째 제거 (87줄)
  - DL2_PAPER_BG_65 / DL2_PAPER_BG_96 const 제거
- `src/components/shared/MinihomePhotoViewer.tsx` (-519, 552→35줄)
  - import 24건 제거
  - styles + d2CommentStyles 두 StyleSheet 통째 제거 (~467줄)
  - 사실상 type + resolveFileType만 남은 가벼운 모듈

**오류 / 함정**:
- 진단 결과에서 위험 케이스 4개 (A~D) 사전 검증 명시
- 작업 명령에 사전 검증 단계 박아서 안전 강화:
  - A: deleteObject/ref(firebase/storage) → 본문 0건 확인
  - B: Text(AppText) 사용처 → 0건 확인 (제거 가능)
  - C: dl2Styles 사용처 → 0건 확인 (통째 제거)
  - D: styles/d2CommentStyles 사용처 → 둘 다 0건 확인 (통째 제거)
- 사전 검증 4개 모두 통과 → 작업 진행

**보호 영역**:
- 살아있는 export 모두 보존:
  - AlbumPhotoViewer: resolveFileType, todayISO, formatPhotoDate, photoSortKey, ModalBtn + types
  - MinihomePhotoViewer: resolveFileType + types
- 외부 12곳 import 정상 동작 확인

**검증**:
- typecheck EXIT=0
- noUnusedLocals 두 파일 0건
- 2 files changed, +9 / -667

**commit**: 6c20ba0 "chore(dead-code): unused import + dl2Styles/styles 통째 제거"
**OTA**: iOS 28b7d510 / 안드 02f7700b

---

### 1-3. [앱] AuthModal + CharacterForm + modalKeyboard 통째 제거

**한 줄 요약**: dawnlight-13 페이지화 작업 후 dead된 모달 컴포넌트들 통째 제거

**관련 파일**:
- `src/components/AuthModal.tsx` (삭제, -498줄)
- `src/components/combat/CharacterForm.tsx` (삭제, -1059줄)
- `src/lib/modalKeyboard.ts` (삭제, -142줄)
- stale 주석 4곳 정리:
  - `dawnlight2/Topbar.tsx:112, 244` (AuthModal → /login)
  - `TopHeader.tsx:37` (AuthModal → /login page)
  - `layout.ts:53` (AuthModal 언급 제거)
- `src/lib/layout.ts` 신규 git tracking (이전부터 살아있던 hook 파일)

**배경**:
- dawnlight-13에서 AuthModal → app/(tabs)/login.tsx 페이지화
- CharacterForm → app/(tabs)/character-form.tsx 페이지화
- 진단 결과 외부 참조 0건 확인 (CharacterFormScreen은 다른 함수)
- modalKeyboard.ts는 CharacterForm만 사용 중이라 연쇄 dead

**오류 / 함정** ⭐:
- **진단에서 useModalKeyboardLift 가 살아있다고 잘못 판단**:
  - 1차 dead-code 정리 때 useModalScrollKeyboardPad만 제거하고 useModalKeyboardLift 보존
  - 실제 호출자가 CharacterForm.tsx (지금 dead 컴포넌트) 만이었음
  - **연쇄 dead 발견** - CharacterForm 제거 시 modalKeyboard.ts 통째 제거 가능
- **사용자 시각 회귀 검증 후 통째 제거 가능 확인**

**보호 영역**:
- 페이지 진입 경로 4건 verbatim 확인 + 보존:
  - `Topbar.tsx:252` router.push("/login?mode=login")
  - `TopHeader.tsx:277` router.push("/login?mode=login")
  - `combat.tsx:183, 187` router.push("/character-form?mode=...")

**검증**:
- typecheck EXIT=0
- grep 0건 (AuthModal / CharacterForm / modalKeyboard / useModalKeyboardLift)
- 6 files changed, +106 / -1702

**commit**: 95b9f9d "chore(dead-code): AuthModal + CharacterForm + modalKeyboard 페이지화 후 dead 제거"
**OTA**: iOS 77439306 / 안드 71393ea2

---

### 1-4. [앱] cosmic dead-chain 3파일 통째 제거 (C-1 축소판)

**한 줄 요약**: featureFlags useDawnlight2()=true 하드코딩으로 cosmic 분기 100% dead → 미니홈피 cosmic 섹션 4파일 중 안전한 3파일만 제거

**관련 파일**:
- `src/components/minihompi/PhotosSection.tsx` (삭제, -606 git tracked)
- `src/components/minihompi/GuestbookSection.tsx` (삭제, FS만, 820줄)
- `src/components/minihompi/AdventureLogSection.tsx` (삭제, FS만, 493줄)

**배경**:
- featureFlags.ts `useDawnlight2() → return true` 하드코딩
- 진단 결과 cosmic 분기 mount 0건 확인
- 미니홈피는 D2 컴포넌트(PhotosSectionD2 등)만 살아있음

**오류 / 함정** ⭐:
- **진단 오판 발견 + 작업 즉시 중단** (안전 장치 작동):
  - 진단에서 7파일 모두 단순 삭제 가능이라고 판정
  - 실제 사전 재검증 결과:
    - **Wardrobe.tsx**: dl2 ProfileSectionD2가 cosmic Wardrobe 그대로 mount 중 → **live!**
    - **TopHeader.tsx**: dl2 Topbar.tsx에서 HEADER_HEIGHT, HEADER_INNER_MAX_WIDTH 상수 import 중
    - **ProfileSection.tsx**: type MemberDoc을 외부 2곳에서 import
  - 7개 중 3개 단순 삭제 불가 → 작업 중단
- **옵션 A 선택**: 안전한 4개만 처리
  - PhotosSection / GuestbookSection / AdventureLogSection / BgmPlayer 시도
  - BgmPlayer 삭제 시 ProfileSection.tsx에서 dead reference (line 57 import) 발생 → typecheck 실패 → BgmPlayer 복원
- 결과적으로 3파일만 commit (ProfileSection은 별도 라운드)

**오류 / 함정 2** — git stage 안전 장치:
- `git add -A` 명령에 민감 파일 (Firebase 키 등 untracked 다수) 같이 staged 됨 발견
- Claude Code가 자동 중단 + 보고 → specific add로 진행
- 민감 파일 6개 모두 untracked 그대로 안전 보존

**보호 영역**:
- featureFlags.ts 절대 X
- D2 컴포넌트 모두 절대 X
- members/[id].tsx dl2 분기 절대 X

**검증**:
- typecheck EXIT=0
- 살아있는 dl2 D2 컴포넌트 import 정상
- 1 file changed (git tracked만), +606 줄 사라짐 git / 1919줄 사라짐 FS

**commit**: 5bd27a3 "chore(dead-code): cosmic dead-chain 3파일 통째 제거 (PhotosSection / GuestbookSection / AdventureLogSection)"
**OTA**: 안드 eee391e3 / iOS 7880890c

---

### 1-5. [앱] ProfileSection + BgmPlayer 통째 처리

**한 줄 요약**: type MemberDoc을 신규 파일로 이전 후 ProfileSection.tsx + BgmPlayer.tsx 통째 제거

**관련 파일**:
- `src/types/minihompi.ts` (신규, +10줄) — MemberDoc type 정의
- `src/components/minihompi/ProfileSection.tsx` (삭제, -1219줄)
- `src/components/minihompi/BgmPlayer.tsx` (삭제, -349줄)
- `app/(tabs)/members/[id].tsx:29` import 경로 변경
- `src/components/minihompi/ProfileSectionD2.tsx:41` import 경로 변경

**배경**:
- 1-4에서 BgmPlayer는 ProfileSection 안 dead reference 때문에 보류
- 진단 결과 ProfileSection의 type MemberDoc만 외부 2곳에서 사용 (type-only import)
- BgmPlayer는 ProfileSection 외 사용처 0
- 옵션 A (신규 type 파일 src/types/minihompi.ts에 이전) 선택

**결정 사항**:
- type 이전 위치: src/types/minihompi.ts (도메인별 분리, 응집도 ⭐)
- 작업 순서:
  1. 신규 type 파일 생성
  2. import 경로 변경 (2곳)
  3. **중간 typecheck 통과 후에만** 파일 삭제
  4. 최종 typecheck

**검증**:
- 중간 typecheck 0 errors (import 변경 후)
- 최종 typecheck 0 errors (삭제 후)
- 5 files changed, +12 / -1570 (net -1558)
- 민감 파일 0건 staged

**commit**: b8d9e36 "chore(dead-code): cosmic ProfileSection + BgmPlayer 통째 제거 (type MemberDoc → src/types/minihompi.ts 이전)"
**OTA**: 안드 54209597 / iOS ab077627

---

### 1-6. [앱] TopHeader.tsx 통째 처리

**한 줄 요약**: HEADER_HEIGHT, HEADER_INNER_MAX_WIDTH 상수를 src/lib/layout.ts로 이전 후 TopHeader.tsx 통째 제거

**관련 파일**:
- `src/lib/layout.ts` (+8줄) — 상수 2개 + 주석 추가
- `src/components/dawnlight2/Topbar.tsx:31-34` import 경로 변경 (TopHeader → layout)
- `src/components/TopHeader.tsx` (삭제, -462줄)

**배경**:
- 진단 결과 TopHeader.tsx 7개 export 중 2개 (상수만) 외부 의존, 나머지 5개 dead
- 의도된 일관성 확인: MODAL_HEADER_HEIGHT (56) = HEADER_HEIGHT (56) 같은 56px
- 옵션 A (src/lib/layout.ts에 추가) 선택 — layout 상수 응집도 ⭐

**검증**:
- 중간 typecheck 0 errors
- 최종 typecheck 0 errors
- 3 files changed, +9 / -463 (net -454)

**commit**: 5ea4688 "chore(dead-code): cosmic TopHeader.tsx 통째 제거 (HEADER_HEIGHT, HEADER_INNER_MAX_WIDTH → src/lib/layout.ts 이전)"
**OTA**: 안드 afe2ca9d / iOS 28371f99

---

## 누적 dead-code 정리 성과

| commit | 내용 | net |
|--------|------|-----|
| a6d1d6a | KeyboardDebugBox + dead 함수 | -2564 |
| 6c20ba0 | unused import + styles 통째 | -667 |
| 95b9f9d | AuthModal + CharacterForm + modalKeyboard | -1699 |
| 5bd27a3 | cosmic dead-chain 3파일 | -606 (git tracked) |
| b8d9e36 | ProfileSection + BgmPlayer | -1558 |
| 5ea4688 | TopHeader | -454 |
| **총 git** | | **-7548줄** |
| **+ FS 추가** | | **-8861줄 사라짐** |

---

(Part 2로 이어짐 — 멘션 시스템)
