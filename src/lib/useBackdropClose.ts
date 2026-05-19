// useBackdropClose.ts
// 모달 backdrop click-outside 닫힘에서 텍스트 드래그 오인 차단 hook.
//
// 함정: backdrop onClick={onClose} 만 두면 사용자가 input/textarea 안에서
// 텍스트 드래그 시작 → 마우스가 backdrop으로 넘어가 mouseup → HTML click
// 표준이 공통 부모(backdrop)에서 발화 → onClose 호출 → 모달 강제 닫힘.
// card onClick stopPropagation 은 click이 card 안에서 발화될 때만 막아서
// 이 시나리오를 못 막음.
//
// 해결: mousedown 위치를 ref로 추적. backdrop 자체에서 mousedown 시작한
// 경우에만 onClick에서 onClose 발화. 드래그가 input에서 시작했으면
// e.target !== e.currentTarget → ref false → 닫힘 차단.
//
// 사용:
//   const backdropHandlers = useBackdropClose(onClose);
//   <div className="backdrop" {...backdropHandlers}>
//     <div className="content" onClick={(e) => e.stopPropagation()}>
//       ...
//     </div>
//   </div>
//
// disabled (saving / submitting / uploading 중):
//   const backdropHandlers = useBackdropClose(onClose, !saving);

import { useRef } from "react";
import type React from "react";

export function useBackdropClose(onClose: () => void, enabled = true) {
  const downOnBackdropRef = useRef(false);

  return {
    onMouseDown: (e: React.MouseEvent) => {
      downOnBackdropRef.current = enabled && e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      if (downOnBackdropRef.current && e.target === e.currentTarget) {
        onClose();
      }
      downOnBackdropRef.current = false;
    },
  };
}
