import { useEffect, useState } from "react";
import {
  AbsoluteFill, continueRender, delayRender, Easing, interpolate, random, spring, staticFile,
  useCurrentFrame, useVideoConfig,
} from "remotion";

const RAUSCH = "#ff385c";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

// Schriften lokal laden (Yellowtail für den handgeschriebenen Schriftzug)
function useFonts() {
  const [handle] = useState(() => delayRender("Schriften laden"));
  useEffect(() => {
    const font = new FontFace("Yellowtail", `url(${staticFile("Yellowtail.woff2")})`);
    font.load().then((f) => {
      document.fonts.add(f);
      continueRender(handle);
    });
  }, [handle]);
}

const HEART = "M50 88 C 18 64, 4 46, 4 28 C 4 13, 15 3, 29 3 C 38 3, 45 8, 50 16 C 55 8, 62 3, 71 3 C 85 3, 96 13, 96 28 C 96 46, 82 64, 50 88 Z";

// Lunchly-Logo in der Schüssel; die Dampfstreifen bewegen sich in Wellen
const Bowl = ({ frame }) => {
  const steam = (x, top, phase) => {
    const w = Math.sin(frame / 5 + phase) * 4;
    return `M${x} ${top} C ${x - w} ${top + 5}, ${x + w} ${top + 9}, ${x} ${top + 15}`;
  };
  return (
    <svg viewBox="0 0 64 64" width="150" height="150" style={{ overflow: "visible" }}>
      <g fill="none" stroke={RAUSCH} strokeWidth="4" strokeLinecap="round">
        <path d={steam(22, 8 - Math.sin(frame / 6) * 1.5, 0)} />
        <path d={steam(32, 5 - Math.sin(frame / 6 + 1) * 1.5, 1.6)} />
        <path d={steam(42, 8 - Math.sin(frame / 6 + 2) * 1.5, 3.2)} />
      </g>
      <path d="M8 30 h48 a24 24 0 0 1 -48 0 z" fill={RAUSCH} />
    </svg>
  );
};

// Herzschlag: zwei kurze Schläge, dann Pause (wie „ba-bumm“)
const heartbeat = (frame, fps) => {
  const t = (frame / fps) % 1.0;
  const beat = (center, width, amp) => amp * Math.exp(-Math.pow((t - center) / width, 2));
  return 1 + beat(0.12, 0.05, 0.06) + beat(0.32, 0.06, 0.04);
};

export const MatchIntro = ({ theme = "light" }) => {
  useFonts();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const base = theme === "dark" ? "#121212" : "#ffffff";

  // 1) Der pinke Screen ploppt oben aus der Kamera auf volle Größe (ohne Nachfedern)
  const pop = interpolate(frame, [0, 16], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
  const camW = 126, camH = 38;
  const sx = interpolate(pop, [0, 1], [camW / width, 1]);
  const sy = interpolate(pop, [0, 1], [camH / height, 1]);
  const radius = interpolate(pop, [0, 1], [camH / 2, 0], clamp);

  // 2) Herz kommt von hinten, dreht sich einmal und landet; danach pocht es
  const fly = spring({ frame: frame - 10, fps, config: { damping: 14, stiffness: 55, mass: 1.1 } });
  const heartZ = interpolate(fly, [0, 1], [-1400, 0]);
  const heartRot = interpolate(fly, [0, 1], [-360, 0]);
  const heartOpacity = interpolate(frame, [10, 18], [0, 1], clamp);
  const pulse = frame > 44 ? heartbeat(frame - 44, fps) : 1;

  // 3) Schriftzug wird wie per Hand geschrieben: Kontur zeichnen, Feder fährt mit, dann füllen
  const write = interpolate(frame, [16, 58], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 2) });
  const fillIn = interpolate(frame, [34, 60], [0, 1], clamp);
  const swoosh = interpolate(frame, [52, 70], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) });
  const textW = 600;

  // 4) Ausblenden: alles zieht sich ins weiße Herz zurück, dann fällt das Herz aus dem Bild
  const heartCY = height * 0.22 + 156; // Mitte des Herzens
  const collapse = interpolate(frame, [104, 124], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const clipR = interpolate(collapse, [0, 1], [Math.hypot(width, height), 0]);
  const suck = interpolate(frame, [102, 120], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const fall = interpolate(frame, [124, 148], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const heartLift = interpolate(frame, [116, 124], [0, -26], { ...clamp, easing: Easing.out(Easing.quad) });
  const heartY = heartLift + fall * (height - heartCY + 200);
  const heartTilt = fall * 28;

  // Leise aufsteigende Herzchen im Hintergrund
  const floaters = new Array(14).fill(0).map((_, i) => {
    const start = 30 + random(`st${i}`) * 50;
    const t = interpolate(frame, [start, start + 70], [0, 1], clamp);
    return {
      x: 60 + random(`x${i}`) * (width - 120) + Math.sin(frame / 10 + i) * 12,
      y: height * (0.95 - t * 0.7),
      s: 14 + random(`s${i}`) * 22,
      o: t === 0 ? 0 : Math.sin(t * Math.PI) * 0.55,
    };
  });

  return (
    <AbsoluteFill style={{ background: base }}>
      <AbsoluteFill style={{ clipPath: collapse > 0 ? `circle(${clipR}px at ${width / 2}px ${heartCY}px)` : "none" }}>
      <AbsoluteFill style={{
        background: `radial-gradient(70% 50% at 50% 42%, #ff5a78 0%, ${RAUSCH} 62%, #e8204a 100%)`,
        transformOrigin: "50% 26px",
        transform: `scale(${sx}, ${sy})`,
        borderRadius: `${radius / Math.max(sx, 0.01)}px / ${radius / Math.max(sy, 0.01)}px`,
      }} />

      {floaters.map((f, i) => (
        <svg key={i} viewBox="0 0 100 92" width={f.s} height={f.s} style={{ position: "absolute", left: f.x, top: f.y, opacity: f.o }}>
          <path d={HEART} fill="#fff" />
        </svg>
      ))}
      </AbsoluteFill>

      {/* Herz mit Logo, 3D-Anflug von hinten */}
      <div style={{ position: "absolute", left: 0, right: 0, top: height * 0.22, height: 340, perspective: 900, display: "flex", justifyContent: "center" }}>
        <div style={{
          width: 340, height: 313, position: "relative", opacity: heartOpacity,
          transform: `translateY(${heartY}px) rotate(${heartTilt}deg) translateZ(${heartZ}px) rotateY(${heartRot}deg) scale(${pulse})`,
          transformStyle: "preserve-3d",
        }}>
          <svg viewBox="0 0 100 92" width="340" height="313" style={{ filter: "drop-shadow(0 18px 30px rgba(120,0,30,.35))" }}>
            <path d={HEART} fill="#fff" />
          </svg>
          <div style={{ position: "absolute", left: 95, top: 62 }}><Bowl frame={frame} /></div>
        </div>
      </div>

      {/* Handgeschriebener Schriftzug mit Schwungstrich */}
      <svg width={width} height={300} viewBox={`0 0 ${width} 300`} style={{
        position: "absolute", left: 0, top: height * 0.56, overflow: "visible", opacity: 1 - suck,
        transformOrigin: `${width / 2}px ${heartCY - height * 0.56}px`, transform: `scale(${1 - suck * 0.96})`,
      }}>
        <defs>
          <clipPath id="pen">
            <rect x={(width - textW) / 2 - 20} y="0" width={(textW + 60) * write} height="300" />
          </clipPath>
        </defs>
        <g transform={`rotate(-5 ${width / 2} 120)`}>
          <text x={width / 2} y="150" textAnchor="middle" fontFamily="Yellowtail" fontSize="124"
            fill={`rgba(255,255,255,${fillIn})`} stroke="#fff" strokeWidth="2.5"
            strokeDasharray="900" strokeDashoffset={900 * (1 - write)} clipPath="url(#pen)">
            It's a Lunch!
          </text>
          <path d={`M ${width / 2 - 250} 192 C ${width / 2 - 90} 172, ${width / 2 + 120} 168, ${width / 2 + 270} 182`}
            fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round"
            pathLength="1" strokeDasharray="1" strokeDashoffset={1 - swoosh} opacity={swoosh > 0 ? 0.95 : 0} />
          {/* Federspitze, die beim Schreiben mitläuft */}
          {write > 0 && write < 1 && (
            <circle cx={(width - textW) / 2 + textW * write} cy={110 + Math.sin(write * 26) * 34} r="7" fill="#fff" opacity="0.9" />
          )}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
