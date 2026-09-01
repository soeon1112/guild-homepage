"use client";

// 닉네임 클릭 → "OO님 공간으로 가기" 팝업 완전 제거. 프사 클릭으로 개인
// 공간 이동이 통일됐으므로(app/components/redesign/MemberAvatar.tsx) 닉네임
// 텍스트는 더 이상 클릭에 반응하지 않는다 — 이 컴포넌트를 dumb 하게 바꿔서
// 20곳 이상 호출부를 하나도 안 고치고 한 번에 반영한다.
//
// 바깥 .nickname-link-wrap span 은 그대로 유지 — globals.css 의
// `.guestbook-entry > .nickname-link-wrap` 등 자식 결합자 셀렉터가 이
// 래퍼의 존재 자체에 의존해 레이아웃 마진을 잡고 있어서(팝업 위치잡기용이
// 아니라 실제 레이아웃용으로도 쓰이는 구조), 지우면 그 마진 보정이 깨진다.
//
// cursor/textDecoration 은 인라인 스타일로 덮는다(globals.css 의
// `.nickname-link:hover { text-decoration: underline }` 등은 안 건드림)
// — 인라인 스타일이 클래스 규칙보다 항상 이겨서 hover 상태 포함 항상
// 밑줄이 안 생긴다.
export default function NicknameLink({
  nickname,
  className,
  prefix,
}: {
  nickname: string;
  className?: string;
  prefix?: string;
}) {
  const combinedClass = "nickname-link" + (className ? " " + className : "");
  return (
    <span className="nickname-link-wrap">
      <span
        className={combinedClass}
        style={{ cursor: "default", textDecoration: "none" }}
      >
        {prefix}
        {nickname}
      </span>
    </span>
  );
}
