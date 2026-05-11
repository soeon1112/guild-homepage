# dawnlight-13-part2: Deep-link 4-cycle 회귀 마라톤 + 최종 cleanup + 분배

> **기간**: 2026-05-10 새벽 (compaction 이후 구간)
> **연속**: part1 1-13/1-14에서 디버그 박스 도입 + Fix A/B 부분 호전 직후
> **핵심**: 디버그 박스 캡처 → root cause 진단 → fix → 재캡처 → 새 cycle. 총 4 cycles.

---

## 2-1. [앱][공통] Cycle 1 — id resolve setLoading + setResolvedId reset
**한 줄**: 디버그 박스 첫 캡처 분석 — `lastPhotoRedirectRef`가 [id].tsx stay-mounted 상태에서 stale하게 남아 다른 멤버 알림 시 dedup으로 redirect skip

**관련 파일**:
- `app/(tabs)/members/[id].tsx`
- `app/(tabs)/album/index.tsx`

**배경 (사용자 보고 패턴)**:
- 알림 1 클릭 → 본문 → "← 사진첩으로" → 사진첩 정상 ✅
- 메인 로고 → 메인 ✅
- 다른 알림 클릭 → "존재하지 않는 사진" Alert ❌

**디버그 박스 캡처 핵심 라인**:
```
[ID_PHOTO_EFFECT] entered
{photoParam: "vaKwq...", sectionParam: null, loading: false,
 lastKey: "vaKwq...|Q8gisTktBwFxdLz5J75K"}     ← ⭐ 핵심!
```

**진단 (추측 X, 캡처 증거)**:
1. 첫 알림 클릭 (가성 사진 vaKwq...) → [id].tsx 첫 mount → photoParam useEffect → `lastPhotoRedirectRef.current = "vaKwq...|Q8gis..."`
2. photo 본문 → "← 사진첩으로" → router.replace `/members/1?section=minihome-photos&photo=&comment=`
3. **[id].tsx stay-mounted** (router.replace는 같은 컴포넌트 인스턴스 유지) → `lastPhotoRedirectRef`가 **여전히 "vaKwq...|Q8gis..." 보존**
4. 다른 멤버 알림 클릭 (다른 photoId) → `/members/20?photo=vaKwq...&comment=Q8gis...`
5. [id].tsx의 id param이 "20"으로 바뀜 → resolvedId 재계산 진행
6. **하지만 photoParam이 같은 "vaKwq...|Q8gis..." key**라서 `lastPhotoRedirectRef.current === key` → **dedup 통과 후 redirect SKIP**
7. 또는 dedup이 통과하더라도 **resolvedId 재계산 완료 전에 photoParam useEffect가 trigger** → 잘못된 resolvedId로 photo 페이지 진입
8. photo.tsx mount → `doc(db, "members", "20", "photos", "vaKwq...")` fetch → exists: false → "존재하지 않는 사진" Alert

**핵심**: `lastPhotoRedirectRef`가 [id].tsx stay-mounted 시 reset 안 됨. 다른 멤버 알림이 같은 photoId로 dedup 걸려서 redirect 자체 안 일어나거나, resolvedId race로 잘못된 doc fetch.

**Fix 코드**:
```ts
const lastPhotoRedirectRef = useRef<string | null>(null);
const lastIdRef = useRef<string | null>(null);

// ⭐ id 변경 시 ref reset — stay-mounted [id].tsx에서 다른 멤버 알림 받을 때
//   stale lastKey로 dedup 통과 / stale resolvedId로 redirect 회귀 방지
useEffect(() => {
  if (lastIdRef.current !== id) {
    lastIdRef.current = id;
    lastPhotoRedirectRef.current = null;
    if (isDebugUser) emitDebugLog("[ID_PHOTO_EFFECT]", "id changed, ref reset", { id });
  }
}, [id]);
```

+ photoParam useEffect 안에 추가 가드:
```ts
if (loading) return;
// ⭐ resolvedId가 비어있으면 (재계산 중) skip
if (!resolvedId) return;
```

+ resolvedId 재계산 시 setLoading(true) 명시 + setResolvedId(null) reset

**검증**:
- 디버그 박스 재캡처 — `id changed, ref reset` 로그 확인
- 알림 1 → 본문 → 사진첩 → 알림 2 → 본문 정상 진입 ✅

**commit**: `f18db34` (Cycle 1)

---

## 2-2. [앱][결정] cleanup OTA 1차 시도 → 디버그 박스 재추가 (반복)
**한 줄**: Cycle 1 검증 통과 → 디버그 박스 제거 OTA → 다른 시나리오 회귀 발견 → 재추가

**commits**:
- `2520f83` — cleanup OTA 1차 (디버그 박스 제거)
- `7d937a0`, `4829fc8` — 디버그 박스 재추가 + PHOTOS_SECTION_TAP 추가

**배경**:
- Cycle 1 fix 후 사용자 검증 시나리오 통과
- 성급하게 cleanup OTA 진행
- 그러나 사용자가 새 시나리오에서 다른 회귀 발견 (디테일은 Cycle 2에서)
- → 디버그 박스 재추가

**추가된 호출 사이트 (4829fc8)**:
- `[LOGO_TAP]` — Topbar 로고 탭
- `[WHISPERS_TAP]` — WhispersFeed onPress
- `[NAVIGATE_LINK]` — navigateLink.ts router.push 직전
- `[TAB_RESET]` — members/index의 useTabReset
- `[PHOTOS_SECTION_TAP]` — PhotosSection / PhotosSectionD2 사진 클릭
- `[MEMBERS_PHOTO] params snapshot`, `ALERT not found`
- `[ID_PHOTO_EFFECT] params snapshot`

**학습 강화**:
- ⭐ "사용자가 알린 모든 시나리오 5~10회 반복 검증 후에만 cleanup"
- 이번에도 같은 함정 → 다음부터 "분배 전 시나리오 검증 강제"

---

## 2-3. [앱][공통] Cycle 2 — lastResolvedIdSnapshot ref 가드 (state batch race)
**한 줄**: setState batch 비동기성 함정 — Cycle 1 fix만으론 부족, 동기 가드 필요

**관련 파일**:
- `app/(tabs)/members/[id].tsx`

**배경 (디버그 박스 2차 캡처)**:
- Cycle 1 fix 후에도 일부 케이스 회귀 잔존
- 디버그 박스 캡처:
  - `[ID_PHOTO_EFFECT] id changed, ref reset` 정상 발화 ✅
  - 그런데 곧이어 같은 frame에 `[ID_PHOTO_EFFECT] entered` + `redirecting` → 잘못된 resolvedId

**진단**:
- React state는 **async batch** — `setState` 호출 즉시 값 안 바뀜
- Cycle 1 fix의 `setLoading(true) + setResolvedId(null)`가 batch에 들어가는데
- 같은 frame에 다음 useEffect가 trigger → 그 시점에 resolvedId는 **이전 값** 또는 **null** (배치 미적용)
- 그러면 `if (!resolvedId) return;` 가드 통과/스킵이 의도와 다르게 동작

**핵심 학습**:
> ⭐ **React state batch race**: setState는 async batch, 동기 가드는 useRef로

**Fix 코드 (lastResolvedIdSnapshot ref 가드)**:
```ts
const lastResolvedIdSnapshotRef = useRef<string | null>(null);

// id 변경 감지 useEffect (Cycle 1)
useEffect(() => {
  if (lastIdRef.current !== id) {
    lastIdRef.current = id;
    lastPhotoRedirectRef.current = null;
    // ⭐ 동기 가드 — 다음 photoParam useEffect가 같은 frame에 fire 되도 stale resolvedId 안 씀
    lastResolvedIdSnapshotRef.current = null;
    setLoading(true);
    setResolvedId(null);
  }
}, [id]);

// resolvedId 계산 완료 시 snapshot 갱신
useEffect(() => {
  if (resolvedId) {
    lastResolvedIdSnapshotRef.current = resolvedId;
  }
}, [resolvedId]);

// photoParam useEffect 가드
useEffect(() => {
  if (!photoParam) { lastPhotoRedirectRef.current = null; return; }
  if (sectionParam) return;
  if (loading) return;
  // ⭐ ref 기반 동기 가드 — state batch 무관
  if (!lastResolvedIdSnapshotRef.current) return;
  if (lastResolvedIdSnapshotRef.current !== resolvedId) return;
  ...
}, [photoParam, commentParam, loading, resolvedId, member?.nickname, sectionParam]);
```

**검증**:
- 캡처 재진행 — `lastResolvedIdSnapshot` null인 동안 useEffect entered 후 즉시 return
- 알림 시리즈 시나리오 통과

**commit**: `bea19ff` (Cycle 2)

---

## 2-4. [앱][공통] Cycle 3 — photoId 변경 시 photo state reset
**한 줄**: stay-mounted photo.tsx에서 photoId param 변경 시 이전 photo state(image, comments)가 남아 깜빡거림

**관련 파일**:
- `app/(tabs)/members/photo.tsx`
- `app/(tabs)/album/photo.tsx`

**배경 (디버그 박스 3차 캡처)**:
- Cycle 2 fix 후 redirect 회귀는 사라짐
- 그런데 새 패턴: 알림 1 본문 → ← 사진첩 → 알림 2 본문 진입 시 **이전 사진의 잔상이 0.3초 정도 보임**
- 캡처: `[MEMBERS_PHOTO] mounted` 1회만 — unmount 안 일어남

**진단**:
- expo-router의 nested Stack에서 `[id].tsx` 같은 dynamic route는 **stay-mounted**
- members/photo.tsx도 photoId만 다르고 같은 route면 stay-mounted
- photo state(useState 초기값)는 **한 번만** 평가됨 → photoId 바뀌어도 자동 reset 안 됨
- onSnapshot은 새 doc 구독으로 갱신되지만 그 전까지 이전 photo가 계속 렌더링

**핵심 학습**:
> ⭐ **useState 초기값은 한 번만**: deps 변경해도 자동 reset 안 됨, useEffect 진입 즉시 명시적 reset

**Fix 코드 패턴**:
```ts
const { member, pid } = useLocalSearchParams<{...}>();
const [photo, setPhoto] = useState<Photo | null>(null);
const [comments, setComments] = useState<Comment[]>([]);
const [imgAspectRatio, setImgAspectRatio] = useState<number>(1);
const [videoAspectRatio, setVideoAspectRatio] = useState<number>(1);

// ⭐ photoId 변경 시 모든 photo state reset
useEffect(() => {
  setPhoto(null);
  setComments([]);
  setImgAspectRatio(1);
  setVideoAspectRatio(1);
}, [pid]);

// onSnapshot은 별도 useEffect — pid 변경 시 새 구독
useEffect(() => {
  if (!member || !pid) return;
  const unsub = onSnapshot(doc(db, "members", member, "photos", pid), (snap) => {
    if (snap.exists()) setPhoto({ id: snap.id, ...snap.data() });
    else setPhoto(null);
  });
  return unsub;
}, [member, pid]);
```

album/photo.tsx 동일 패턴.

**검증**:
- 잔상 사라짐 ✅
- 알림 시리즈 시나리오 통과

**commit**: `fed1447` (Cycle 3)

---

## 2-5. [앱][공통] Cycle 4 — usePathname 가드 (최종 해결)
**한 줄**: useGlobalSearchParams가 nested Stack의 stay-mounted route에서 stale value 들고 있음 — Active route 검증으로 가드

**관련 파일**:
- `app/(tabs)/members/[id].tsx`
- `app/(tabs)/album/index.tsx`

**배경 (디버그 박스 4차 캡처 — 최종)**:
- Cycle 3 fix 후 잔상은 사라졌으나 또 다른 패턴 회귀:
  - 사용자가 photo 본문 안에 있는 동안 다른 알림 클릭 시 → photo.tsx가 router.replace로 새 photoId 받아도 [id].tsx의 photoParam useEffect가 동시에 fire되어 이상한 redirect
- 캡처: photo.tsx active일 때 `[ID_PHOTO_EFFECT] entered` 발화 — **[id]는 background인데 useEffect가 실행됨**

**진단**:
- expo-router의 `useGlobalSearchParams<>`는 **현재 어떤 route가 active든 상관없이 전역 URL params를 보여줌**
- nested Stack에서 `[id].tsx`가 stay-mounted된 상태로 photo.tsx가 위에 push됨
- photo.tsx에서 router.replace → URL 변경 → **[id].tsx의 useGlobalSearchParams도 새 값으로 변경됨**
- → background에 있는 [id].tsx의 useEffect가 trigger → stale 환경에서 redirect 시도

**핵심 학습**:
> ⭐ **expo-router stay-mounted route**: nested Stack의 [id].tsx는 unmount 안 됨, useGlobalSearchParams stale value 가능, **Active route 검증은 usePathname() + pathname.startsWith(...) 표준**

**Fix 코드 패턴**:
```ts
import { usePathname } from "expo-router";

export default function MemberDetail() {
  const pathname = usePathname();
  const { id, photo: photoParam, ... } = useGlobalSearchParams<{...}>();
  
  // ⭐ Active route 검증 — [id].tsx가 active일 때만 redirect 처리
  //   photo.tsx 위에 떠 있을 때는 useEffect skip
  const isActive = pathname === `/members/${id}` || pathname?.startsWith(`/members/${id}?`);
  
  useEffect(() => {
    if (!isActive) {
      if (isDebugUser) emitDebugLog("[ID_PHOTO_EFFECT]", "skipped (not active)", { pathname });
      return;
    }
    if (!photoParam) { lastPhotoRedirectRef.current = null; return; }
    if (sectionParam) return;
    if (loading) return;
    if (!lastResolvedIdSnapshotRef.current) return;
    if (lastResolvedIdSnapshotRef.current !== resolvedId) return;
    // ... redirect
  }, [photoParam, commentParam, loading, resolvedId, member?.nickname, sectionParam, isActive, pathname]);
}
```

album/index.tsx 동일 패턴 (`pathname === "/album"` 체크).

**검증** (사용자 시나리오 5회 이상 반복):
1. 알림 1 클릭 → 본문 ✅
2. 메인 로고 → 메인 ✅
3. 다른 알림 → 본문 ✅
4. 본문에서 다른 알림 → 새 본문 ✅
5. ← 사진첩으로 → 사진첩 ✅
6. 사진첩에서 사진 클릭 → 본문 ✅
7. 댓글 deep-link 즉시 mount [120, 500, 1500, 3000] timer 그대로 작동 ✅
8. cold-start 첫 deep-link ✅ (P1 그대로 유효)
9. 앨범 동일 검증 ✅

**commit**: cleanup OTA 포함 (Cycle 4 + 디버그 박스 일부 정리)

---

## 2-6. [앱] 모든 fix 누적 commit 시간순 정리

| # | Commit | 내용 |
|---|--------|------|
| 1 | `34efd78` | 댓글 layout fix |
| 2 | `e496f8b` | uiBus emitTabReset |
| 3 | `672e5fa` | DatePickerModal shared |
| 4 | `5c97dbb` | 새 아이콘 |
| 5 | `e1743f5` | P2 splash + 빌드 commit |
| 6 | `76376ad` | BottomNav fix 1차 |
| 7 | `b151fa4` | BottomNav fix 2차 (nestedState undefined) |
| 8 | `f18db34` | Cycle 1 (id resolve setLoading + setResolvedId reset) |
| 9 | `2520f83` | cleanup OTA 1차 (디버그 박스 제거 — 성급) |
| 10 | `7d937a0` | 디버그 박스 재추가 |
| 11 | `4829fc8` | PHOTOS_SECTION_TAP + WHISPERS_TAP + NAVIGATE_LINK 추가 |
| 12 | `bea19ff` | Cycle 2 (lastResolvedIdSnapshot ref 가드) |
| 13 | `fed1447` | Cycle 3 (photo state reset) |
| 14 | (포함) | Cycle 4 (usePathname 가드) + cleanup OTA 2차 |
| 15 | (최종) | 디버그 박스 완전 제거 OTA |

---

## 2-7. [앱] OTA Update Group IDs (배포 흐름)

### iOS production
- `0256c256-85d8-42af-88d4-116f5388157f`
- `2852fe22-fca2-4e3d-aece-ad515da65c67`
- `5986df6a-b35a-4401-9192-4ebc0f6a05fc`
- (Cycle 4 최종 cleanup 포함)

### Android preview
- `84a9874e-cd51-469c-8a7b-6be97867c82e`
- `db3c7fdb-44fa-40f7-b4c6-6ed694f4e050`
- `7ed93b89-94f9-4bb7-b72f-bf2ba4a66a24`
- (Cycle 4 최종 cleanup 포함)

---

## 2-8. [앱] 빌드 #10 + 분배 (재확인)

**빌드 결과**:
- iOS Build #10: `dd397e25-144a-49e5-95bb-6f6df39cda7a`
  - IPA: https://expo.dev/artifacts/eas/tjqVGpP1aUPpjmyeAhygdE.ipa
- Android preview: `d833a747-053b-4985-8e73-41d081e9ffac`
- Commit: `e1743f5` (P2 splash 빌드 시점)

**분배**:
- TestFlight 자동 업로드 (iOS production 채널 정책)
- Android preview 채널 자동 분배
- 길드원에게 OTA 4-cycle 모두 적용 후 최종 cleanup OTA 분배

**최종 검증 결과** (사용자 보고):
- ✅ 알림 시리즈 5+회 시나리오 모두 통과
- ✅ "← 사진첩으로" / "← 앨범으로" 정상
- ✅ cold-start 첫 deep-link 정상
- ✅ splash 새 디자인 적용 (cream 배경 + cosmic 별 — 색상 일관)
- ✅ 댓글 deep-link 즉시 mount [120, 500, 1500, 3000] timer 정상
- ✅ photo state reset 잔상 없음

---

## 2-9. [공통] BackLinkDebugBox 디버그 인프라 (최종 정리)

**위치**: `src/components/_debug/BackLinkDebugBox.tsx`
**API**: `src/lib/uiBus.ts`의 `emitDebugLog` / `useDebugLog` / `clearDebugLog`
**사용자 한정 가드**: `loginNick === "언쏘"` (다른 길드원 영향 0)

**전체 호출 사이트 (이번 마라톤 누적)**:
- `members/photo.tsx`: mount/unmount/fetch result/onPress/router.replace called/params snapshot/ALERT not found
- `album/photo.tsx`: 동일
- `members/[id].tsx`: photoParam useEffect entered/redirecting/skipped/id changed ref reset/skipped (not active)
- `members/[id].tsx`: sectionParam useEffect entered/scrolling
- `album/index.tsx`: photoParam useEffect entered/redirecting
- `Topbar.tsx`: LOGO_TAP
- `WhispersFeed.tsx`: WHISPERS_TAP
- `navigateLink.ts`: NAVIGATE_LINK pushing
- `members/index.tsx`: TAB_RESET
- `PhotosSection.tsx` / `PhotosSectionD2.tsx`: PHOTOS_SECTION_TAP

**최종 cleanup OTA**:
- 모든 emitDebugLog 호출 제거 (production code 깔끔)
- `BackLinkDebugBox.tsx` 컴포넌트 자체 제거
- uiBus의 emitDebugLog/useDebugLog/clearDebugLog 함수도 제거 (uiBus는 emitTabReset 등 다른 용도로 유지)
- → 다음 회귀 발견 시 다시 도입 가능 (인프라 패턴 학습 완료)

---

## ⭐ part2 핵심 학습 (다음 채팅 함정 회피)

### 1. React state batch race
- `setState`는 async batch — 호출 즉시 값 안 바뀜
- 같은 frame의 useEffect가 trigger 시 stale value 가능
- **동기 가드는 useRef로** — `lastResolvedIdSnapshotRef.current` 패턴
- state는 React 렌더링용, 동기 비교용은 ref

### 2. useState 초기값 함정
- 초기값은 **한 번만** 평가됨 (마운트 시)
- deps 변경해도 자동 reset 안 됨
- stay-mounted route + dynamic param 변경 시 명시적 reset useEffect 필요
- 패턴: `useEffect(() => { setX(initialX); setY(initialY); }, [param])`

### 3. expo-router stay-mounted route + useGlobalSearchParams
- nested Stack의 [id].tsx는 unmount 안 됨 (stay-mounted)
- useGlobalSearchParams는 **현재 active route 무관**하게 전역 URL params 반환
- → background route의 useEffect가 stale 환경에서 trigger
- **Active route 검증 표준**:
  ```ts
  const pathname = usePathname();
  const isActive = pathname === `/members/${id}` || pathname?.startsWith(`/members/${id}?`);
  if (!isActive) return;
  ```

### 4. 디버그 박스 우선
- 추측 5번 후 진단 = 시간 낭비
- **가설 1번 실패 시 즉시 디버그 인프라**
- 화면 디버그 박스 + 사용자 한정 가드 → 안전한 production 디버깅

### 5. 사용자 발견 시나리오는 정확함
- "알림 1 정상, 알림 2 실패" 같은 패턴은 그대로 재현
- 사용자가 잘못 본 게 아니라 진짜 race임
- 디버그 박스 캡처로 시점 확정

### 6. 빌드 vs OTA 구분 재확인
- Native (icon, splash, native dep) → 빌드
- JS → OTA
- 누적 변경 묶어서 한 번에 빌드

### 7. 분배 전 시나리오 5~10회 반복 검증 강제
- "한 시나리오 통과 = fix 완료" 함정 (Cycle 1 cleanup OTA 성급)
- 사용자가 알린 모든 시나리오 다 검증
- 다음부터 검증 스크립트화 권고

---

## 빠뜨리면 안 되는 메모 (다음 채팅 인계용)

### URL 형식 (functions/triggers/web 변경 X 유지)
- 앨범: `/album?photo=<id>&comment=<id>`
- 미니홈피: `/members/<nick>?photo=<id>&comment=<id>`

### 본문 페이지 헤더 (← backLink 패턴)
- 게시판 → "← 게시판으로"
- 앨범 → "← 앨범으로"
- 미니홈피 사진 → "← 사진첩으로"

### 박스 색상 절대 보존
- 앨범 본문/댓글: sky blue `rgba(205,216,224,0.65)`
- 미니홈피 본문/댓글: cream `rgba(240,228,204,0.95)` + border `rgba(92,58,31,0.25)`

### 댓글 deep-link 4-단계 timer (절대 변경 X)
- `[120, 500, 1500, 3000]` ms — InteractionManager.runAfterInteractions 후
- handledRef + landed guard

### 정렬 절대 변경 X
- album: photoSortKey (photoDate 우선)
- comments: createdAt asc
- photos onSnapshot: createdAt desc

### Letter sub
- "PAPER PLANE" 그대로

---

## PENDING — 다음 채팅 작업

### ⭐ 최우선: @닉네임 멘션 알림 작업
- 새 채팅 첫 작업
- 푸시 알림 + 댓글 + deep-link 모두 건드림 → part1+part2 학습 인계 필수
- 인계 위치 확인 필요: master-index.md에서 dawnlight-12-part2 또는 dawnlight-12-part3 참조

### Step 6 dead code 정리 (OTA 가능)
- KeyboardDebugBox (이번 마라톤 도구 — 위 BackLinkDebugBox와 별개로 키보드 진단용 잔재)
- AlbumPhotoViewer / MinihomePhotoViewer 안의 PhotoViewerModal 함수 (페이지화 후 dead)
- AuthModal.tsx (로그인 페이지화 후 dead)
- CharacterForm.tsx 849줄 (캐릭터 추가/수정 페이지화 후 dead)
- modalKeyboard.ts liftSv (Phase 12 lift 시도 잔재)
- BackLinkDebugBox 자체 (이번 마라톤 도구) — cleanup OTA 마지막 단계에 이미 일부 제거, 잔여 정리

### master-index.md 갱신
- dawnlight-13-part1.md (이 분할 작업)
- dawnlight-13-part2.md (이 분할 작업)
- 카테고리: 페이지화 후속 + deep-link 회귀 마라톤

### 미래 알람 (놓치면 큰일)
- ⏰ Firestore 보안 규칙 만료: **2027-05-01** — 1년 전 알람 필요
- ⏰ TestFlight 빌드 90일 만료 — 빌드 #10이 ~2026-08-08 만료
- ⏰ Apple 인증서 갱신 (별도 추적)

---

**part2 끝 — 새 채팅에서 멘션 알림 작업 시작 시 master-index 통해 dawnlight-13-part1 + part2 둘 다 참조 권장**
