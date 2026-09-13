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

const GALLERY_SIZE = 240;
const GAP = 2;

type Props = {
  urls: string[];
  onImageClick?: (index: number) => void;
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
      style={{ ...style, padding: 0, border: "none", background: "rgba(92,58,31,0.08)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
      />
    </button>
  );
}

export function ImageGallery({ urls, onImageClick }: Props) {
  const count = urls.length;
  if (count === 0) return null;

  if (count === 1) {
    return (
      <Cell
        url={urls[0]}
        index={0}
        style={{ width: GALLERY_SIZE, maxWidth: "100%", aspectRatio: "1 / 1" }}
        onImageClick={onImageClick}
      />
    );
  }

  if (count === 2) {
    // 정사각 2개 나란히 (C-2). 컨테이너 자체에 aspectRatio(2/1)를 직접
    // 박아 높이를 확정한다(top-down) — 1/3/4장 케이스와 동일한 방식.
    // 이전엔 컨테이너에 높이 지정이 없어 grid-auto-rows가 Cell의
    // aspectRatio로부터 역산(bottom-up)했는데, 이 경로가 일부 브라우저/
    // 타이밍에서 씹혀 컨테이너 높이가 0으로 잡히고 다음 메시지가 그 위로
    // 겹쳐 보이는 버그의 원인이었다.
    return (
      <div
        className="grid"
        style={{
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
    );
  }

  if (count === 3) {
    // 좌측 큰 1(2행 병합) + 우측 작은 2(세로 스택) (C-3) — 카톡 3장 레이아웃.
    return (
      <div
        className="grid"
        style={{
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
    );
  }

  // 4장 — 2x2 (C-4). urls.length가 4 초과(방어적 — MAX_IMAGES_PER_MESSAGE
  // 보다 많이 들어온 옛/이상 데이터)면 앞 4장만.
  const shown = urls.slice(0, 4);
  return (
    <div
      className="grid"
      style={{
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
  );
}
