import { Composition } from "remotion";
import { MatchIntro } from "./MatchIntro";

// Hochformat fürs Handy, 3 Sekunden. Danach blendet die App in den Match-Screen über.
// Zwei Varianten: hell und dunkel (Hintergrund, aus dem der pinke Screen herausploppt).
export const RemotionRoot = () => (
  <>
    <Composition id="MatchIntro" component={MatchIntro} durationInFrames={90} fps={30} width={720} height={1560} defaultProps={{ theme: "light" }} />
    <Composition id="MatchIntroDark" component={MatchIntro} durationInFrames={90} fps={30} width={720} height={1560} defaultProps={{ theme: "dark" }} />
  </>
);
