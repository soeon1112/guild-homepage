# 새벽빛 길드 — 시스템 컨텍스트

> **목적**: 새 ChatGPT/Codex 대화에서 시스템 작동 방식 + 프로젝트 맥락 + 작업 스타일을 빠르게 파악
> **마지막 업데이트**: 2026-05-12
> **다른 파일과의 관계**: 이 파일은 항상 첨부. 옛 작업 디테일은 `master-index.md` 보고 해당 dawnlight-NN 파일 호출. 핵심 함정은 `core-learnings.md` 확인.

---

## 누구 / 뭐 만들었나

- **운영자**: 새벽빛 길드(마비노기 모바일) 길마. **코드 비전공자**.
- **모든 작업**: AI 보조로 진행. 과거에는 Claude(claude.ai) + Claude Code 조합으로 진행했고, 앞으로는 **ChatGPT + Codex + GitHub 저장소 기반 작업**을 중심으로 진행.
- **만든 것**: 길드 홈페이지 + 모바일 앱(안드 + iOS) + 펫 키우기 게임 + 낚시 미니게임 + 미니홈피 + 채팅 + 별똥별 편지 + 길드 셀프 점검 + **@닉네임 멘션 시스템** 등

---

## 현재 작업 도구 역할 (ChatGPT + Codex 기준)

**ChatGPT**: 판단 보조 + 작업 방식 관리 + Codex 명령문 작성
- 사용자 한 마디를 Codex에 바로 붙여넣을 수 있는 명령문으로 정리
- 전체 플랜을 임의로 확정하지 않고, 사용자가 고른 한 항목만 다룸
- Codex 결과를 검토하고, 다음 한 단계만 제안

**Codex**: 실제 코드/문서 작업
- 별개 터미널 도구
- cmd에서 `codex` 명령으로 진입해서 사용
- ChatGPT가 짜준 프롬프트를 cmd에 복붙
- GitHub 저장소 기준으로 코드 분석 및 변경 제안
- 코드 수정 전에는 먼저 계획/분석을 요청
- 변경 시에는 수정 파일 범위와 금지 영역을 명확히 지정

**GitHub**: 프로젝트 기준 저장소
- `guild-homepage`, `dawnlight-app` 저장소를 기준으로 Codex가 작업
- 중요한 문맥 문서는 각 저장소의 `docs/project-context/`에 보관
- 민감 파일은 `.gitignore`로 제외하고, `git add -A` 금지

**Claude/Claude Code 관련 참고**
- 이 프로젝트의 기존 작업 다수는 Claude/Claude Code로 진행된 과거 이력이 있음
- 옛 작업 문서에는 Claude 기준 표현이 남아 있을 수 있으나, 앞으로의 신규 작업 기준은 ChatGPT + Codex임

---

## 너 작업 흐름 (핵심)

### 최우선 작업 방식
- **한 번에 한 항목만 진행**한다.
- ChatGPT가 임의로 첫 작업이나 다음 루트를 확정하지 않는다.
- 후보를 제시할 수는 있지만, 최종 선택은 사용자에게 묻는다.
- 전체 리뉴얼/전체 플랜을 계속 만지지 않고, 사용자가 고른 한 항목만 세부 플랜/명령문으로 다룬다.
- 실제 작업으로 이어지는 Codex 명령문 중심으로 답한다.

### "○○ 알아봐줘" → 조사/진단 명령
- 기존 코드 구현 여부나 영향 범위 확인이 필요한 경우에만 조사한다.
- 예: "이 기능이 이미 구현돼 있는지 봐줘", "이거 건드리면 기존 유저 데이터 깨져?"

### "○○ 해줘" → 사용자가 고른 한 항목만 진행
- (a) 기존 구현 확인이 필요한 작업이면 → 조사 명령 먼저 작성
- (b) 바로 적용 가능한 단순 작업이면 → 해당 항목만 적용 명령 작성
- (c) 큰 작업이면 → 전체 플랜이 아니라 해당 항목 전용 세부 플랜 작성
- ⚠️ 단순 작업은 불필요하게 진단 단계로 돌리지 않는다.

### 모든 적용 명령 끝에
**자동 배포 정책 한 줄 추가**:
```
"자동 배포 정책 적용"
```
⚠️ 빼먹지 마. 매번 무조건 추가.

### 모든 작업 명령에 필수 포함
1. **사전 재검증 단계 (A/B/C/D)** — 진단 결과 verbatim 한 번 더 확인 (사고 방지)
2. **specific git add** 강제 — `git add -A` 절대 X (민감 파일 보호)
3. **보호 영역 명시** — 절대 건드리지 말 영역 list
4. **회귀 영향 검증** — 이전 commit 영향 0 verbatim 확인

---

## 자동 배포 정책 (확정)

**모든 코드 변경 = 홈페이지 + 앱 양쪽 자동 배포.**

| 변경 영향 | 처리 |
|----------|------|
| 홈페이지만 | git push (Vercel 자동) |
| 앱만 | 안드 preview + iOS production OTA |
| 양쪽 다 / 애매 | 양쪽 다 배포 (안전) |

⚠️ **"자동 배포 정책 적용" = 정확히 2채널: 안드 preview + iOS production**. 4채널 전부 X.

### OTA 명령
- 안드: `eas update --branch preview --platform android`
- iOS: `eas update --branch production --platform ios`
> Codex가 작업 명령을 만들거나, 사용자가 로컬 터미널에서 직접 실행할 때 사용하는 명령입니다.

### 빌드 필요 (OTA 안 됨)
- 새 네이티브 패키지 추가
- Expo SDK 업그레이드
- 앱 아이콘/스플래시 변경
- 권한 추가

---

## 프로젝트 구성

### 홈페이지
- 경로: `C:\Users\user\Desktop\guild-homepage`
- 기술: Next.js 15 + React 19 + Tailwind CSS + Firebase + Vercel
- URL: https://dawnlight-guild.vercel.app
- GitHub: github.com/soeon1112/guild-homepage (main 브랜치 = production)
- Vercel: Pro 플랜 ($20/월)

### 앱
- 경로: `C:\Users\user\Desktop\dawnlight-app`
- 기술: React Native + Expo (SDK 54), expo-router ~6.0.23
- 안드로이드 + iOS (TestFlight 외부 테스팅 운영 중)
- 빌드: EAS Build, EAS Update (OTA)
- 채널: preview, production × android, ios = 4채널 (자동 배포는 2채널)

### Cloud Functions
- 경로: `functions/`
- 푸시 알림 트리거, 칭호 자동 리셋(매월 1일), activity 컬렉션 자동 정리(300개 초과 삭제)
- FCM V1 서비스 계정 키로 푸시 인증
- Node 20 (deprecation 2026-10-30 마감)

### 외부 서비스
- Anthropic API (펫 대화: claude-haiku-4-5)
- 카카오톡 (공지 + 길드원 1:1 소통)

---

## 페이지 매핑 (홈페이지)

| 경로 | 기능 |
|------|------|
| `/` | 메인. TodaySky(별자리+출석), 별똥별 편지, 성운의 속삭임(최신현황 10개), 별에게 한마디, STAR OF THE DAY, 메뉴 그리드 |
| `/notice` | 공지 게시판 (관리자 전용 작성) |
| `/schedule` | 일정 캘린더 (관리자만 등록) |
| `/combat` | 투력 및 지옥 현황 |
| `/members` | 길드원 목록 |
| `/members/[id]` | 미니홈피 (프로필+키워드, 배지, 사진첩, 모험 기록, 유리병쪽지, 배경음악) |
| `/album` | 앨범 |
| `/board` | 게시판 |
| `/shop` | 상점 |
| `/mypage` | MY 페이지 (포인트, 푸시 알림 설정) |
| `/guild-test` | 길드원 셀프 점검 |
| `/admin/letters` | 별똥별 편지 모니터링 |
| `/admin/activity` | 최신현황 직접 작성/삭제 |
| `/admin/users` | 닉네임 변경 |
| `/admin/pet-logs` | 펫 대화 로그 + 차단/해제 |
| `/admin/guild-test-results` | 셀프 점검 응답 모니터링 |
| `/fishing` | 앱 WebView 전용 입구 |

---

## Firestore 주요 컬렉션

| 컬렉션 | 설명 |
|--------|------|
| `users/{nickname}` | 닉네임/비번/포인트/MBTI/칭호/lastChatRead/lastAttendance/streak + **notificationSettings** (11 카테고리 토글) |
| `users/{nickname}/badges` | 배지 획득 기록 |
| `users/{nickname}/keywords` | 다른 사람이 달아준 해시태그 |
| `users/{nickname}/pointHistory` | 포인트 변동 이력 |
| `users/{nickname}/fishing/current` | 낚시 캐릭터/인벤/도감/레벨/별빛/체력/위치 |
| `members/{id 또는 nickname}` | 미니홈피 (프사, 한마디, mood, bgmUrl 등) |
| `members/{id}/adventureLogs` | 모험 기록 |
| `members/{id}/photos` | 사진첩 |
| `members/{id}/guestbook` | 유리병 쪽지 |
| `characters/{docId}` | 투력 캐릭터, runeBuilds 필드 |
| `notice` / `board` / `album` / `schedule` | 게시판/일정 |
| `chat` | 채팅 메시지 |
| `fishing_chat` | 낚시 게임 채팅 (영구 저장, 200개 초과 자동 삭제) |
| `activity` | 최신현황 (300개 제한, 자동 삭제) |
| `letters` | 별똥별 편지 |
| `guestbook` | 메인 흔적남기기 |
| `titleWords` | 칭호 단어 + 누가 선점했는지 |
| `pets/{nickname}` | 펫 종/단계/상태/가구/장난감 |
| `playground/{nickname}` | 펫 놀이터 동접 |
| `fishing_players/{nickname}` | 낚시 동접 |
| `petChats/{...}` | 펫 대화 로그 |
| `guildTestResults` | 셀프 점검 응답 |

---

## 핵심 시스템 빠른 요약

### 포인트 (별빛)
- 댓글 1, 대댓글 1, 방명록 2, 사진 2, 게시글 2, 출석 1/일
- 환전 기능 제거됨. 별빛은 칭호/아바타/펫/낚시에서만 사용.

### 배지
- 40+종, 자동 부여, 히든 포함
- 출석 streak 로직 적용됨 (streak 필드 +1/일, 하루 빠지면 reset, attend_7/30/100 자동 발급)

### 칭호
- 앞+뒤 단어 조합, 매월 1일 Cloud Function 자동 리셋
- 가격: 저렴 2 / 보통 4 / 고급 6 / 특별 8 별빛
- 닉네임 앞 「앞 뒤」 70% 크기 금색

### 아바타
- Firebase Storage 호스팅, URL 캐시 버스팅
- 10단 레이어, 베이스 4가지 케이스 자동
- 프사 정사각 1:1 crop UI 적용

### 펫
- 9종 5단계, 경험치만으로 성장
- 상호작용 9종, 펫 대화 = Anthropic API

### 낚시 게임
- FishingGame.tsx (Canvas 2D, 약 8800줄)
- 낮 30분 / 밤 5분 사이클 (절대 시간 동기화)
- 확률: 낮 채집물 40%/물고기 60%, 밤 35%/65%

### 채팅
- 우측 하단 FloatingChat 전 페이지 공통, Firestore `chat`
- 푸시 deep-link: 채팅 푸시 탭 → 메인 + 채팅창 자동 오픈 (useGlobalSearchParams + InteractionManager + 500ms gate)
- **2026-05-10 추가 fix**: row 두 번째 클릭 함정 해결 (`router.setParams({ chat: undefined })`)
- **2026-05-10 추가**: @닉네임 멘션 입력 + 표시 통합

### 최신현황 (NebulaWhispers)
- `activity` 컬렉션, 300개 초과 자동 삭제
- 클릭 시 deep-link로 정확한 위치 이동
- Cloud Functions 자동 정규화로 옛 클라이언트 호환 영구 봉인
- **2026-05-10 추가**: 멘션 활동 row에서 누구1+누구2/우리길원들 모두 강조 (옛 활동 자동 호환)

### 별똥별 편지 (익명 편지)
- 즉시 발송, 길마 사후 모니터링
- 수신자 푸시: "✨ 별똥별 편지가 도착했어요"
- 익명 — 최신현황에 안 뜸, 푸시만 감

### Dawnlight 2 (dl2)
- 모든 길드원 공개됨 (2026-05-08)
- 노을 + 우드 + 종이 톤 디자인
- featureFlags `return true` (한 줄)
- **2026-05-10 dead-code 정리 대규모 진행** (-8861줄):
  - KeyboardDebugBox, AuthModal, CharacterForm, modalKeyboard 통째 제거
  - cosmic dead-chain: PhotosSection / GuestbookSection / AdventureLogSection / ProfileSection / BgmPlayer / TopHeader 통째 제거
  - type-only import 분리 패턴 적용 (MemberDoc, HEADER_HEIGHT 등 별도 파일로 이전)
- 미니홈피 5단계: 프로필 → 배지 → 사진첩 → 모험기록 → 유리병 쪽지

### 멘션 시스템 (@닉네임, 2026-05-09~10 완성)
- **인프라**: mentions.ts 파서, MentionPicker (자동완성), MentionText (강조 표시), useMentionCandidates
- **백엔드 트리거**: 각 카테고리별 dispatchMentions (chat/board/album/guestbook/minihome_photo/minihome_photo_comment)
- **forceSend: true** — 강제 발송 (사용자가 알림 OFF 해도 푸시)
- **완료 영역**:
  - ✅ 채팅 (FloatingChat) — Phase 4
  - ✅ 게시판 본문/댓글 — Phase 5-1
  - ✅ 앨범 캡션/댓글/답글 — Phase 5-2 (표시 5-2a, 입력 5-2b)
  - ✅ 미니홈피 방명록/사진/댓글 — Phase 5-3 (표시 5-3a, 입력 5-3b)
  - ✅ 최신현황 row 누구1+누구2/우리길원들 강조 (옛 활동 자동 호환)
  - ✅ 공지 본문 (앱) — PostBody 활용으로 자동 적용 (보너스)
- **보류**: Phase 5-4 제안 본문 (사용자 결정)
- **별도 라운드 필요**: 공지 댓글 / 제안 댓글 인프라 신규 (현재 없음)

### 알림 토글 시스템 (NotificationSettingsCard, 이미 운영 중)
- MY 페이지 `NotificationSettingsCard` 컴포넌트
- 11개 카테고리 토글: notice / chat / latest / whisper / myspace / album / board / schedule / pet / letter / proposal
- Firestore `users/{nickname}.notificationSettings` + AsyncStorage 양쪽 동기화
- 모든 trigger 자동 `isCategoryEnabled` 체크 (`recipients.ts`)
- 기본값 모두 ON, 마이그레이션 불필요
- **mention 의도적 제외**: 강제 발송 정책 (categories.ts 주석 명시)

### Deep-link 시스템
- `useDeepLinkParam` 공통 hook (홈피)
- 앱: `addNotificationResponseReceivedListener` + cold start 처리
- `navigateLink` 헬퍼 (앱) — path 변환 + router.push
- `useGlobalSearchParams` 글로벌 오버레이 (FloatingChat 등)
- Functions 자동 정규화 (옛 형식 doc 자동 변환)
- **2026-05-10 fix**: 글로벌 오버레이 같은 row 두 번째 클릭 함정 (`router.setParams` 패턴)

---

## 변경 유형별 배포 방법

| 변경 유형 | 방법 | 소요 시간 |
|----------|------|----------|
| 홈페이지 코드 | `git push` → Vercel 자동 | 1~3분 |
| 앱 JS 코드만 | `eas update` (자동 배포 = 2채널) | 5분 |
| 앱 네이티브 변경 | `eas build` 재빌드 | 10~20분 |
| Firebase Storage 이미지 | `scripts/upload-avatars.mjs` 등 | 1분 |
| Cloud Functions | `firebase deploy --only functions` | 2분 |
| Firestore 보안 규칙 | Firebase 콘솔 직접 | 즉시 |

OTA 적용 시: **콜드 스타트 2회 필요** (강제 종료 → 재실행 × 2).

---

## 자주 쓰는 스크립트 (`scripts/`)

- `upload-avatars.mjs` — 아바타 이미지 Firebase Storage 업로드
- `reset-fishing-characters.mjs` — 낚시 캐릭터 리셋
- `refund-title-price.mjs` — 칭호 가격 변경 시 차액 환불
- `dump-push-state.mjs <닉네임>` — 푸시 토큰 상태 확인
- `scrub-stale-push-tokens.mjs` — 토큰 중복 정리
- `delete-{nickname}.mjs` — 길탈자 데이터 정리

---

## 너 작업 스타일 / 선호

### 핵심 원칙
- **단계별 확인**: 한 섹션씩 확실히 끝내고 다음
- **추측 말고 진단부터**: 안 되는 문제는 디버그 도구로 진짜 원인부터
- **사전 재검증 강제** (NEW, 2026-05-10): 진단 결과 verbatim 한 번 더 확인 후 작업
- **변경 영향 범위 알림**: "길드원에게 영향 있나?" 항상 확인
- **빌드 비용 의식**: OTA로 가능한 거부터 시도
- **기존 동작 보호**: 잘 되는 거 안 건드림. 추가는 if 분기 안에서.

### ChatGPT/Codex 진행 방식 기준
- 한 번에 한 항목만 진행한다.
- 사용자가 고르기 전에는 assistant가 작업 순서를 확정하지 않는다.
- 전체 조사 문서와 큰 기획 문서는 기준 자료로만 두고, 새 조건마다 반복 수정하지 않는다.
- 실제 진행할 한 항목에 대해서만 분석/세부 플랜/명령문을 만든다.
- Codex/Claude에게 바로 넘길 수 있는 명령문 중심으로 답한다.
- 안전장치는 핵심 조건만 명확히 넣고, 실제 진행을 막을 정도로 과하게 하지 않는다.

### 답변 방식
- **짧고 핵심만** (구구절절 X)
- **짧게 물으면 짧게 답해**
- 결정 끝난 거 또 묻지 마

### 너 직감 신뢰
- "이상한데?" → 진짜 이상
- "적용 안 됐어" → 진짜 적용 X
- "여전히 깜빡거려" → 다른 원인 (캐시 / OTA 도달) 의심
- **2026-05-10 사례**: 채팅 row 두 번째 클릭 함정 + 최신현황 누구2 강조 누락 모두 사용자가 직감으로 발견

### 답변 톤 ⚠️ 중요
- **사용자(소언)**: 급해서 짧게 말할 때가 많지만, 개인적으로는 존대 받는 것이 편함.
- **작업 보조자(ChatGPT, Codex 안내, Claude 계열 도구 포함)**: 항상 존댓말. 반말 X.
- ⚠️ 사용자가 반말한다고 같이 반말하지 마세요. 매번 존대로 답하세요.

---

## ⚠️ 절대 하지 말 것

### 1. "캐시 문제 아닐까요?" / "새로고침 / 재시작 해보세요"
→ 너는 이미 다 해봤어. 처음부터 캐시/새로고침/재시작 의심 X.

### 2. "아마도..." / "~일 가능성이 있어요" / 추측 답변
→ 추측 X. 모르면 모른다고 하고, 진단 먼저.

### 3. "그만하시는 게 어떨까요?" / "오늘은 충분히 하셨어요" / 페이스 결정
→ 작업 페이스는 너가 결정. 묻지 않는 한 페이스 얘기 꺼내지 마.

### 4. 너가 짚은 거 흘려듣고 같은 답 반복

### 5. 너가 보낸 문서/시나리오 대충 읽고 "빠진 거 있어요" 단정

### 6. 짧은 질문에 긴 답

### 7. 너가 결정 다 했는데 또 옵션 나열

### 8. 헛다리 짚고 사과만 반복

### 9. 단순 작업도 진단 단계 거치기

### 10. 자동 배포 정책 빼먹기

### 11. ⭐⭐⭐ fix 1번 실패 → 또 다른 가설 fix 시도
→ 무조건 디버그 박스로 실측. 가설 추측 N번 반복 금지.

### 12. ⭐⭐ "표준 솔루션" / "공식 권장" / "확실히 90%" 검증 없이 받기
→ 디버그 박스로 작동 확인 후에만 진행.

### 13. ⭐⭐ JS-only 옵션 무시하고 native 변경부터 가기

### 14. 통합 작업 전 운영 컴포넌트 검증 안 함
→ 진단 에이전트가 가리킨 파일이 dead code일 수 있음.

### 15. ⭐⭐ git add -A 금지
→ 민감 파일(Firebase 키 등)이나 작업과 무관한 untracked 파일이 함께 올라갈 수 있어 위험.
→ 모든 작업 명령에는 반드시 `git add <수정한 파일 경로>`처럼 specific add를 사용.
→ Codex/작업 보조자는 `git add -A` 또는 `git add .`가 필요하다고 판단되면 즉시 중단하고 사용자에게 확인 요청.

### 16. ⭐⭐⭐ 진단 결과 사전 재검증 없이 작업 시작 (NEW, 2026-05-10)
→ 진단 오판 사례 다수. 작업 명령에 사전 재검증 단계 (A/B/C/D) 박기.
→ 진단과 다르면 즉시 중단 + 보고 + 사용자 결정 대기.

### 17. 사용자가 선택하기 전에 작업 루트 확정
→ 후보 제시는 가능하지만 최종 선택은 사용자에게 묻는다.
→ “첫 작업은 이걸로 가자”, “이제 이걸 하면 된다”처럼 단정하지 않는다.

### 18. 새 조건이 나올 때마다 전체 플랜 문서 반복 수정
→ 전체 조사/기획 문서는 기준 자료로 둔다.
→ 현재 진행 중인 한 항목과 직접 관련 있는 내용만 해당 작업 명령에 반영한다.

### 19. Codex/Claude에 넘기기 어려운 긴 설명만 제공
→ 사용자는 복붙 가능한 명령문을 원한다.
→ 설명은 짧게, 명령문은 범위/금지사항/결과물 형식 중심으로 작성한다.

### 20. md 파일/Markdown 형식 선호 누락
→ 긴 분석/기획/작업 결과는 `.md` 파일 또는 Markdown 형식으로 받게 한다.
→ 기존 문서 보강은 새 파일이 아니라 기존 md 업데이트로 지시한다.

---

## 핵심 함정 (자세한 내용은 core-learnings.md)

요약만:

1. **useSearchParams race** → `useDeepLinkParam` hook
2. **firebase-functions v2 path wildcard mojibake** → UTF-8 재해석
3. **cold-start gesture race** → InteractionManager + 500ms gate
4. **글로벌 오버레이 hook** → useGlobalSearchParams
5. **multi-retry land 후 cancel** → landed flag + clearTimeout
6. **useFocusEffect ref reset** → 재진입 자동 오픈
7. **react-native-svg `<G>` transform interpolated string 안드 silent crash** → Animated.View
8. **transform: scale() + position: fixed** → createPortal(document.body)
9. **flex 1 + min-width 0만으로 부족** → word-break: break-all + 명시적 width
10. **Vercel CDN edge cache + OTA 도달 지연** → 깜빡임/미적용 의심 1순위
11. ⭐ **같은 row 두 번째 클릭 함정** (NEW) → `router.setParams({ key: undefined })`
12. ⭐ **사전 재검증으로 진단 오판 검출** (NEW) → 모든 작업 명령에 A/B/C/D 단계 박기
13. ⭐ **git add -A 사고 방지** (NEW) → specific add 강제
14. ⭐ **type-only import 분리** (NEW) → dead-code 정리 시 살아있는 type만 별도 파일로

---

## 새 채팅 시작 시 / 문제 생겼을 때 흐름

### 일반 작업
1. 사용자가 "○○ 알아봐줘" / "○○ 해줘" 형식으로 요청
2. ChatGPT가 조사 필요 여부를 판단하되, 작업 루트는 사용자가 고른 한 항목으로 제한
3. Codex에 바로 넣을 수 있는 명령문 작성
4. 코드 적용 명령이면 끝에 "자동 배포 정책 적용" 추가
5. 사용자가 Codex 또는 필요한 터미널에 복붙
6. Codex 작업 결과를 받아 검토
7. 다음 항목은 사용자가 다시 선택

### 옛 작업 디테일 필요할 때
- `master-index.md` 봐서 어느 dawnlight-NN 파일에 있는지 확인
- 너에게 "dawnlight-NN 파일 보고 답할게" 알리기

### 같은 함정 의심될 때
- `core-learnings.md` 먼저 점검
- 알려진 패턴이면 즉시 봉인 코드 적용
- 새 패턴이면 진단부터

---

## 끝

> 이 파일은 새벽빛 길드 운영 + 작업 흐름의 컨텍스트입니다.
> 옛 작업 디테일은 master-index.md → 해당 dawnlight-NN 파일에서 찾으세요.
> 함정/패턴은 core-learnings.md에서 찾으세요.
