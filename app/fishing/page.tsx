// /fishing — entry point used by the mobile app's WebView
// (dawnlight-app/app/fishing.tsx). This route renders the same
// content as the home page and auto-opens the fishing modal via a
// pathname check inside the home layout.
//
// A non-logged-in visitor sees the home page as-is (auth gate),
// since canSeeFishing(nickname) returns false and the modal stays
// closed — matching existing UX where the fishing button isn't
// shown to logged-out users.
export { default } from "../page";
