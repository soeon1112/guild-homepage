// Phase 1: 펫 시스템 진입 차단 — endpoint 비활성화 (410 Gone).
// 본 LLM 호출 + petChatLogs write 로직은 Phase 3에서 파일 통째 삭제 예정.
// 코드 제거 전 안전망이라 PetChatBox 같은 잔여 호출자는 410 받음.

export async function POST() {
  return new Response(
    JSON.stringify({ error: "Pet system has been removed." }),
    {
      status: 410,
      headers: { "Content-Type": "application/json" },
    },
  );
}
