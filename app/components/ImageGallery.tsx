"use client";

// 사진 묶음(카톡 스타일 그리드) — Phase 3. imageUrls 배열(최대 4장,
// Phase 1 MAX_IMAGES_PER_MESSAGE)을 카톡과 동일한 1/2/3/4장 레이아웃으로
// 렌더. 사용처: NewHomeChat.tsx / FloatingChat.tsx(redesign) / app/dm/
// [roomId]/page.tsx — 전부 이 컴포넌트를 import만(신규 파일이라 "채팅
// 시스템 미접촉" 대상 아님, 그 3개 파일에 새 렌더 분기 한 줄씩만 추가).
//
// 클릭 시 확대는 신규 뷰어를 안 만들고 각 호출부가 이미 갖고 있는(또는
// 이 Phase에서 최소로 추가한) 단일 이미지 뷰어를 그대로 재사용(Phase 3
// 방침 — 배열 전체 스와이프는 Phase 4). 그래서 이 컴포넌트는 클릭 시
// 어떤 뷰어를 열지 모르고, onImageClick(index)만 위로 올려보낸다.
//
// CLS 방지 — 실측 크기를 모르는 <img>는 로드 완료 시 reflow가 나므로,
// CommentImage.tsx의 reserveBox(aspectRatio 고정 박스) 관례를 그대로
// 따라 각 셀에 width/aspectRatio를 미리 박아둔다.
//
// ── "사진 그리드 위 다음 메시지 겹침" 버그 방어 (재진단, 코드만으로는
// 라이브 DOM 증거를 못 구해 원인 하나를 확정하지 못했다 — 아래 여러
// 후보를 동시에 방어하는 레이어를 쌓았다) ──
// 1) 2장 케이스만 컨테이너 자체 height/aspect-ratio가 없어 grid-auto-
//    rows가 Cell의 aspect-ratio로 역산(bottom-up)하던 것 — 지난 라운드
//    fix. 그런데 1/3/4장(원래도 컨테이너에 aspect-ratio 직접 지정,
//    top-down)도 겹침이 재현된다는 신고가 있어, 이것만으로는 전체 설명이
//    안 됨 — 아래 레이어들을 추가로 방어.
// 2) 이 레포 globals.css는 @layer 블록이 전혀 없어(grep 확인) 그 안의
//    모든 규칙이 unlayered다 — Tailwind 유틸리티(className="grid" 등)는
//    Tailwind 내부 레이어 안에 있어, 셀렉터가 우연히 겹치는 unlayered
//    규칙이 있으면 specificity와 무관하게 항상 진다("Tailwind v4 layer
//    cascade 함정"). className="grid"만 믿지 않고 display:"grid"를
//    인라인으로도 명시(인라인은 레이어 밖이라 항상 이김).
// 3) <button>(Cell)의 기본 display는 inline-block — aspect-ratio 자동
//    사이징이 inline-block 컨텍스트에서 엔진별로 덜 안정적이라는 보고가
//    있어 display:"block"을 인라인으로 강제.
// 4) 컨테이너에 position:relative + isolation:isolate로 새 stacking
//    context를 만들어, 내부 요소(버튼/이미지)에 우연히 높은 z-index가
//    붙어도 그리드 바깥으로 새어나가 다음 메시지를 덮지 못하게 방어.
// 5) marginBottom + flexShrink:0 — 부모(MessageItem contentColumn)가
//    flex 컨테이너라 이론상 flex-shrink로 눌릴 수 있는 여지를 원천
//    차단하고, 계산이 아주 살짝 어긋나도 다음 메시지와 겹치지 않게 여유
//    간격을 둔다.

const GALLERY_SIZE = 240;
const GAP = 2;

type Props = {
  urls: string[];
  onImageClick?: (index: number) => void;
};

// 방어 레이어 4)+5) — 4개 카운트 분기 전부에 동일하게 적용되는 바깥
// 래퍼. Cell 자체 스타일(개별 방어 3)과는 별개.
const GALLERY_WRAP_STYLE: React.CSSProperties = {
  position: "relative",
  isolation: "isolate",
  zIndex: 0,
  flexShrink: 0,
  marginBottom: 6,
  overflow: "hidden",
};

function Cell({
  url,
  index,
  style,
  onImageClick,
}: {
  url: string;
  index: number;
  style: React.CSSProperties;
  onImageClick?: (index: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onImageClick?.(index)}
      aria-label="사진 크게 보기"
      className="overflow-hidden rounded-xl"
      style={{
        ...style,
        // 방어 3) — button 기본 display(inline-block) 대신 block으로
        // 고정해 aspect-ratio 자동 사이징을 안정시킨다.
        display: "block",
        position: "relative",
        padding: 0,
        border: "none",
        background: "rgba(92,58,31,0.08)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          // 방어 2) — globals.css의 unlayered `img{max-width:100%}`
          // 규칙이 인라인 width:100%엔 안 이기지만, 혹시 모를 축소를
          // 원천 차단.
          maxWidth: "none",
          objectFit: "cover",
        }}
      />
    </button>
  );
}

export function ImageGallery({ urls, onImageClick }: Props) {
  const count = urls.length;
  if (count === 0) return null;

  if (count === 1) {
    return (
      <div style={GALLERY_WRAP_STYLE}>
        <Cell
          url={urls[0]}
          index={0}
          style={{ width: GALLERY_SIZE, maxWidth: "100%", aspectRatio: "1 / 1" }}
          onImageClick={onImageClick}
        />
      </div>
    );
  }

  if (count === 2) {
    // 정사각 2개 나란히 (C-2). 컨테이너 자체에 aspectRatio(2/1)를 직접
    // 박아 높이를 확정한다(top-down) — 1/3/4장 케이스와 동일한 방식.
    return (
      <div style={GALLERY_WRAP_STYLE}>
        <div
          className="grid"
          style={{
            display: "grid", // 방어 2)
            gridTemplateColumns: "1fr 1fr",
            gap: GAP,
            width: GALLERY_SIZE,
            maxWidth: "100%",
            aspectRatio: "2 / 1",
          }}
        >
          {urls.map((url, i) => (
            <Cell
              key={`${url}-${i}`}
              url={url}
              index={i}
              style={{ width: "100%", height: "100%" }}
              onImageClick={onImageClick}
            />
          ))}
        </div>
      </div>
    );
  }

  if (count === 3) {
    // 좌측 큰 1(2행 병합) + 우측 작은 2(세로 스택) (C-3) — 카톡 3장 레이아웃.
    return (
      <div style={GALLERY_WRAP_STYLE}>
        <div
          className="grid"
          style={{
            display: "grid", // 방어 2)
            gridTemplateColumns: "2fr 1fr",
            gridTemplateRows: "1fr 1fr",
            gap: GAP,
            width: GALLERY_SIZE,
            maxWidth: "100%",
            aspectRatio: "1 / 1",
          }}
        >
          <div style={{ gridColumn: "1", gridRow: "1 / 3" }}>
            <Cell url={urls[0]} index={0} style={{ width: "100%", height: "100%" }} onImageClick={onImageClick} />
          </div>
          <div style={{ gridColumn: "2", gridRow: "1" }}>
            <Cell url={urls[1]} index={1} style={{ width: "100%", height: "100%" }} onImageClick={onImageClick} />
          </div>
          <div style={{ gridColumn: "2", gridRow: "2" }}>
            <Cell url={urls[2]} index={2} style={{ width: "100%", height: "100%" }} onImageClick={onImageClick} />
          </div>
        </div>
      </div>
    );
  }

  // 4장 — 2x2 (C-4). urls.length가 4 초과(방어적 — MAX_IMAGES_PER_MESSAGE
  // 보다 많이 들어온 옛/이상 데이터)면 앞 4장만.
  const shown = urls.slice(0, 4);
  return (
    <div style={GALLERY_WRAP_STYLE}>
      <div
        className="grid"
        style={{
          display: "grid", // 방어 2)
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: GAP,
          width: GALLERY_SIZE,
          maxWidth: "100%",
          aspectRatio: "1 / 1",
        }}
      >
        {shown.map((url, i) => (
          <Cell key={`${url}-${i}`} url={url} index={i} style={{ width: "100%", height: "100%" }} onImageClick={onImageClick} />
        ))}
      </div>
    </div>
  );
}
