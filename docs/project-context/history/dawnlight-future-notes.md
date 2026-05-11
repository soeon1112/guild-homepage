# 새벽빛 길드 — 미래 알람 / 향후 메모

> **목적**: 시간이 지나면 다시 돌봐야 할 항목들 정리
> **마지막 업데이트**: 2026-05-10

---

## 미래 알람 (잊으면 서비스 멈춤)

### 1. Firestore 보안 규칙 만료 — **2027-05-01**

- **무엇**: Firebase 콘솔 Firestore Rules의 임시 규칙 만료 날짜
- **언제**: 2027년 5월 1일 도래 시 자동 만료 → 모든 읽기/쓰기 차단 → 홈페이지+앱 전체 로그인 불가
- **어떻게**: Firebase 콘솔 → Firestore → Rules → 만료 날짜를 한 번 더 미래로 연장
- **왜 알람 필요**: chat4 시점에 한 번 만료되어 전체 서비스 다운 → 긴급 처리한 이력 있음. 같은 사고 반복 방지.

### 2. iOS TestFlight 빌드 만료 — 90일

- **무엇**: TestFlight 외부 테스트 빌드는 90일 유효
- **언제**: 빌드 1.0.0 (5) 업로드 시점 (2026-05-02) + 90일 ≈ **2026-08-01경**
- **어떻게**: 만료 전 새 production 빌드 생성 → `eas submit --platform ios --latest`로 TestFlight 재업로드 → 외부 그룹에 추가
- **왜 알람 필요**: 만료되면 길드원 iPhone 사용자 새 빌드 못 받음.

### 3. Firebase Functions Node 20 deprecation — **2026-10-30** (NEW)

- **무엇**: Cloud Functions가 Node 20에서 동작 중, Firebase가 deprecation 예고
- **언제**: 2026-10-30 마감
- **어떻게**: `functions/package.json` 의 `"engines": { "node": "..." }` 와 Cloud build 환경 업데이트. 호환성 테스트 후 deploy.
- **왜 알람 필요**: 마감 지나면 자동 deploy 안 되거나 옛 환경 강제 종료 위험.

---

## 정기 점검 권장 (미루면 누적되는 것들)

### 4. 푸시 토큰 중복 점검 — **분기마다 권장**

- **무엇**: 같은 폰에 여러 계정 로그인했을 때 푸시 토큰 중복 누적
- **현재 상태**: 서버 dedupe 로직 작동 중 → 알림 자동 1번만 발송
- **권장**: 3개월에 한 번 `scripts/dump-push-state.mjs`로 점검
- **정리 필요 시**: `scripts/scrub-stale-push-tokens.mjs --apply`

### 5. 백업 폴더 정리 — **6개월 후 검토**

- **무엇**: 길탈 처리 시 생성된 백업 폴더들
- **위치**: `guild-homepage/backups/`
- **현재 백업**:
  - `stale-push-2026-05-03/` — 푸시 토큰 정리 백업
  - `trian-2026-05-06/` — 트리앤 길탈 백업 (82 docs)
  - `나슈타-2026-05-09/` — 나슈타 길탈 백업
- **권장**: 6개월 후 (2026-11경) 복구 필요 없으면 삭제 검토

### 6. cosmic dead 분기 점진 정리 — **각 페이지 작업 시**

- **무엇**: cosmic 폐기(B 절충안) 후 inline `isDawnlight2 && dl2Styles.X` 분기 잔존
- **현재 상태 (2026-05-10 update)**:
  - **2026-05-10 대규모 정리 완료** (-8861줄):
    - ✅ PhotosSection / GuestbookSection / AdventureLogSection cosmic 통째 삭제
    - ✅ ProfileSection / BgmPlayer 통째 삭제 (type MemberDoc → `src/types/minihompi.ts`로 이전)
    - ✅ TopHeader 통째 삭제 (HEADER_HEIGHT 상수 → `src/lib/layout.ts`로 이전)
    - ✅ KeyboardDebugBox / AuthModal / CharacterForm / modalKeyboard 통째 삭제
- **다음 라운드 PENDING (C-2 ~ C-4)**:
  - **C-2**: board / album / notice / proposals cosmic 분기 제거 (4 페이지)
  - **C-3**: shared 모듈 cosmic 분기 (DatePickerModal, AlbumPhotoViewer)
  - **C-4**: live 6건 색상 swap (페이지 root 4 + FloatingChat 2)
  - **Wardrobe.tsx**: swap 대상 (dl2 ProfileSectionD2가 mount 중이라 삭제 X)
  - 모두 끝나면 `colors.abyss/abyssDeep` 팔레트 자체 폐기 가능
- **잔존 살아있는 컴포넌트** (정리 대상 외):
  - CardNebula (BadgesSection 등 활성 dl2 path와 얽힘)
  - CollapsibleSection / KeywordsSection

---

## 검증 대기 (자연 발생 시 확인)

### 7. v4 deep-link 자연 검증 항목

- **5-B 칭호 deep-link**: 다음에 누군가 칭호 조합 완성 시 푸시 받아 탭 → 정상 동작 확인
- **5-F 펫 푸시**:
  - 펫 선물 받기: 길드원에게 부탁 시 검증
  - 펫 status low: 30분 cron 자연 발생 기다리기
- **5-C / 5-D / 5-E**: 사용자 1차 검증 OK, 다양한 시나리오 자연 발생 시 추가 확인

### 8. 멘션 시스템 검증 항목 (2026-05-09~10 적용) ⭐ NEW

작업 일지 12, 14에서 적용한 멘션 통합 자연 검증:

- **Phase 4 채팅**: 다양한 시나리오 자연 검증
- **Phase 5-1 게시판**: 본문/댓글 멘션 자연 발생 검증
- **Phase 5-2 앨범 (캡션/댓글/답글)**: 자동완성 + 강조 + 푸시 + 딥링크
- **Phase 5-3 미니홈피 (방명록/사진/댓글)**: 같은 패턴 자연 검증
- **최신현황 row 강조 (누구1 + 누구2/우리길원들)**: 다양한 케이스 발생 시 정상 동작
- **채팅 row 두 번째 클릭 fix (commit 04aecb3)**: 장기 동작 + cold-start race 검증
- **공지 본문 (앱)**: PostBody 활용으로 자동 적용 확인

### 9. dl2 마무리 작업 검증 항목

작업 일지 10, 11에서 적용한 변경 자연 검증:

- 게시판 댓글 스타일 일괄 통일
- 답글 화살표 옆 들여쓰기 (칭호 시작점 정렬)
- 본문 우측 메타 침범 방지 (word-break + width 분리)
- 미니홈피 박스 투명도 0.7
- 앨범 모달 사진 각진 모서리
- 메인 위젯 일괄 변경 (종이비행기 축소, 유리병 쪽지 통일)
- 안드 출첵 후 글로우 정상화
- 익명 편지 모달 z-index 정리

---

## PENDING (보류 / 다음 라운드)

### 10. 멘션 Phase 5-4 — 제안 본문 (사용자 결정으로 보류)

- **상태**: 보류 (소언님 결정)
- **이유**: schema 변경 동반 (title → title + description). 옛 문서 호환성 결정 필요.
- **결정 필요 사항**:
  - 옛 제안 글의 title을 어떻게 처리? (그대로 / description으로 마이그레이션 / 사용자 액션)
  - 제안 deep-link은 /proposals만 (상세 페이지 없어서 글 단위 이동 X)
- **다시 진행 시**: 사용자에게 결정 사항 다시 물어보고 진단부터 시작

### 11. 공지 댓글 / 제안 댓글 인프라 신규 — **별도 라운드**

- **상태**: 인프라 자체 없음 (Firestore 컬렉션 + 트리거 + UI 전체)
- **이유**: 공지/제안은 현재 댓글 기능 없음
- **연쇄**: 인프라 만들면 멘션도 같이 적용 (현재 멘션 5-4 보류한 이유 중 하나)
- **작업량**: 큰 작업 (UI + 백엔드 + 마이그레이션)

### 12. GuildChat.tsx dead code 삭제

- **상태**: dead code 확인됨 (운영 미사용)
- **이유**: redesign/FloatingChat.tsx가 진짜 운영 컴포넌트
- **작업량**: 작음 (파일 삭제 + import 정리)
- **언제**: 다음 dead-code 정리 라운드에 포함

### 13. 앱 아이콘 dl2 톤 변경

- **상태**: 보류 (빌드 필요)
- **상세**: 다음 큰 기능 추가 시 같이 빌드 + 변경. 단독으로 빌드 돌리는 건 비효율.

### 14. 출석 streak 로직 백필 (적용됐는지 자연 검증)

- **상태**: 적용 완료 (chat11)
- **검증 필요**: streak 필드 정상 증가 + attend_7/30/100 자동 발급 + 하루 빠지면 reset 확인

### 15. 프사 정사각 crop UI (적용됐는지 자연 검증)

- **상태**: 적용 완료 (홈피 react-easy-crop / 앱 expo-image-picker aspect [1,1])
- **검증 필요**: 비정사각 사진 업로드 시 정사각 crop UI 동작 확인

---

## 다음 정리 시점 가이드

새 작업이 누적되어 다시 정리해야 할 때:

1. **파일명 규칙**: `dawnlight-NN-주제.md`
   - NN은 시간 순서대로 증가 (현재 14까지, 다음은 15)
   - `dawnlight-future-notes.md`는 항상 갱신만 (번호 X)

2. **한 파일 600줄 제한**
   - 600줄 넘어가면 자연스러운 경계로 분리
   - 분할 시 part1, part2 식으로

3. **새 Claude 대화 시작 시 첨부**
   - 모든 dawnlight 파일 + system-context + core-learnings + master-index + future-notes 첨부
   - "이거 새벽빛 길드 작업 일지야. 읽고 컨텍스트 잡아줘" 한 마디

4. **공통 hook / 패턴 발견 시**
   - 작업 일지에 ⭐ 표시하고 `core-learnings.md`에 정리
   - 예: `useDeepLinkParam`, mojibake fix, cold-start gesture race, **router.setParams 패턴**, **사전 재검증 패턴**, **git add -A 사고 방지**

5. **현재까지 발견된 핵심 함정 패턴**:
   - useSearchParams race (Next.js App Router) → `useDeepLinkParam` hook
   - firebase-functions v2 path wildcard mojibake → UTF-8 재해석
   - cold-start gesture race → InteractionManager + 500ms gate
   - 글로벌 오버레이 hook → useGlobalSearchParams
   - multi-retry land 후 cancel → landed flag + clearTimeout
   - useFocusEffect ref reset → 재진입 자동 오픈
   - react-native-svg `<G>` transform interpolated string 안드 silent crash → Animated.View + translateY/scale
   - Vercel CDN edge cache + OTA 도달 지연 → 깜빡임/미적용 의심 1순위
   - **같은 row 두 번째 클릭 함정 → `router.setParams({ key: undefined })`** (NEW, 2026-05-10)
   - **사전 재검증으로 진단 오판 검출** (NEW, 2026-05-10)
   - **git add -A 사고 방지 (specific add 강제)** (NEW, 2026-05-10)
   - **type-only import 분리** (NEW, 2026-05-10)

---

## 핵심 성과 요약 (이번 세션, 2026-05-10)

### dead-code 정리
- **6 commit, -8861줄 사라짐 (git +FS 합계)**
- cosmic 분기 다수 제거, type-only import 분리 패턴 적용
- 안전 장치 (사전 재검증) 여러 번 작동 → 사고 방지

### 멘션 시스템 완성
- Phase 5-2 (앨범) + Phase 5-3 (미니홈피) 입력 + 표시 통합
- 최신현황 row 강조 추가 (누구1 + 누구2/우리길원들)
- 채팅 row 두 번째 클릭 함정 fix (router.setParams 패턴)

### 알림 토글 시스템
- 이미 운영 중 확인 → 변경 0
- 11개 카테고리 토글, mention은 의도적 제외 (강제 발송 정책)

---

## 끝

> 이 시리즈는 새벽빛 길드(마비노기 모바일) 홈페이지+앱 개발 작업 일지입니다.
> 길드 길마가 코드 비전공자라 모든 작업을 AI 보조로 진행했습니다.
> 다음 작업 시점 (15번)에 이 future-notes를 갱신하세요.
