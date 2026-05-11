# 새벽빛 길드 — 마스터 인덱스

> **목적**: 옛 작업 디테일 찾을 때 어느 파일 보면 되는지 한 페이지 인덱스
> **마지막 업데이트**: 2026-05-10
> **사용법**: 옛 작업 디테일 필요할 때 이 파일 보고 해당 dawnlight-NN 파일 호출
> **사용자(소언)에게**: 새 클로드한테 "dawnlight-NN 보고 답해줘"라고 시키면 해당 파일 읽고 답함

---

## 📂 파일 시간순 (개요)

| 번호 | 파일명 | 시기 | 한 줄 주제 |
|-----|--------|------|----------|
| 00 | dawnlight-00-overview.md | (참조용) | ⚠️ system-context.md로 대체됨, deprecated |
| 01 | dawnlight-01-homepage-foundation.md | 2026-03-31 ~ 04-22 | 홈페이지 첫 구축 (학원/엠블럼 컨셉) |
| 02 | dawnlight-02-cosmic-renewal.md | 2026-04-23 | 우주/별자리 컨셉 전면 리뉴얼 |
| 03 | dawnlight-03-app-pet.md | 2026-04 후반 | 앱 전환 + 펫 시스템 + 아바타 Storage 전환 |
| 04 | dawnlight-04-fishing-game.md | 2026-04-30 ~ 05-01 오전 | 낚시 미니게임 출시 |
| 05 | dawnlight-05-may01-followup.md | 2026-05-01 오후 | WebView 404 진단, 로딩 화면, 칭호/환전 제거/낮밤/STAR |
| 06 | dawnlight-06-chat6-may2-3.md | 2026-05-02 ~ 05-03 | TestFlight + 푸시 중복 버그 + 길드 셀프 점검 + 별똥별 편지 변경 + 자동 배포 정책 |
| 07 | dawnlight-07-deeplink-marathon.md | 2026-05-05 ~ 05-06 | deep-link 시스템 구축 (최신현황) — 14시간 마라톤 |
| 08 | dawnlight-08-push-deeplink.md | 2026-05-06 | 푸시 알림 deep-link 시스템 |
| 09 | dawnlight-09-trian-quit-learnings.md | 2026-05-06 | 트리앤 길탈 처리 + v4 핵심 학습 |
| 10 | dawnlight-10-dl2-finalization.md | 2026-05-08 | dl2 마무리 (안드 silent crash, 댓글 layout 5번 시행착오) |
| 11 | dawnlight-11-dl2-design-cleanup.md | 2026-05-08 | dl2 디자인 정리 + cosmic 폐기 (B 절충안) |
| 12 | dawnlight-12-part1/2/3.md | 2026-05-09 | 멘션 시스템 시작 + 키보드 마라톤 (12 phase 미해결) |
| 13 | dawnlight-13-part1/2.md | 2026-05-09~10 | 모달 페이지화 + 사진첩 deep-link 마라톤 + dead-code 정리 1차 |
| 14 | dawnlight-14-part1/2.md | 2026-05-10 | dead-code 대규모 정리 (-8861줄) + 멘션 시스템 완성 (Phase 5-2/5-3 + 최신현황 강조) + 채팅 row 함정 fix |
| -- | dawnlight-future-notes.md | (갱신만) | 미래 알람 / PENDING / 검증 대기 |

---

## 🔍 주제별 인덱스

### 홈페이지 / 디자인

| 주제 | 어느 파일 |
|------|----------|
| 홈페이지 초기 구축 (Next.js + Firebase) | 01 |
| 학원/엠블럼 컨셉 디자인 | 01 |
| 우주/별자리 리뉴얼 (v0.dev → Claude Code 이식) | 02 |
| dl2 (노을 + 우드 + 종이 톤) | 10, 11 |
| 미니홈피 5단계 (프로필/배지/사진첩/모험기록/유리병쪽지) | 10 |
| 댓글 layout 5번 시행착오 → 게시판 댓글 스타일 확정 | 10 |
| 메인 위젯 (TodaySky / 별똥별 / 한마디 / STAR) | 02, 11 |
| 박스 투명도 / 색감 / 통일 디자인 | 10, 11 |

### 앱 (React Native + Expo)

| 주제 | 어느 파일 |
|------|----------|
| 앱 환경 구축 (Expo SDK) | 03 |
| iOS Firebase 설정 + Pressable + ScrollView 함정 | 03 |
| 펫 시스템 전체 구현 | 03 |
| 아바타 Firebase Storage 전환 | 03 |
| iOS 빌드 / TestFlight 외부 테스팅 | 03, 06 |
| 4채널 OTA 배포 체계 | 03 (확립), 06 (자동 정책 = 2채널로 정정) |
| 앱 WebView 404 진단 (5번 시도) | 04 (시도), 05 (해결) |
| 낚시 게임 앱 통합 (WebView) | 04, 05 |
| 미니홈피 dl2 안드 강제종료 (binary search 5단계) | 10 |
| 채팅 사진 큰 보기 (framer-motion + fixed 함정) | 06 |
| 키보드 처리 (모달 / 페이지 입력) | 06, 12 (마라톤 미해결), 13 (페이지화로 해결) |
| 앱 노을 그라데이션 / 폰트 / 글로우 | 11 |
| **모달 → 페이지화 (Album/Minihome)** | **13** |

### 게임 시스템

| 주제 | 어느 파일 |
|------|----------|
| 낚시 게임 출시 (Canvas 2D, 8800줄) | 04 |
| 가게 / 인벤토리 / 도감 / 미끼 | 04 |
| 동접 / 채팅 / 말풍선 (lerp, 원근법) | 04 |
| 입질 / 게이지 미니게임 / 등급 | 04 |
| 낮/밤 사이클 (절대 시간 동기화) | 05 |
| 낚시 확률 변경 (낮 40/60, 밤 35/65) | 06 (확정) |
| 낚시 채팅 이력 (영구 저장 + 본인 닉 색 구분) | 06 |
| 낚시 디버그 토글 (낮/밤 강제 전환) | 05 (도입) → 06 (제거) |
| 새벽빛 타운 (다음 게임 컨셉) | (별도 컨텍스트 파일) |

### 푸시 알림

| 주제 | 어느 파일 |
|------|----------|
| 푸시 토큰 dedupe (중복 발송 버그) | 06 |
| 푸시 deep-link 진단 (latest vs direct 경로) | 08 |
| 5-A direct trigger 10종 link 추가 | 08 |
| 5-B 칭호 푸시 deep-link | 08 |
| 5-C 한마디 푸시 (메인 + 한마디란 스크롤) | 08 |
| 5-D 채팅 푸시 (메인 + 채팅창 자동 오픈) | 08 |
| 5-E 편지 푸시 (메인 + 편지함 자동 오픈) | 08 |
| 5-F 펫 푸시 (메인만 진입) | 08 |
| 키워드 푸시 mojibake 진단 (firebase-functions v2 path wildcard) | 08 |
| 푸시 카테고리 prefix 정리 ([최신현황] 제거 등) | 08 |
| Cold-start gesture race (InteractionManager + 500ms) | 08 |
| 별똥별 편지 알림 (수신자 푸시) | 06 |
| **알림 토글 시스템** (이미 완성, 운영 중 확인) | **14** |

### Deep-link 시스템 (홈피 + 앱)

| 주제 | 어느 파일 |
|------|----------|
| useDeepLinkParam 공통 hook 도입 | 07 |
| useSearchParams race 12시간 마라톤 (8번 헛다리) | 07 |
| Functions 자동 정규화 (race-leak 영구 봉인) | 07 |
| Phase 1 deep-link (모험노트/방명록/투력) | 07 |
| 사진첩 deep-link + 앱 PushTapHandler | 07 |
| 게시판 게시글/댓글 deep-link | 07 |
| 일정 deep-link | 07 |
| 방명록 페이지네이션 점프 | 07 |
| useGlobalSearchParams (글로벌 오버레이 한계) | 08 |
| useFocusEffect ref reset (재진입 봉인) | 07 |
| **사진첩 deep-link 정밀 스크롤 마라톤** (페이지화 후) | **13** |
| **채팅 row 두 번째 클릭 함정 fix** (router.setParams) | **14** |

### 멘션 시스템 (@닉네임)

| 주제 | 어느 파일 |
|------|----------|
| Phase 1+2 인프라 (파서/자동완성/렌더러) | 12 |
| Phase 3+6 백엔드 (트리거/forceSend/dedupe) | 12 |
| Phase 4 채팅 (FloatingChat) | 12 |
| Phase 5-1 게시판 (본문 + 댓글 + 영문 우선 정렬) | 12 |
| **Phase 5-2 앨범 (캡션 + 댓글 + 답글, 표시 5-2a + 입력 5-2b)** | **14** |
| **Phase 5-3 미니홈피 (방명록 + 사진 + 댓글, 표시 5-3a + 입력 5-3b)** | **14** |
| Phase 5-4 제안 (보류 — 사용자 결정) | (미진행) |
| **최신현황 row 누구2/우리길원들 강조** | **14** |
| 웹 멘션 dead code 통합 함정 (GuildChat dead) | 12 |
| React 19 JSX 네임스페이스 fix | 12 |

### 길드원 / 데이터 관리

| 주제 | 어느 파일 |
|------|----------|
| 길탈 처리 패턴 (재사용 scripts/delete-{nickname}.mjs) | 09 |
| 트리앤 길탈 (82 docs 삭제, 백업 보존) | 09 |
| 버음바 길탈 | 06 |
| **나슈타 길탈** | **12** |
| 닉네임 변경 / 관리자 페이지 | 03 |
| Firestore 보안 규칙 만료 (2027-05-01) | future-notes |

### 별똥별 편지 / 길드 셀프 점검

| 주제 | 어느 파일 |
|------|----------|
| 별똥별 편지 즉시 발송 + 길마 모니터링 | 06 |
| /admin/letters 검색 + 기간 필터 | 06 |
| 길드 셀프 점검 페이지 (/guild-test) | 06 |
| 22개 질문 트리 + 5종 결과 멘트 | 06 |
| guildTestResults Firestore (마음 변화 추적) | 06 |
| 환생석 이벤트 종료 (제거) | 06 |
| renewal 50p 이벤트 (chat2 시작 → 06 정리) | 02, 06 |

### 칭호 / 아바타 / 포인트

| 주제 | 어느 파일 |
|------|----------|
| 칭호 시스템 + 매월 자동 리셋 | 03 |
| 칭호 가격 인하 (저렴/보통/고급/특별) | 05 |
| 칭호 단어 추가 ("자", "나" 등) | 06 |
| 환전 기능 통째 제거 | 05 (논의), 06 (제거) |
| 아바타 레이어 시스템 (10단 레이어) | 03 |
| 프사 정사각 1:1 crop UI | 11 |
| 출석 streak 로직 (attend_7/30/100) | 11 |

### 인프라 / 배포

| 주제 | 어느 파일 |
|------|----------|
| Vercel + GitHub 연결 | 01 |
| 자동 배포 정책 (2채널 vs 4채널) | 06 (확립) |
| OTA 콜드 스타트 2회 메커니즘 | 08 |
| Cloud Functions (트리거, 자동 리셋, 정리) | 03, 06, 07 |
| Firebase Storage Blaze 플랜 | 03 |
| TestFlight 외부 그룹 + 공개 링크 | 06 |
| EAS production 채널 생성 | 03 |
| EAS OTA 가끔 거부 (해결됨) | 03 |

### Cosmic 폐기 / dl2 전환 / Dead-code 정리

| 주제 | 어느 파일 |
|------|----------|
| dl2 도입 (featureFlags 분기) | 10 |
| 모든 길드원 dl2 공개 (`return true`) | 11 |
| cosmic 깜빡임 진단 (Vercel CDN cache) | 11 |
| cosmic 부분 폐기 B 절충안 | 11 |
| **Step 6 dead-code 정리 1차 (KeyboardDebugBox/PhotoViewerModal/AlbumPhotoViewer)** | **13, 14 (재정리)** |
| **AuthModal + CharacterForm + modalKeyboard 통째 제거** | **14** |
| **cosmic dead-chain 4파일 통째 제거 (PhotosSection 등)** | **14** |
| **ProfileSection + BgmPlayer 제거 (type MemberDoc 이전)** | **14** |
| **TopHeader 제거 (HEADER_HEIGHT 상수 이전)** | **14** |

### 시스템 학습 / 함정 (각 파일에서 발췌)

| 주제 | 어느 파일 |
|------|----------|
| WebView 404 진단 (추측 5번 후 발견) | 05 |
| 모험기록/사진 deep-link race (추측 8번 후 발견) | 07 |
| 안드 silent crash binary search (5단계) | 10 |
| 댓글 layout 5번 시행착오 | 10 |
| 푸시 토큰 dump-state 진단 | 06 |
| Cloud Functions silent bail 진단 (logger.info) | 08 |
| 자동 배포 정책 메모리 충돌 정정 | 06 |
| **키보드 회피 12 phase 마라톤 (미해결 → 페이지화로 우회)** | **12, 13** |
| **사진첩 deep-link 정밀 스크롤 마라톤** | **13** |
| **사전 재검증으로 진단 오판 검출 (Wardrobe live 발견)** | **14** |
| **채팅 row 두 번째 클릭 함정 (같은 URL 발화 X)** | **14** |
| **git add -A 사고 방지 (specific add 강제)** | **14** |

→ 자세한 함정 패턴은 `core-learnings.md` 참조

---

## 🗓️ 시간순 주요 마일스톤

```
2026-03-31 ─ 홈페이지 첫 구축 시작 (학원 컨셉)
2026-04-22 ─ 학원 컨셉 마무리
2026-04-23 ─ 우주 테마 전면 리뉴얼 (v0.dev)
2026-04-?? ─ 앱 전환 + 펫 시스템 시작
2026-04-30 ─ 낚시 게임 출시
2026-05-01 ─ WebView 404 진단/해결, 환전 제거, 낮밤 사이클
2026-05-02 ─ TestFlight 외부 테스팅 + 푸시 중복 버그 수정
2026-05-03 ─ 길드 셀프 점검 페이지 + 별똥별 편지 즉시 발송
2026-05-05 ─ deep-link 마라톤 시작 (14시간+)
2026-05-06 ─ 푸시 deep-link 완료 + 트리앤 길탈
2026-05-08 ─ dl2 마무리 + cosmic 부분 폐기 + 모든 길드원 공개
2026-05-09 ─ 멘션 시스템 시작 (Phase 1-5-1 게시판) + 키보드 마라톤 (미해결)
2026-05-09~10 ─ 모달 페이지화 + 사진첩 deep-link 마라톤 + dead-code 정리 1차
2026-05-10 ─ dead-code 대규모 정리 (-8861줄) + 멘션 완성 (앨범/미니홈피) + 채팅 row 함정 fix
```

---

## 🎯 자주 쓰는 검색 패턴

### "이거 어떻게 만들었지?" 패턴
1. `master-index.md`에서 주제 검색
2. 해당 파일 번호 확인
3. 사용자에게 "dawnlight-NN 봐서 답할게요" 알림 또는 사용자가 명시 호출

### "비슷한 함정 만났는데" 패턴
1. **먼저 `core-learnings.md`** 검색
2. 알려진 패턴이면 → 즉시 봉인 코드 적용
3. 새 패턴이면 → 진단부터

### "옛 결정 사항 / 컨셉" 패턴
- 디자인 컨셉 → 02 (우주), 10-11 (dl2)
- 게임 메커니즘 → 04 (낚시)
- 시스템 결정 (자동 배포 / 별똥별 등) → 06
- 푸시 매핑 → 08
- 멘션 시스템 → 12, 14

---

## ⚠️ 중요 주의사항

### 00 파일은 deprecated
- `dawnlight-00-overview.md`는 옛 통합 overview
- **이제 `system-context.md`로 대체됨** (이 파일이 더 최신)
- 00번은 삭제 또는 reference만

### future-notes는 항상 갱신
- 새 작업 끝나면 future-notes에 PENDING / 검증 대기 / 미래 알람 갱신
- 번호 안 붙음 (시리즈 X)

### 새 시기 작업 추가 시
- `dawnlight-NN-주제.md` 형식 (NN은 시간순 증가, 다음은 15)
- 한 파일 600줄 이내. 600줄 넘으면 자연 경계로 분할
- 각 파일 ⭐ 학습 포인트는 `core-learnings.md`에 합치기

---

## 끝

> 이 인덱스는 새벽빛 길드 작업 일지 빠른 검색용입니다.
> 시스템 작동 방식 → system-context.md
> 함정/패턴 → core-learnings.md
> 옛 작업 디테일 → 해당 dawnlight-NN 파일 (이 인덱스로 찾기)
