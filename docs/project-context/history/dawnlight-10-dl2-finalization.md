# 새벽빛 작업 일지 v4 — Part 1
## 2026-05-08 (Dawnlight 2 마무리 라운드)

> 시간순 정렬. 미니홈피 dl2 5단계 binary search 완료 시점부터 메인 디자인 정리까지.

---

## 1-1. [앱] 미니홈피 dl2 binary search 3단계 (ProfileSectionD2)
- **한 줄 요약**: 미니홈피 안드 강제종료 진단을 위해 ProfileSectionD2 추가 마운트 후 정상 진입 확인.
- **관련 파일**: `dawnlight-app/app/(tabs)/members/[id].tsx`
- **배경**: 미니홈피 dl2 마운트 시 안드 다수 디바이스 흰 화면 + 강제종료. 5단계 isolation 진행 중.
- **결정 사항**: BadgesSection 은 자체 useDawnlight2 hook 호출로 1단계 시점에 이미 dl2 자동 활성. 2단계 skip 가능.

## 1-2. [앱] 미니홈피 dl2 binary search 4단계 (AdventureLogSectionD2)
- **한 줄 요약**: AdventureLogSectionD2 추가 마운트 후 정상 진입 확인.
- **관련 파일**: `dawnlight-app/app/(tabs)/members/[id].tsx`

## 1-3. [앱] 미니홈피 dl2 binary search 5단계 (PhotosSectionD2) — dl2 5단계 완전 복원
- **한 줄 요약**: 마지막 단계 PhotosSectionD2 추가 → 정상 진입. 미니홈피 dl2 모든 컴포넌트 복원 완료.
- **관련 파일**: `dawnlight-app/app/(tabs)/members/[id].tsx`
- **오류 / 함정** ⭐ (1-1 ~ 1-3 통합 학습):
  - **증상**: 안드만 미니홈피 진입 시 흰 화면 + 강제종료. iOS / 웹 정상.
  - **헛다리 1**: ErrorBoundary 시도 → catch 못 함. RN native crash 라 JS 레벨에서 못 잡음.
  - **헛다리 2**: 미니홈피 cosmic fallback 강제 → 임시 우회는 됐으나 근본 원인 X.
  - **헛다리 3**: PhotosSectionD2 가 가장 큰 변경 (1056 insertions) 이라 의심 1순위 가정 → 실제는 IslandHeroD2 (1단계 시점).
  - **진단 결과**: binary search 5단계 isolation. 1단계 IslandHeroD2 추가 시점부터 크래시 → 그 이후 수정으로 통과.
  - **진짜 원인**: IslandHeroD2 의 구름 좌우 흐름 + 깃발 흔들림 애니에서 `Animated.createAnimatedComponent(G)` + interpolated string transform (`"translate(0,0)" → "translate(-8,0)"`) 패턴이 안드 react-native-svg 에서 silent native crash. iOS 어쩌다 동작.
  - **해결**: 구름 좌우 흐름 + 깃발 흔들림 애니 제거 (정적 SVG). 떠있는 섬 위아래 bob 애니만 유지 (Animated.View + transform translateY 패턴 = RN 안전).
  - **commit**: a22394c (1단계 fix), 26219e8 (3단계), 21345ec (4단계)
- **학습**:
  - typecheck 통과 ≠ runtime 동작. RN 안드 native 호환성 별개 검증 필수.
  - SVG transform prop 에 Animated interpolated string 절대 X.
  - Animated.View + transform translateY/scale 만 안전.
  - 큰 변경 = 의심 1순위 가정 X. 작은 애니 패턴이 native crash 원인일 수 있음.
  - ErrorBoundary 는 RN native crash 못 잡음. binary search 가 정답.

## 1-4. [앱] 미니홈피 페이지 순서 복원
- **한 줄 요약**: dl2 미니홈피 페이지 순서 (프로필 → 배지 → 사진첩 → 모험기록 → 방명록) 복원.
- **관련 파일**: `dawnlight-app/app/(tabs)/members/[id].tsx`
- **배경**: binary search 진행하면서 dl2 분기 wiring 새로 짜는 과정에서 cosmic 순서 (프로필 → 배지 → 방명록 → 모험기록 → 사진첩) 로 돌아감. 사용자 발견.
- **오류 / 함정**:
  - 같은 컴포넌트 wiring 새로 짤 때 이전 라운드 결정 사항 (페이지 순서) 누락
- **학습**: wiring 새로 짤 때 이전 라운드 결정 사항 명시 + 검증 필수.

## 1-5. [공통] 미니홈피 + 메인 anchor / 푸시 딥링크 진단 (메모리 #4, #8 해제)
- **한 줄 요약**: 미니홈피 페이지 순서 변경 + 메인 위젯 순서 변경 후 anchor / 푸시 영향 검증 → 모두 안전 확인.
- **배경**: recordSectionY anchor 키 (minihome-photos / minihome-adventure / minihome-guestbook) 위치 기반 vs 컴포넌트 기반 검증 필요.
- **결정 사항**:
  - recordSectionY + onLayout 패턴 = 컴포넌트 기반 (위치 무관). 순서 바뀌어도 자동 매칭.
  - prop 전달 chain (PhotosSectionD2 / GuestbookSectionD2) cosmic ↔ dl2 1:1 대칭 검증.
  - 메인 위젯도 ref 기반 (각 페이지가 자기 ref 들고 있음) → 순서 무관.
  - 메모리 #4 (메인 위젯 순서 보류) + 메모리 #8 (미니홈피 anchor 4-set) 모두 해제.
- **학습**: onLayout 패턴은 마운트 위치 변경에 영향 X. 키만 정확히 같으면 자동 매칭.

## 1-6. [디자인] 미니홈피 5단계 마지막 — 유리병 쪽지 (방명록) 컨셉 + 디자인 결정
- **한 줄 요약**: 미니홈피 방명록 → "유리병 쪽지" 컨셉으로 변경. 박스 sky blue 통일 + 점선 dashed + "보내기" 버튼.
- **결정 사항**:
  - 이름: "유리병 쪽지" (편지는 거창함, 쪽지가 가벼움)
  - 등록 버튼: "보내기" (띄우기보다 명확)
  - 헤드 + 본 박스 통일 sky blue rgba(205,216,224,0.85)
  - v0 유리병 아이콘 verbatim 차용
  - 작성란: input + 보내기 버튼 (모험기록 패턴 — 박스 톤 옅게 + 테두리)
  - 항목 구분: 점선 dashed (박스 X)
  - 답글: 좌측 들여쓰기 + 좌측 세로선

## 1-7. [공통] 미니홈피 dl2 5단계 — 유리병 쪽지 섹션 적용
- **한 줄 요약**: 미니홈피 방명록 cosmic → dl2 GuestbookSectionD2 신규 컴포넌트로 교체 적용.
- **관련 파일**:
  - `dawnlight-app/src/components/minihompi/GuestbookSectionD2.tsx` (신규)
  - `guild-homepage/app/components/redesign/minihompi/GuestbookSectionD2.tsx` (신규)
  - `dawnlight-app/app/(tabs)/members/[id].tsx`, `guild-homepage/app/members/[id]/page.tsx`

## 1-8. [공통] 메인 "오늘의 항해자" 한마디 → 유리병 쪽지 통일
- **한 줄 요약**: 메인 위젯 "한마디" 영역 = 미니홈피 유리병 쪽지와 동일 컨셉으로 통일.
- **결정 사항**:
  - 편지 아이콘 → v0 유리병 아이콘 verbatim
  - "한마디" 라벨 → "유리병 쪽지"
  - "띄우기" 버튼 → "보내기"

## 1-9. [디자인] 댓글 layout 진화 과정 ⭐ (가장 헛다리 많음)
- **한 줄 요약**: 댓글 / 답글 layout 을 5번 폐기 후 게시판 댓글 스타일로 확정.
- **오류 / 함정** ⭐⭐:
  - **1차 시도** (폐기): "한 줄 가로 정렬 + ellipsis"
    - 헛다리: 사용자 "두 번째 줄 가는 거 싫음" → ellipsis 적용 = 본문 잘림
    - 사용자 의도: 짧은 본문 한 줄, 긴 본문 줄바꿈 OK. 잘리면 안 됨.
    - 사용자 반응: "내용 길면 뒤에 잘리는 건 또 뭐야??"
  - **2차 시도** (폐기): "한 줄 가로 + 두 번째 줄 들여쓰기 X"
    - 두 번째 줄이 닉네임 옆에서 시작 → 잘못
  - **3차 시도** (폐기): "hanging indent (text-indent + padding)"
    - 헛다리: hanging indent = 첫 줄과 두 번째 줄 같은 위치 정렬로 해석
    - 사용자 의도: 두 번째 줄 좌측 끝에 바짝 붙지 말고 1~2 글자 들여쓰기
    - 사용자 반응: "내 말 알아 들은 거 맞아?"
  - **4차 시도** (폐기): "padding-left 16~24px 들여쓰기"
    - 적용 후 사용자 의도와 다름 → "게시판 댓글 스타일이 가장 이상적"
  - **5차 시도** (확정): 게시판 댓글 스타일
- **학습** ⭐⭐:
  - 사용자 의도 정확히 파싱 = 가장 중요. 추측으로 layout 결정 X.
  - "한 줄 가로", "들여쓰기", "두 번째 줄" 같은 모ho 표현은 시각 예시 (캡쳐 / 위젯) 로 확인.
  - 4번 폐기 후 5번째 확정 = 시간 낭비. 한 번에 정확히.

## 1-10. [공통] 게시판 댓글 스타일 일괄 통일 (5차 확정)
- **한 줄 요약**: 모든 dl2 댓글 / 대댓글 영역을 게시판 댓글 패턴으로 일괄 통일.
- **적용 범위**: 미니홈피 유리병 쪽지 / 미니홈피 사진첩 모달 / 앨범 모달 / 게시판 / 공지 / 제안 댓글
- **결정 사항** (확정 spec):
  - **레이아웃**: 첫 줄 [칭호] [닉네임] (좌) + [날짜 답글 삭제] (우) / 본문 둘째 줄부터 자연 wrapping
  - **날짜**: 월.일만 (연도 X), 작은 글씨 10~11px
  - **답글 묶음**: 부모 댓글 + 답글들 = 한 묶음 (구분선 1개), 답글 사이 X
  - **답글 들여쓰기**: 화살표 옆 (칭호 시작점) 부터 본문 시작, 두 번째 줄도 칭호 시작점 정렬 (화살표 아래 비움)
  - **색감**: 칭호 #8a6710 골드 / 닉네임 #2a4570 잉크 남색 / 본문 #4a2a1a 잉크 갈색 / 시간 #5a7090 옅은 남색
  - **앨범 모달 / 사진첩 모달**: 구분선 추가 (가독성)

## 1-11. [공통] 댓글 본문 우측 메타 침범 방지 ⭐
- **한 줄 요약**: 본문 텍스트가 우측 날짜/답글/삭제 영역 침범하지 않도록 layout 강제.
- **오류 / 함정** ⭐:
  - **증상**: 본문 길어지면 우측 메타 (날짜/삭제) 영역까지 침범. 두 번째 줄도 좌우 폭 전체 차지.
  - **헛다리 1**: flex 1 + min-width 0 + flex-shrink 0 만 적용 → 침범 여전
  - **사용자 반응**: "이런 기본적인 거까지 일일이 알려줘야 해? 와...."
  - **진짜 원인**: 한글 단어가 영문처럼 한 덩어리로 안 잘리고 메타 영역까지 흘러감. word-break 누락.
  - **해결**: word-break: break-all 강제 + 좌측 본문 영역 padding-right (또는 max-width) + 우측 메타 영역 명시적 width / flex-shrink 0
- **학습**:
  - flex 만으로 우측 영역 침범 방지 부족. **word-break: break-all** 한글에 핵심.
  - 명시적 width / padding-right / 우측 영역 width 같이 박아야 안전.

## 1-12. [디자인] 미니홈피 모든 박스 투명도 조정 (0.85 → 0.7)
- **한 줄 요약**: 미니홈피 5개 섹션 박스 alpha 통일. 0.85 너무 불투명 → 0.7 (배경 노을 비침).
- **관련 파일**: ProfileSectionD2 / BadgesSection / PhotosSectionD2 / AdventureLogSectionD2 / GuestbookSectionD2
- **결정 사항**: 모든 섹션 헤드 + 본 박스 alpha 0.7 통일. 배지 본 박스 (이미 0.22) → 0.2 살짝.

## 1-13. [공통] 메인 바람결 소식 종이비행기 축소 + 텍스트 영역 확장
- **한 줄 요약**: 종이비행기 + 궤적 70~80% 축소 + 좌측 이동, 우측 텍스트 영역 확장.
- **배경**: 종이비행기 너무 커서 텍스트 거의 두 줄 넘어감.

## 1-14. [공통] 메인 키워드 선물하기 아이콘 (다이아몬드 → 태그)
- **한 줄 요약**: 메인 "오늘의 항해자" 위젯 안 키워드 선물하기 다이아몬드 이모지 → 태그 모양 SVG.
- **결정 사항**:
  - 디자인 후보 6개 시각화 (#해시태그 / 태그 / 선물박스 / 별 / 봉투 / 라벨+#) 제시
  - 사용자 선택: 태그 모양 (라벨/꼬리표)
  - 색: 기존 글자 색 (파란색 톤) verbatim 유지

## 1-15. [공통] 앨범 모달 사진 모서리 통일 (둥근 → 각진)
- **한 줄 요약**: 앨범 모달 사진 모서리 = 미니홈피 사진첩 모달 패턴 (각진) 으로 통일.
- **결정 사항**: 사진첩 폴라로이드 컨셉 + 항해 메타포 = 각진이 dl2 톤에 어울림.

---

(Part 2 에 계속)
