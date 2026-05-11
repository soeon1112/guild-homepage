# dawnlight-12 — 2026-05-09 작업 일지 (Part 3)

> Part 3: 핵심 학습 + PENDING

---

## 📚 핵심 학습 (이번 세션 전체)

### ⭐⭐⭐ 1. fix 1번 실패 = 즉시 디버그 박스 (다음 가설 시도 금지)

이번 세션의 가장 큰 실패. 키보드 마라톤 12 phase 거의 모두가 이 원칙 위반.

**잘못된 패턴**:
```
Phase 1 fix → 실패 → "다음 가설은?" → Phase 2 fix → 실패 → ...
```

**올바른 패턴**:
```
Phase 1 fix → 실패 → 즉시 디버그 박스 박기 → 실측값 확인 → root cause 확정 → 진짜 fix
```

**왜 못 지켰나**:
- 진단 에이전트 권장안 ("표준 솔루션") 검증 없이 받음
- 사용자한테 디버그 박스 캡쳐 부담 주는 거 무의식적 회피
- "이번 가설은 다를 거야" 자기 합리화

**이번 사례의 비용**:
- Phase 2: native 패키지 추가 + 재빌드 + 사용자 새 APK 설치 (1~2시간 + 사용자 수동 작업)
- Phase 3~11: OTA 발사 8번 + 콜드 스타트 검증 8번
- 총 6시간+ 후 미해결

**core-learnings.md 0-2 참조**: 이미 추가된 항목. 다음 채팅에서 강제할 것.

---

### ⭐⭐ 2. 진단 에이전트 권장안도 검증 없으면 추측

"표준 솔루션", "공식 권장", "확실히 90%" 같은 단어 = 즉시 의심 신호.

이번 사례:
- Phase 2의 react-native-keyboard-controller = "표준 솔루션" 권장
- 실제로는 RN Modal 안에서 작동 안 함 (controller의 KeyboardProvider가 modal native window까지 도달 X)
- 검증 없이 받아서 native 변경 + 재빌드 헛수고

**core-learnings.md 0-3 / 7-11 참조**.

---

### ⭐⭐ 3. JS-only 옵션 우선 검토 (native 변경은 마지막)

이번 사례:
- Phase 2: native 패키지 추가 (재빌드 필수)
- 결국 답: RN core Keyboard.addListener (Phase 4 — JS only, OTA 가능)
- 처음부터 JS-only 시도했으면 재빌드 0, 사용자 APK 재설치 0

**core-learnings.md 0-4 참조**.

---

### ⭐⭐ 4. 데이터와 사용자 경험 충돌 = 측정 layer 의심

이번 사례:
- Phase 6 캡쳐: canScroll=yes, scrollY=276 (데이터: 스크롤 됨)
- 사용자 시각: "스크롤 안 됨"
- 충돌 발생 시점에 측정 layer 자체 의심해야 했음
- 그러지 않고 fix 효과만 측정 → 5 phase 더 헛수고

**학습**: 사용자 경험 = ground truth. 데이터가 다르면 측정 코드부터 의심.

---

### ⭐⭐ 5. 통합 작업 전 import 그래프 검증

웹 멘션 dead code 사태 (1-6 함정 1):
- 진단 에이전트가 가리킨 GuildChat.tsx에 통합 → 운영 반영 0
- 진짜 운영 컴포넌트는 redesign/FloatingChat.tsx
- import 그래프 grep으로 호출 사이트 검증 안 함

**검증 방법**:
```bash
grep -r "import.*ComponentName" --include="*.tsx" --include="*.ts"
```
호출 사이트 0이면 dead code 의심. 빌드 산출물에 string literal grep으로 운영 반영 검증.

**core-learnings.md 7-10 참조**.

---

### ⭐ 6. 자산 생성 스크립트는 결과물도 git commit

아이콘 자산 사라짐 사태 (1-10):
- generate-icons.mjs는 살아있는데 PNG 결과물 git에 commit된 적 0번
- 무심코 reset / Expo CLI 재초기화 / 수동 회귀 등으로 placeholder 회귀
- 다음 빌드까지 placeholder 박힘

**학습**: 디자인 스크립트 작성 시 첫 실행 결과물도 즉시 git commit.

---

### ⭐ 7. "iOS 정상" 단정 금지 — 옛 빌드 캡쳐로 ground truth 확인

이번 사례:
- Phase 1~11 동안 "iOS는 정상"이라고 가정
- 우리가 본 iOS는 매번 OTA 받은 iOS = 우리 fix가 적용된 상태
- 옛 빌드(우주 톤) iOS 캡쳐로 ground truth 확인 시 iOS도 가림 발견
- 가정 자체가 틀렸음

**학습**: "X 환경은 정상"이라고 단정하기 전에 fix 적용 안 된 환경의 ground truth 확인.

---

### ⭐ 8. 사용자 직감 신뢰

이번 사례:
- "이럴 거면 처음부터 디버그를 했어야지" — 정확한 지적
- "안드만 안 된다" 명시했는데 흘려서 일반화된 fix 했음
- "스크롤이 안된다고 입력란까지 도달을 못함" — 정확한 시각 보고
- "데이터가 정상이라는데 시각적으론 안 됨" — 측정 layer 의심해야 했던 신호

**core-learnings.md 0-5 참조**.

---

## 📝 PENDING 작업

### 키보드 마라톤 — 미해결 (가장 중요)

**현재 상태**: Phase 1 이전 코드로 롤백 (commit 94ac5b1) + 디버그 박스 mount (commit 7617bda)

**남은 작업**:
1. Album/Minihome 모달 키보드 가림 문제 (안드 + iOS 양 플랫폼 원초 문제)
2. 안드 가로 모드 모달 스크롤 안 됨 문제 (안드 newArch 원초 문제 추정)

**시도 가능한 방향** (Part 2 미해결 섹션 참조):
- A. 측정 layer 신뢰 점검부터 (inputB 진짜 입력란 측정값인지 확인)
- B. 깨끗한 상태에서 진단 (Phase 12 롤백 + 디버그 박스 상태 활용)
- C. Letter 모달 verbatim 분석 → 작동 패턴 추출
- D. 안드 가로 스크롤 단독 진단
- E. 모달 안 댓글 입력을 별도 화면으로 분리 (큰 refactor)

---

### 멘션 시스템 Phase 5 남은 그룹

1. **Phase 5-2: 앨범 본문(캡션) + 앨범 댓글**
2. **Phase 5-3: 미니홈피 (방명록 인라인 + 사진 본문/댓글)**
3. **Phase 5-4: 제안 본문** (schema 분리 옵션 A 동반: title + description)

**제외**: 공지 댓글 / 제안 댓글 인프라 (별도 라운드)

---

### 빌드 1회 (보류 중)

키보드 작업 끝난 후 진행 예정. 묶을 것:
- 아이콘 자산 (commit 66afdda) — 별자리 디자인
- 키보드 fix (해결 후)
- 디버그 박스 제거 commit
- 우주 컨셉 회귀 해소 (새 빌드 배포로 자동 해소)

**효과**:
- 옛 빌드 사용자 새 빌드 받으면 우주 회귀 + 아이콘 + 키보드 + AuthModal + 채팅 + Letter + 게시판 댓글 다 한 번에 적용

---

### 게시판 댓글 deep-link 검증

**상태**: 작업 끝남 (commit f4b4b9f), 검증 자연 발생 시 수행

**시나리오**:
1. 게시판 1번째 댓글 멘션 푸시 → 푸시 탭 → 정밀 위치 스크롤
2. 마지막 댓글 멘션 푸시 → 동일
3. 최신현황 row 클릭 → 동일
4. 웹 최신현황 row 클릭 → 동일
5. 앨범/미니홈피사진/방명록 멘션 한 번씩 — 자동 작동 그대로 유지 확인

---

### 미래 알람 (변경 없음, 기존 PENDING)

- Firestore 보안 규칙 만료 (2027-05-01)
- TestFlight 빌드 90일 제한
- 기타 future-notes 항목들

---

## 🎯 다음 채팅 시작 시 권장 흐름

### 1. 두 파일 정식 업데이트 (이번 세션 미적용)

이번 세션 중 핵심 학습을 core-learnings.md / system-context.md에 추가했어요. 이미 갱신된 파일이 `/mnt/user-data/outputs/` 에 있음. 사용자가 적용했는지 확인 필요.

### 2. 키보드 작업 우선순위

**선택지 1: 키보드 단독으로 끝까지**
- Part 2의 시도 방향 (A~E) 중 선택
- 추천: **A (측정 layer 점검) + C (Letter 분석)** 병행
- 6시간+ 헤맨 작업이라 새 머리로 접근

**선택지 2: 키보드 일단 보류 + 빌드부터**
- 다른 fix들 (멘션 / AuthModal / 아이콘) 다 살아있음
- 빌드 1회 → 모달 키보드만 살림 → 사용자에게 안내
- 키보드는 별도 세션에서 진행

### 3. 멘션 Phase 5-2~5-4

키보드 작업 끝난 후 차례로.

---

## 📋 commit hash 정리 (이번 세션)

| Commit | 설명 |
|--------|------|
| 741f1a1 | Phase 1 — KAV padding 통일 (롤백됨) |
| f6a4343 | Phase 2 — controller 도입 native 변경 (롤백됨) |
| 99a7e34 | Phase 3 — controller hook 마이그레이션 (롤백됨) |
| b9e1670 | Phase 4 — RN core Keyboard.addListener (롤백됨) |
| 297fd2b | Phase 5 — translateY lift (Letter만 작동, 롤백됨) |
| 7fbc7d7 | Phase 6 — 디버그 telemetry (롤백됨) |
| 8fa52f3 | Phase 7 — paddingBottom + scrollResponder (롤백됨) |
| 5ae346a | Phase 9 — backdrop 외부 + ref.scrollTo (롤백됨) |
| 94f86f0 | Phase 10 — TextInput 직접 ref (롤백됨) |
| 28f9e3d | Phase 11 — KeyboardAwareScrollView (롤백됨) |
| **94ac5b1** | **Phase 12 — Phase 1 이전 코드로 롤백 (현재 상태)** |
| **7617bda** | **Phase 12 — 디버그 박스 mount (언쏘 한정)** |
| 66afdda | 아이콘 자산 복구 (별자리 PNG commit, 빌드 보류) |
| 8bb5571 | dl2 로그인 버튼 누락 fix |
| f4b4b9f | 게시판 댓글 deep-link 정밀 스크롤 (웹) |
| 9976494 | AuthModal dl2 디자인 + 중앙 정렬 (앱) |
| 2509fec | AuthModal 중앙 정렬 (웹) |
| c533f9d | React 19 JSX 네임스페이스 fix |

**키보드 마라톤 OTA 발사 update group ID** (필요 시 참조):
- Phase 7 안드: 019e0c01-139d-77eb-8b8d-8f6feb9e409f
- Phase 7 iOS: 019e0c01-dc73-7993-a9ba-7ba72967276e
- Phase 9 안드: 019e0c4b-1d41-776d-9ac8-6b5e8bbd54b1
- Phase 9 iOS: 019e0c4b-d552-70e1-b60e-d0cc93ef8614
- Phase 10 안드: 019e0c56-d7a9-7654-9605-b82d56968b5a
- Phase 10 iOS: 019e0c57-9ba9-7ae7-82c4-8403433412e9
- Phase 11 안드: 019e0c5f-4f6b-7ed0-8d60-3748d67b7bc9
- Phase 11 iOS: 019e0c5f-fe9f-7c0d-94d1-61de7cd2d1c4
- Phase 12 롤백 안드: 019e0c70-88a7-7621-873b-fd3514fb6d4a
- Phase 12 롤백 iOS: 019e0c71-41c1-7c76-9a3f-0479cc4c7e3b
- Phase 12 디버그 박스 안드: 019e0c7b-0dab-7521-bc50-97811894e83d
- Phase 12 디버그 박스 iOS: 019e0c7b-bb1d-7a42-b6ea-98ea874d8e0c

---

## 끝

> 이 세션은 키보드 마라톤으로 6시간+ 소요했지만 미해결로 끝났습니다.
> 다음 세션에서는 위 학습 사항 적용 + Part 2 미해결 섹션 참고하여 진행 권장.
> 모든 fix는 롤백된 깨끗한 baseline 상태(commit 94ac5b1) + 디버그 박스 mount(7617bda)에서 시작 가능.
