// getAgoraToken.ts
// functions/src/api/agoraToken.ts (Phase 1, 이미 배포됨)의 getAgoraToken
// onCall을 감싸는 얇은 클라이언트 래퍼. Cloud Function은 asia-northeast3
// (Seoul)에 배포돼 있어 region을 명시하지 않으면 기본 us-central1로 호출돼
// 404가 난다.

import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "@/src/lib/firebase";

const functions = getFunctions(app, "asia-northeast3");

type GetAgoraTokenRequest = { channelName: string; uid: number };
type GetAgoraTokenResponse = { token: string; appId: string; expiresAt: number };

export async function fetchAgoraToken(
  channelName: string,
  uid: number,
): Promise<GetAgoraTokenResponse> {
  const callable = httpsCallable<GetAgoraTokenRequest, GetAgoraTokenResponse>(
    functions,
    "getAgoraToken",
  );
  const res = await callable({ channelName, uid });
  return res.data;
}
