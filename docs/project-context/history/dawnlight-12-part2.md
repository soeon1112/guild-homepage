# dawnlight-12 — 2026-05-09 작업 일지 (Part 2)

> Part 2: ⭐⭐⭐ 키보드 마라톤 (Phase 1~12) — **미해결 상태로 인계**
> 이 작업이 5시간 이상 소요. 12 phase 시도 모두 실패. 새 채팅 인계 필수.

---

## 2-1. [앱] 안드 모달 키보드 가림 + 가로 모드 스크롤 문제 (미해결)

**한 줄 요약**: 안드 앨범/미니홈피 모달 입력란이 키보드에 가려지는 문제. 12 phase 시도 모두 실패. 도중 가로 모드 스크롤 안 됨 문제도 발견.

**관련 파일** (현재 상태 — 모든 fix 롤백됨):
- `src/components/shared/AlbumPhotoViewer.tsx` — Phase 1 이전 코드로 롤백
- `src/components/shared/MinihomePhotoViewer.tsx` — Phase 1 이전 코드로 롤백
- `src/lib/modalKeyboard.ts` — 보존 (Letter 모달이 사용 중)
- `src/components/_debug/KeyboardDebugBox.tsx` — 보존
- `src/components/dawnlight2/widgets/PaperPlaneLetters/index.tsx` — Letter 모달 (translateY lift 정상 작동)

**배경**:
- 시작점: 안드 모달 입력란이 키보드에 가려진다는 사용자 보고
- iOS는 정상이라고 가정하고 시작 (나중에 ground truth 확인 시 iOS도 가려짐 발견)

---

### 진단/시도 시간순 (Phase 1 → Phase 12)

#### Phase 1 — KAV padding 통일 (commit 741f1a1)
- **시도**: KeyboardAvoidingView padding 패턴으로 통일
- **결과**: 안드 가려짐 그대로 → 실패
- **학습 (실패 직후)**: 디버그 박스 박았어야 함. 그러나 진단 에이전트의 다음 권장안으로 직행.

#### Phase 2 — react-native-keyboard-controller 도입 (commit f6a4343)
- **시도**: native 패키지 추가 + KeyboardProvider + KAV 8곳 교체 + FloatingPet self-fix
- **재빌드 필수** (native 변경)
- **사용자 새 APK 설치 부담**
- **결과**: 여전히 가려짐 → 실패
- **부산물**: 채팅 (FloatingChat) 공백 발생, 게시판 댓글 정상, 모달 댓글 가려짐

#### Phase 3 — controller hook 마이그레이션 + nested KeyboardProvider (commit 99a7e34)
- **시도**: Modal 안에 KeyboardProvider nested mount + 모든 페이지 hook 패턴 마이그레이션
- **결과**: 채팅 정상 / 게시판 정상 / 모달 가려짐 그대로 → 부분 성공
- **나중에 발견**: nested KeyboardProvider는 무의미했음 (RN Modal은 별도 native window라 root provider 도달 X)

#### Phase 4 — RN core Keyboard.addListener (commit b9e1670)
- **시도**: controller 폐기, RN core API + Animated padding 직접 구현 (`useModalKeyboardPad` 훅)
- **결과**: 모달 padding 적용은 됐는데 시각적으로 가려짐 그대로 → 실패
- **이유 (나중에 진단)**: padding이 ScrollView 콘텐츠 위치는 못 옮김

#### Phase 5 — translateY lift 패턴 (commit 297fd2b)
- **시도**: 모달 wrapper 통째 translateY로 끌어올림 (`useModalKeyboardLift` 훅, overlap 기반)
- **결과**: Letter 모달은 ✅ 정상. Album/Minihome은 ❌ 그대로 가려짐
- **이유**: Letter는 카드 자체가 모달 root → translateY 효과 OK / Album/Minihome은 입력란이 ScrollView 콘텐츠 내부 → translateY가 wrapper만 이동, 콘텐츠 좌표 안 변함

#### Phase 6 — 디버그 telemetry 추가 (commit 7fbc7d7)
- **시도**: scrollY/scrollH/vpH/canScroll 박스 추가
- **사용자 캡쳐 데이터** (안드 태블릿 가로):
  - canScroll=yes, scrollY=276, scrollH=1100, vpH=824
  - 사용자 시각: "스크롤 안 내려감"
  - **데이터와 사용자 경험 충돌** ← 결정적 단서였으나 당시 인식 못 함

#### Phase 7 — paddingBottom + scrollResponder (commit 8fa52f3)
- **시도**: ScrollView contentContainer paddingBottom + `scrollResponderScrollNativeHandleToKeyboard`
- **결과**: 또 실패
- **이유**: scrollResponder가 안드 newArch에서 무력 (나중에 디버그로 확정)

#### Phase 9 — backdrop ScrollView 외부 + ref.scrollTo (commit 5ae346a)
- **시도**: Pressable absoluteFill을 ScrollView 밖으로 빼서 pan gesture 가로채기 회피 + scrollResponder 폐기, ref.scrollTo 직접
- **결과**: 가로 스크롤 일부 작동(scrEvtN 1→3), 키보드 가림 여전
- **이유 (디버그)**: hndlOK=NO ← `findNodeHandle(focused)` 실패 = `currentlyFocusedInput()` 안드 newArch + Modal에서 null 반환

#### Phase 10 — TextInput 직접 ref (commit 94f86f0)
- **시도**: `currentlyFocusedInput` 폐기, cbarInputRef로 TextInput에 직접 ref 박기
- **결과**: refOK=yes 됐는데 over=0인데도 시각적 가려짐
- **이유**: 측정 좌표와 실제 시각 좌표 어긋남 (정확한 root cause 못 잡음)

#### Phase 11 — KeyboardAwareScrollView 라이브러리 (commit 28f9e3d)
- **시도**: `react-native-keyboard-controller`의 `KeyboardAwareScrollView` 컴포넌트로 ScrollView 통째 교체
- **결과**: Phase 9 스크롤 fix까지 깨뜨림 → 더 망가짐

#### Phase 12 (롤백) — Phase 1 이전 코드로 복원 (commit 94ac5b1)
- **시도**: 모든 fix 폐기, Phase 1 이전 코드로 완전 복원
- **이유**: 우리 fix가 스크롤 깨뜨렸을 가능성 점검 + 깨끗한 baseline에서 ground truth 확인
- **결과 (사용자 검증)**:
  - 안드 가로: 스크롤 여전히 안 됨 → **우리 fix 무관한 원초 문제**
  - 안드 세로: 키보드 가림 그대로
  - **iOS 옛 빌드 (우주 톤)**: 모달 스크롤 OK, 그러나 키보드 가림! → **iOS도 원초 가림 문제 있었음** (이전엔 우리 fix가 적용된 OTA 받은 iOS만 봐서 정상 가정한 것)

---

### 마지막 디버그 박스 데이터 (Phase 12 롤백 후 디버그 박스 다시 박음 — commit 7617bda)

**안드 태블릿 세로 모드, 입력란 탭 후**:

| 모달 | inputB | kbTop | over | 사용자 시각 |
|------|--------|-------|------|------------|
| AlbumPhoto | 950 | 944 | +6 | 가려짐 (입력란 통째로 키보드 뒤) |
| MinihomePhoto | 933 | 944 | -11 | 가려짐 |
| LetterCompose | 760 | 944 | -184 | 정상 |

**캡쳐 사진 (사용자 검증)**: Album/Minihome 모달에서 입력란이 키보드에 통째로 가려져서 안 보임. 댓글 영역은 보이는데 입력란만 키보드 뒤로 숨음.

**Claude의 마지막 헛다리**: "데이터로는 미니홈피 거의 정상(-11)인데 사용자가 가려졌다고 하는 건 거의 닿아있어서 답답한 거 아닐까" — 사용자 캡쳐 보고 즉시 잘못된 해석임을 인정. 입력란 통째로 안 보이는 게 사실.

**가설**: `inputB` 값이 진짜 입력란 bottom이 아니라 다른 컴포넌트(댓글 리스트 끝 등)를 측정 중일 가능성. focused TextInput을 못 잡고 다른 거 측정 → 잘못된 over값 → 데이터 오류.

---

### 핵심 학습 (이번 마라톤 전체)

#### 가장 큰 실수 ⭐⭐⭐

**Phase 1 실패 직후 디버그 박스 안 박음 → Phase 2 (재빌드, native 변경, 사용자 APK 재설치) 강행**
- core-learnings 0번 원칙 정면 위반
- 진단 에이전트의 "controller가 표준 솔루션" 권장안을 검증 없이 받음
- 결과: Phase 2의 native 변경 + 재빌드 = **불필요한 작업이었음**. 이번 사태 끝나고 보면 RN core Keyboard.addListener (Phase 4의 패턴)로 OTA만으로 해결 가능했어야 함

#### 잘못된 가정 모음

1. **"iOS는 정상" 가정** — Phase 1~11까지 우리는 매번 OTA 받은 iOS만 봤음. iOS 옛 빌드(우주 톤) 캡쳐로 봐야 ground truth 확인 가능. **결과: iOS도 원초 가림 문제 있었음**.

2. **"스크롤은 원래 됐을 것" 가정** — 사용자가 처음 키보드 가림만 보고했지만 그 시점에도 가로 스크롤은 안 됐을 가능성. 우리 fix가 깨뜨린 줄 알고 롤백했지만 롤백 후에도 안 됨 → **원초 안드 newArch 문제**.

3. **데이터와 사용자 경험 충돌 무시** — Phase 6 캡쳐에서 canScroll=yes/scrollY=276 데이터와 사용자 "스크롤 안 됨" 보고가 충돌. 측정 layer 자체를 의심해야 했는데 그러지 않음.

4. **Phase 5 lift.sv=70인데 over=+54 데이터 무시** — translateY lift가 ScrollView 콘텐츠에 효과 0이라는 신호였는데 다른 가설로 진행.

#### 추측 N번 패턴

- Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 → 10 → 11 → 12 (롤백) → 12 (디버그) = 12번 가설/시도
- 매번 "이번엔 데이터 기반" 주장
- 핵심 패턴: 측정 layer 자체 의심 X, fix 효과만 측정

---

### 미해결 상태 정리

#### 알려진 사실 (ground truth)

1. **안드 + iOS 양 플랫폼 모두 모달 입력란 키보드 가림** (옛 빌드 iOS 캡쳐로 확인)
2. **안드 가로 모드 모달 스크롤 끝까지 안 됨** (롤백 후에도 동일 → 원초 문제)
3. **iOS는 모달 스크롤 정상** (옛 빌드 우주 톤 캡쳐 — 안드만의 문제로 추정)
4. **Letter 모달은 양 플랫폼 정상** (translateY lift 패턴이 작동하는 케이스)
5. 다른 모달 (CharacterForm, UploadModal, AuthModal): 사용자 미보고 — 추정만

#### 미해결 의심점

1. **inputB 측정값이 부정확할 가능성** — Phase 12 디버그 박스에서 over 값이 시각과 안 맞음. focused TextInput을 못 잡고 다른 거 측정 중일 수 있음.
2. **Album/Minihome 모달의 layout 트리** — ScrollView 안 입력란이 실제 좌표 어디인지 verbatim 미확인
3. **Modal native window 자체 크기** — 화면 다 못 차지할 가능성 (Phase 12 디버그에서 modalRootW/H 박았다 롤백됨)
4. **안드 newArch의 RN Modal과 Keyboard 동작** — 알려진 이슈 검색 안 함

#### 다음 채팅 인계 — 시도해볼 방향

**A. 측정 layer 신뢰 점검부터**:
- inputB 측정값이 진짜 댓글 입력란 bottom인지 확인
- TextInput에 직접 ref 박고 측정 (Phase 10 패턴)
- ref로 잡은 input의 measureInWindow 결과 vs 시각적 위치 비교

**B. 기존 fix 코드 0인 깨끗한 상태에서 진단**:
- 현재 commit 94ac5b1 (Phase 1 이전 롤백) 상태
- Phase 12 디버그 박스 commit 7617bda
- 추가 진단 코드 박지 말고 사용자한테 시각적 + 코드 측정값 받기

**C. Letter 모달 verbatim 분석**:
- Letter는 양 플랫폼 정상
- translateY lift 패턴이 Letter에서만 작동하는 이유 verbatim 분석
- Album/Minihome에 적용 가능한 패턴 추출

**D. 안드 가로 스크롤 단독 진단**:
- 키보드와 무관한 layout 문제
- ScrollView 콘텐츠 자식 트리 + 각 height verbatim
- Modal native window 크기 측정
- 안드 가로 specific layout 함정

**E. 큰 refactor 옵션**:
- 모달 안 댓글 입력을 별도 화면(stack screen)으로 분리
- 모달은 사진 보기만, 댓글 작성은 별도 페이지
- 디자인 변경 동반하지만 키보드 문제 자체 사라짐

#### ⚠️ 다음 채팅에서 절대 하지 말 것

1. **진단 없이 또 라이브러리 추가** (`KeyboardAwareScrollView` 등)
2. **"표준 솔루션" 권장안 검증 없이 받기** (Phase 2의 controller 도입 사례)
3. **Phase 1 실패 직후 다음 가설로 직행** — 무조건 디버그 박스 박기 (core-learnings 0-2)
4. **"iOS는 정상" 단정** — 옛 빌드 iOS도 가림 확인됨
5. **데이터와 사용자 경험 충돌 무시** — 충돌 시 측정 layer부터 의심

---

### 작업 시간 현황

- 시작: 2026-05-09 14:00경 추정 (사용자 첫 보고)
- 현재 (인계 시점): 2026-05-09 20:30경
- **약 6시간+ 소요 후 미해결**

---

### 디버그 박스 + 롤백 보존 commit hash

- 롤백 (Phase 1 이전 상태): **94ac5b1**
- 진단 디버그 박스 mount: **7617bda**

새 채팅에서 위 commit hash 기준으로 작업 시작 권장.

---

(Part 3로 이어짐 — 핵심 학습 + PENDING)
