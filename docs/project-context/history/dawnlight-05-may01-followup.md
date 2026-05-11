# 새벽빛 길드 — 05. 5/1 오후 후속 작업 (chat5)

> **작업 일자**: 2026-05-01 오후
> **주요 내용**: 앱 WebView 404 진단/해결 + 로딩 화면 디자인 + 칭호/환전/낮밤/STAR 작업
> **핵심 학습**: "추측 말고 진단부터" 원칙으로 5번 시도 후 진짜 원인 발견한 사례

---

## 1. 앱 WebView 404 진단 및 해결 (5번 시도 후 발견한 진짜 원인)

### 1-1. 배경

- chat4에서 5번 다른 방식으로 WebView 적용 시도 (Modal, View, preload, Animated.View, 별도 route) → 모두 실패
- 증상: 첫 클릭 → "낚시터 불러오는 중" → 메인 복귀 → 두 번째 클릭에서만 정상 실행
- 모든 이전 시도는 **추측 기반** ("Modal 문제? zIndex 문제? preload하면 될까?")
- 추측마다 코드 수정 → 빌드(20분) → 안 됨 → 다른 추측 → 무한 반복

### 1-2. 진단 시작

**원칙: 추측 말고 진단부터.**

- "지금 진짜 무슨 일이 일어나는지" 먼저 확인하기로 결정
- logcat 직접 못 보는 환경이라 → **화면에 디버그 박스 추가** 방식 사용

### 1-3. 디버그 코드 (재사용용으로 보존)

```tsx
// app/fishing.tsx (디버그 버전)
import { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, BackHandler, Alert, Text, TouchableOpacity } from "react-native";
import { WebView } from "react-native-webview";

export default function FishingScreen() {
  const mountedAt = useRef(Date.now());
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const elapsed = Date.now() - mountedAt.current;
    const line = `[${elapsed}ms] ${msg}`;
    console.log(line);
    setLogs((prev) => [...prev, line]);
  };

  useEffect(() => {
    addLog("화면 마운트됨");
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      addLog("뒤로가기 버튼 감지됨");
      return false;
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <WebView
        source={{ uri: "https://dawnlight-guild.vercel.app/fishing" }}
        onLoadStart={() => addLog("WebView 로딩 시작")}
        onLoadEnd={() => addLog("WebView 로딩 끝")}
        onHttpError={(e) => addLog("HTTP 에러: " + e.nativeEvent.statusCode)}
        onRenderProcessGone={(e) => addLog("⚠️ 렌더 프로세스 죽음")}
        onContentProcessDidTerminate={(e) => addLog("⚠️ 컨텐츠 프로세스 종료")}
        // ... 기타 옵션
      />
      {/* 화면 위에 디버그 로그 오버레이 */}
      <View style={{
        position: "absolute", top: 40, left: 10, right: 10,
        backgroundColor: "rgba(0,0,0,0.85)", padding: 10,
        borderRadius: 8, maxHeight: 300, zIndex: 99999,
      }}>
        <Text style={{ color: "#0f0", fontSize: 11, fontWeight: "bold" }}>
          🐛 디버그 로그
        </Text>
        {logs.map((log, i) => (
          <Text key={i} style={{ color: "#fff", fontSize: 10 }}>{log}</Text>
        ))}
      </View>
    </View>
  );
}
```

### 1-4. 진단 결과

빌드 후 폰에서 캡처한 로그:
```
[13ms] 화면 마운트됨
[412ms] HTTP 에러: 404   ← 🚨 진짜 원인
[437ms] WebView 로딩 시작
[1490ms] WebView 로딩 끝
```

화면에 표시된 내용: **"404 This page could not be found"**

### 1-5. 진짜 원인

- WebView가 `https://dawnlight-guild.vercel.app/fishing` 로 접근
- 그런데 홈페이지에 `/fishing` 라우트가 **존재하지 않음**
- FishingGame은 라우트가 아니라 모달 컴포넌트 (펫 아이콘 → 낚시하기 클릭으로만 열림)
- 그래서 직접 URL 접근하면 Vercel 404 페이지가 떴고, 이게 화면 깜빡임 유발
- **5번 시도 동안 zIndex/Modal/View 같은 RN 쪽 문제로 추측했지만, 실제로는 홈페이지 쪽 라우트 부재 문제**

### 1-6. 해결: 홈페이지에 `/fishing` 라우트 추가

**1. 신규 파일**: `app/fishing/page.tsx` (12줄)
- 메인 페이지(`app/page.tsx`) 그대로 re-export
- 배경/네비/FloatingPet 그대로 살아있음

**2. 수정 파일**: `app/components/redesign/FloatingPet.tsx` (+24줄)
- `usePathname` 훅 추가
- useEffect로 `pathname === "/fishing"`이면 fishingOpen=true 자동 세팅 (1회만)
- FishingGame onClose: `/fishing` 라우트면 `router.replace("/")`로 URL 정리

**3. 다른 페이지 영향: 0** (분기가 `/fishing` 경로에서만 실행됨)

### 1-7. 앱 코드 정리

`app/fishing.tsx`를 production 버전으로 재작성:
- 디버그 로그 박스 제거
- 핵심 옵션 유지: `androidLayerType="hardware"`, `setSupportMultipleWindows={false}`, `cacheEnabled`
- `injectedJavaScriptBeforeContentLoaded`로 닉네임 localStorage 주입 필수 (없으면 앱에서 비로그인으로 인식해서 모달 안 뜸)
- `Stack.Screen options={{ headerShown: false }}` 유지 (없으면 expo-router 기본 헤더 뜸)
- `useAuth()` 호출 (닉네임 주입용)
- 에러 핸들러는 console.warn으로 남겨둠 (향후 logcat 진단 가능하게)
- BACK_GUARD_MS 5초 BackHandler 가드는 안 넣음 (옛날 추측 기반 코드, 진짜 원인이 404였으니 불필요)

### 1-8. 결과

- **첫 클릭에 메인 복귀 안 함** ✓
- **첫 클릭에 게임 정상 실행** ✓

### 1-9. 핵심 교훈 (새 Claude 필독)

1. **증상이 헷갈려도 진단부터.** 메인 복귀처럼 보였던 게 사실은 404 페이지 잠깐 떴던 거였음. 추측은 그럴듯해 보여도 실제 원인을 못 찾음.

2. **클로드들이 처음부터 진단 안 시킨 게 문제.** 5번 시도 다 추측 → 코드 수정 → 빌드 → 안 됨의 반복. 첫 시도 때 디버그를 했어야 했음.

3. **간단한 진단 도구가 유용.** logcat 직접 못 봐도 화면 위 오버레이 + 시간 로그만으로 진짜 원인 파악 가능.

4. **함정에 빠진 추측의 흔한 형태:**
   - "WebView가 원래 까다롭다" → 일반론에 갇힘
   - "Modal/zIndex 문제" → RN 쪽 흔한 함정에 매몰
   - **너 케이스가 진짜 그건지 확인 안 함**

5. **새 클로드에게**: "안 되는데 왜 안 되는지 모르겠다"는 길마 말이 나오면, 추측 모드 들어가지 말고 **"먼저 디버그 도구로 진짜 원인부터 찾자"**고 받아치기. 위 디버그 코드 패턴 그대로 다른 화면에도 적용 가능.

---

## 2. 로딩 화면 우주 테마 디자인 ("별빛 부두로...")

### 2-1. 배경

- 검은 배경 + 흰 글씨 "낚시터 불러오는 중"이 너무 거슬림
- 메인 우주 테마와 일체감 없음
- 펫키우기는 화면 전환 없이 자연스러움 → 낚시도 비슷하게 만들고 싶음

### 2-2. 디자인 미리보기 패턴 (재사용 가능)

**핵심 발견**: 빌드 부담 없이 디자인 마음껏 조정하는 방법

1. 홈페이지에 `app/fishing-loading-preview/page.tsx` 임시 미리보기 페이지 만듦
2. 폰 크롬에서 `dawnlight-guild.vercel.app/fishing-loading-preview` 열어 확인
3. 마음에 안 드는 부분 한 줄 명령으로 수정 → git push → 1분 후 폰에서 재확인
4. 만족할 때까지 반복 (빌드 0번)
5. 디자인 확정 후 앱 코드(`app/fishing.tsx`)에 이식 → 빌드 1번

**효과**: 수정 5번 = 빌드 5번 = 100분 → 수정 5번 = 1분×5 + 빌드 1번 = 25분

### 2-3. 최종 디자인

- **배경**: 우주 그라데이션 (#0B0821 → #1A0F3D)
- **별 9개**: 정적 + 부드러운 깜빡임 애니메이션 (RN Animated API)
  - 처음엔 정적이었으나 길마 직감 — "메인이랑 일체된 느낌" — 따라서 깜빡임 추가
  - 단, "정신없으면 안 됨" 원칙. 천천히 부드럽게 (3~5초 사이클, opacity 0.4~1.0)
- **가운데 글래스 카드**:
  - 반투명 보라/핑크 그라데이션
  - CardNebula 컴포넌트(기존) 재사용
  - 둥근 모서리, 보라/핑크 glow 그림자
- **카드 안 콘텐츠**:
  - ✦ SVG 아이콘
  - "별빛 부두로..." (Noto Serif KR, stardust cream #FFE5C4)
  - cosmic-pink ActivityIndicator (#D896C8)

### 2-4. 태블릿 호환 이슈

**문제 1**: 안드 태블릿에서 카드 비율 깨짐 + layout 점프 (1~2초 후 재배치)

**원인**: flex 측정 chain 지연. 첫 frame에 0×0으로 잡혔다가 다음 cycle에 풀크기로 점프. useSafeAreaInsets도 첫 frame에 0 반환.

**해결**:
- `useWindowDimensions()` 도입 → 첫 frame부터 정확한 width/height
- `Math.max(insets.top, Platform.OS === "android" ? 28 : 0)` insets fallback
- 카드 width 산술 계산: `Math.min(Math.max(width * 0.75, 240), 360)`
- 카드 absolute positioning + insets-aware 명시 박스 안에서 중앙 정렬

**문제 2**: 안드 태블릿에서 카드 표면 줄무늬(banding)

**원인**: LinearGradient + 반투명 overlay 여러 겹 겹침 → 안드 일부 기기에서 8-bit 색 깊이 한계로 banding

**해결**: 카드 그라데이션 단순화 (글래스 효과 일부 포기). 아이폰은 글래스 살아있음, 안드 태블릿은 단색 톤다운으로 깨끗함.

### 2-5. 미리보기 페이지 보존

- `app/fishing-loading-preview/page.tsx`는 삭제하지 않고 보존
- 다음에 디자인 조정할 때 재사용 가능

---

## 3. EAS OTA 일시 장애 + 회복 경험

### 3-1. 상황

- 로딩 화면 디자인 작업 후 OTA 배포 시도 → SDK 54 publish 거부
- 에러: "sdkVersion 54.0.0 is not supported"
- 직전엔 같은 환경에서 OTA 성공 → 본인 프로젝트 문제 X

### 3-2. 진단

- status.expo.dev 확인: 전체 시스템 Operational
- 단, "Expo Application Services 99.89% uptime" 그래프에 노란/주황 바 있음 (부분 장애 흔적)
- 4월 30일 비슷한 GraphQL 엔드포인트 장애 사례 있음

### 3-3. 해결

- 30분~1시간 후 재시도 → **정상 작동**
- 일시 장애였음

### 3-4. 함정 회피 (학습)

- 추측으로 빌드 또 돌리는 대신 시간 두고 기다림
- 빌드 1회 (20분) 절약
- **EAS OTA가 거절돼도 영영 막힌 게 아님.** status 페이지 확인하고 시간 두면 풀릴 가능성 높음.

---

## 4. 칭호 단어 추가

### 4-1. 추가 내용

- 뒤단어 **"자"**, **"나"** 추가
- 가격: 4별빛 (보통 등급)
- 매월 리셋 시스템 그대로 유지 (임대 형식)

### 4-2. 처리 방식

- titleWords 컬렉션에 데이터 추가
- 상점 진열 코드 자동 반영 (코드 수정 불필요한 구조)
- 빌드 X, OTA X (Firestore 데이터만 추가)

---

## 5. 환전 시스템 통째로 제거

### 5-1. 이유

- 길마가 환전 시스템 운영 중단 결정

### 5-2. 삭제 범위

**홈페이지**:
- MY 페이지의 캐시 환전 신청 UI
- 환전 처리 로직 (handleExchange, EXCHANGE_COST 등)
- 관리자 페이지 `/admin/exchange`
- 메뉴/네비게이션 진입점

**앱**:
- `app/mypage.tsx`의 환전 신청 UI 블록 (exchangeBlock/exchangeBtn/exchangeBtnGradient 등)
- handleExchange 콜백 + EXCHANGE_COST + requesting/message state
- 관련 imports (Alert, LinearGradient, useCallback, addDoc, serverTimestamp, increment, setDoc)
- 관련 styles (exchangeBlock, exchangeBtn, exchangeBtnGradient, exchangeBtnText, exchangeHint, exchangeMsg)

### 5-3. 유지

- 포인트 시스템 자체는 살아있음
- users.points 필드, 적립/사용 로직 모두 유지
- 칭호/아바타/펫/낚시에서 계속 사용

### 5-4. 데이터 보존

- 기존 환전 신청 Firestore 데이터는 삭제하지 않음 (코드만 제거)

### 5-5. 배포

- 홈페이지 git push
- 앱 4채널 OTA 모두 동기화 (preview/production × android/ios)

### 5-6. 함정 발견

- 처음에 홈페이지만 처리되고 앱은 누락됐음 → 길마가 짚어줘서 앱도 처리
- **교훈**: 홈페이지/앱 둘 다 있는 기능은 명시적으로 양쪽 다 시켜야 함

---

## 6. 낚시 게임 낮/밤 사이클

### 6-1. 사이클 설정

- **낮 30분 / 밤 5분** (총 35분 1사이클)
- 동기화: **절대 시간(Date.now()) 기반 modulo 계산**
- Firestore 사용 X (절대 시간이라 자동 일치)
- 모든 클라이언트가 누가 언제 접속하든 같은 phase 봄
- 페이지 새로고침해도 동일 시간대 이어짐

### 6-2. 상수

```typescript
const DAY_DURATION_MS = 30 * 60 * 1000;   // 30분
const NIGHT_DURATION_MS = 5 * 60 * 1000;  // 5분
const CYCLE_DURATION_MS = 35 * 60 * 1000; // 35분
const PHASE_FADE_MS = 1500;                // 1.5초 fade

// 사용 예
const phase = Math.floor(Date.now() / 1000) % (35 * 60);
const isNight = phase >= 30 * 60;
```

### 6-3. 밤 시각 효과

- **어두운 파란 오버레이**: rgba(8,12,48, intensity*0.5) — 살짝 진한 톤
- **횃불 글로우 강화**:
  - 현재 횃불 프레임 애니메이션은 그대로 유지
  - 밤에만 횃불 위치(TORCH_POSITIONS)에 주황/노랑 radial glow
  - `globalCompositeOperation = "lighter"`로 어둠을 뚫음
  - 횃불 frame index에 맞춰 glow radius 미세 펄스 (±8%)
- **다른 광원**: 가게 창문 등은 자동 처리. 인도어(상점) scene은 밤 오버레이 미적용 (실내라 의도적)
- **fade**: 1.5초 부드럽게 전환 (깜빡 X)

### 6-4. 낚시 확률

- **낮**: 채집물 55% / 물고기 45% (기존 그대로)
- **밤**: 채집물 45% / 물고기 55% (물고기 잘 잡힘)
- 등급별 확률(70/18/8/3/1)은 낮/밤 동일

### 6-5. 디버그 토글 (언쏘 전용)

- **위치**: 게임 viewport 우상단 26×26 원형 버튼
- **3-state 순환**: 🌗 자동 / ☀ 낮 강제 / 🌙 밤 강제
- **로컬 한정**: 본인 화면만 강제 전환. 다른 유저는 시간 기반 phase 그대로.
- **Firestore 동기화 X**: React state로만 관리. 새로고침하면 자동 모드로 돌아옴.
- 펫 디버그 패턴(PET_DEBUG_ADMIN_NICKNAME = "언쏘")과 동일

### 6-6. 첫 시도 버그

- 초기 구현에서 디버그 토글이 동작 안 함
- 원인: debugPhase override가 실제 렌더 로직에 안 연결돼있었음
- 한 번 더 시켜서 수정

### 6-7. 변경 파일

- `src/lib/fishingData.ts` (+59줄) — day/night constants, getCurrentPhase, getNightIntensity
- `app/components/redesign/FishingGame.tsx` (+145줄) — phase tick, canvas 오버레이, torch glow, 디버그 토글

### 6-8. 시간대 표시 UI

- 추가 안 함 (자연스러운 시각 변화로 충분, 길마 결정)

---

## 7. STAR OF THE DAY 알고리즘 버그 수정

### 7-1. 증상

- "매일 새로운 동료" 카드가 사실은 매일 같은 사람만 도는 느낌
- 길마 직감이 정확했음

### 7-2. 진단 결과 (확실한 버그)

```javascript
// 기존 시드 알고리즘 (사실상 선형)
const base = y*10000 + m*100 + d;
let h = base;
h = ((h << 5) - h + base) | 0;             // = base * 32
h = (h * 9301 + 49297) & 0x7fffffff;
return Math.abs(h);
```

- 같은 달 안에서 base가 매일 +1 증가
- seed는 매일 정확히 +297632 (= 32×9301) 증가하는 거의 선형 수열
- gcd(297632, poolSize)가 1 아니면 사이클이 짜그라듬

**시뮬레이션 결과**:
| Pool | 30일 동안 등장한 idx | 비고 |
|------|---------------------|------|
| 8 | idx=1만 30회 | 매일 같은 사람 |
| 10 | 5,7,9,1,3 (5종류) | 짝수 idx 영원히 안 뽑힘 |
| 20 | 5,17,9,1,13 (4종류) | 16명 영원히 안 뽑힘 |
| 50 | 약 25종류 | 절반은 안 뽑힘 |

### 7-3. 수정 알고리즘 (Fisher-Yates 셔플)

```javascript
// KST 기준 day number → fnv1a 해시 → mulberry32 PRNG → Fisher-Yates 셔플
function pickStarIndex(poolSize, dayNumber) {
  const cycle = Math.floor(dayNumber / poolSize);
  const pos = dayNumber % poolSize;
  const seed = fnv1a(`star-of-day:${cycle}`);
  const rng = mulberry32(seed);
  
  const indices = Array.from({ length: poolSize }, (_, i) => i);
  // Fisher-Yates shuffle
  for (let i = poolSize - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  
  return indices[pos];
}
```

**핵심**:
- KST 기준 day number 산출 (timezone 무관, 모든 디바이스 같은 결과)
- 풀 사이즈 = N이면 N일 사이클 (사이클 안에 모든 멤버 한 번씩)
- 새 사이클마다 새 시드로 셔플 → 사이클 안에서 중복 0
- 풀 사이즈 변동(가입/길탈) 시 자동 적응

### 7-4. 검증 (시뮬레이션)

| 풀 사이즈 | 사이클당 고유성 | 사이클 간 셔플 순서 |
|----------|---------------|-------------------|
| 24 | 24/24 ✓ × 3 | 모두 다름 ✓ |
| 25 | 25/25 ✓ × 3 | 모두 다름 ✓ |
| 23 | 23/23 ✓ × 3 | 모두 다름 ✓ |

10사이클 공정성: 각 멤버 hit 수 = 10 ± 1 (거의 균등)

### 7-5. 후보 풀

- members 컬렉션, 빛나는 별만 (미니홈피 프로필 등록한 사람)
- 잠든 별 미포함 (프로필 정보 부족하면 카드 비어 보임)
- 현재 풀 사이즈 약 24명

### 7-6. 변경 파일

- `dawnlight-app/src/components/StarOfDay.tsx` (+56/-12줄)
- `guild-homepage/app/components/redesign/StarOfDay.tsx` (+51/-15줄)

### 7-7. 배포

- 홈페이지 push + 앱 4채널 OTA 모두 성공

### 7-8. 핵심 학습

- **길마 직감("매일 같은 사람 같은데?")이 정확했음**. 검증해보니 진짜 버그.
- 시뮬레이션으로 검증한 후 수정하면 같은 함정 안 빠짐.

---

## 8. 낚시 찌(bobber) 낚시대별 차별화 검증

### 8-1. 상황

- 길마가 다른 유저 찌가 다 같은 색으로 보인다고 의심

### 8-2. 진단 결과 (버그 아님)

**자산**:
- bobber.png는 128×32 sprite sheet (16×16 셀 8개 = 4종 × 2개)
- 위치: `guild-homepage/public/images/fishing/Character_assets/separate/fish/tool/bobber.png`
- 같은 폴더에 fishingrod_blue/brown/pink + fishingrod(default) 4종

**매핑** (`src/lib/fishingData.ts`):
```typescript
export const ROD_TYPES = ["default", "blue", "brown", "pink"] as const;
export const ROD_BOBBER_PAIRS: Record<RodType, readonly [number, number]> = {
  default: [0, 1],
  blue:    [2, 3],
  brown:   [4, 5],
  pink:    [6, 7],
};
```
- pair[0]은 현재 사용 셀, pair[1]은 미래 "bobber 교체" 기능용 예약

**본인 (drawBobberAndLine)**:
```typescript
const rodPair = ROD_BOBBER_PAIRS[characterConfig.rodType];
const bobberIdx = rodPair ? rodPair[0] : BOBBER_INDEX;
```

**다른 유저 (drawPeerBobberAndLine)**:
- 인자로 rodType 받아 self와 동일한 룩업 사용
- peer.character.rodType 그대로 전달

### 8-3. 실제 원인 (시각적 동일)

- production 데이터 dump 결과: 길드원 13명 중 9명이 default rodType (낚시대 안 바꿈)
- 길마(언쏘)도 default
- 동접한 유저 중 default가 아닌 사람: Annakiria(blue), 권쏠든(pink), 육월야(blue), 트리앤(blue) 4명
- 이 4명이 동시 낚시 중일 때만 다른 색 보임

### 8-4. 결론

- **코드 수정 불필요**. sync 정상.
- 길마가 본인 rodType을 다른 색으로 바꿔서 검증하면 됨.

---

## 9. 작업 일지 통합본 작성

### 9-1. 배경

- 4개 채팅 분량 작업 일지(chat1~4)를 새 Claude 대화에 빠르게 인계할 수 있도록 정리

### 9-2. 시행착오

- **첫 시도**: 1개 파일에 모든 내용 통합 → 길이 제약으로 작업 중 끊김
- **둘째 시도**: 길마가 "너무 줄였다" 지적 → 다시 살림
- **셋째 시도 (최종)**: 시기/주제별로 7개 파일로 분리, 진짜 삭제해도 되는 것만 빼고 다 살림

### 9-3. 최종 구조

- `dawnlight-00-overview.md` — 빠른 참조 (페이지 매핑, 컬렉션, 함정)
- `dawnlight-01-homepage-foundation.md` — chat1 (홈페이지 첫 구축)
- `dawnlight-02-cosmic-renewal.md` — chat2 (우주 테마 리뉴얼)
- `dawnlight-03-app-pet.md` — chat3 (앱 + 펫)
- `dawnlight-04-fishing-game.md` — chat4 (낚시 게임)
- `dawnlight-05-may01-followup.md` — chat5 (5/1 오후 작업, 이 파일)
- `dawnlight-06-future-notes.md` — 미래 알람 (Firestore 갱신 등)

### 9-4. 학습

- 한 파일에 너무 많이 넣으면 작업 중 끊김 발생
- 적절히 분리하면 작업/검토/유지보수 모두 편함

---

## 핵심 학습 (chat5 종합)

### 1. "추측 말고 진단부터" (1번 사례)
- 5번 시도 후 디버그 도구로 진짜 원인 찾음
- 다음에 비슷한 상황: 디버그 박스 패턴 그대로 재사용

### 2. "미리보기 패턴" (2번 사례)
- 디자인 작업은 홈페이지 미리보기 페이지로 빌드 0번 가능
- 임시 페이지 보존해두면 재사용

### 3. "EAS OTA 일시 장애 인내" (3번 사례)
- 거절돼도 시간 두고 재시도하면 풀림
- 추측 빌드보다 status 페이지 확인 우선

### 4. "홈페이지/앱 양쪽 명시" (5번 사례)
- 둘 다 있는 기능은 명시적으로 둘 다 시켜야 함
- 한쪽만 처리되는 경우 흔함

### 5. "OTA 4채널 동기화 기본" (5번 사례)
- 안드 1채널만 보내면 iOS 길드원 옛날 버전
- 길마가 매번 짚지 않아도 되게 자동으로 4채널

### 6. "길마 직감 신뢰" (7번 사례)
- 길마가 "이상한데?" 하면 검증해볼 가치 있음
- 검증 시뮬레이션으로 의심 사실 확인 가능

### 7. "검증 먼저, 수정 나중" (8번 사례)
- 의심된다고 무작정 고치면 안 됨
- 진단 → 실제 데이터 확인 → 그게 버그인지 시각적 한계인지 판단
