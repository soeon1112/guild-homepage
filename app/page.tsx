// Main page — feature-gated between legacy 우주 테마 and the new 하늘섬
// (Dawnlight 2) layout. The decision needs the logged-in nickname, so
// it lives in a client gate; this file stays a thin server shell.
import { MainGate } from "./components/dawnlight2/MainGate";

export default function Home() {
  return <MainGate />;
}
