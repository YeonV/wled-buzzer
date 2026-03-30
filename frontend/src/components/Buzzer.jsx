import { useId } from 'react';

// ── Colour math ────────────────────────────────────────────────────────────
function lighten(hex, n) {
  return `rgb(${[1, 3, 5].map(i => Math.min(255, parseInt(hex.slice(i, i + 2), 16) + n)).join(',')})`;
}
function darken(hex, n) {
  return `rgb(${[1, 3, 5].map(i => Math.max(0,   parseInt(hex.slice(i, i + 2), 16) - n)).join(',')})`;
}
function hexToRgba(hex, a) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * A stylised game-show buzzer SVG.
 * Variants: 'perspective' (3D Dark Box), 'classic' (Flat LED), 'wled' (Flat Stepped LED)
 */
export default function Buzzer({
  buzzing = false,
  online  = true,
  color   = '#cc1515',
  size    = 110,
  variant = 'perspective',
}) {
  const uid = useId().replace(/:/g, '');

  const domeBase   = online ? color             : '#3a3a44';
  const domeBright = online ? lighten(color, 85) : '#505060';
  const domeDark   = online ? darken(color, 60)  : '#1a1a22';
  const glow       = hexToRgba(color, 0.75);
  const ledColor   = online ? (buzzing ? '#ff6060' : '#dd2020') : '#282830';

  return (
    <div 
      className={`buzzer-root buzzer-root--variant-${variant}${buzzing ? ' buzzer-root--buzzing' : ''}`}
      style={{ '--buzzer-glow': glow }}
    >
      <div className="buzzer-svg-wrap" style={{ width: size }}>
        <svg viewBox="0 0 100 135" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            {/* Common Dome Gradients */}
            <radialGradient id={`${uid}-dome`} cx="34%" cy="27%" r="70%">
              <stop offset="0%"   stopColor={domeBright} />
              <stop offset="48%"  stopColor={domeBase}   />
              <stop offset="100%" stopColor={domeDark}    />
            </radialGradient>

            <radialGradient id={`${uid}-dome-top`} cx="38%" cy="22%" r="60%">
              <stop offset="0%" stopColor="rgba(255,255,255,1)" />
              <stop offset="20%" stopColor="rgba(255,255,255,0.70)" />
              <stop offset="45%" stopColor="rgba(255,255,255,0.12)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.12)" />
            </radialGradient>

            {/* Flat Body Gradients */}
            <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#3d3d52" />
              <stop offset="100%" stopColor="#18181f" />
            </linearGradient>

            <linearGradient id={`${uid}-collar`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#28283a" />
              <stop offset="100%" stopColor="#14141c" />
            </linearGradient>

            {/* Perspective Dark Box Gradients */}
            <linearGradient id={`${uid}-g1`} x2="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(55.5,-106.5,150.568,78.465,39.018,172.581)">
              <stop offset=".027" stopColor="#121218" />
              <stop offset=".887" stopColor="#1a1a22" />
            </linearGradient>
            <linearGradient id={`${uid}-g2`} x2="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(26.11,-144.607,61.874,11.172,109.804,170.279)">
              <stop offset="0" stopColor="#2a2a35" />
              <stop offset=".317" stopColor="#1e1e26" />
              <stop offset="1" stopColor="#22222b" />
            </linearGradient>
            <linearGradient id={`${uid}-g3`} x2="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(59.623,-99.932,233.665,139.413,-100.224,102.026)">
              <stop offset=".027" stopColor="#08080c" />
              <stop offset=".887" stopColor="#0f0f14" />
            </linearGradient>
          </defs>

          <g>
            {/* ── 1. HOUSING / BOX ── */}
            {variant === 'perspective' ? (
              <>
                {/* Ground Shadow */}
                <ellipse cx="50" cy="122" rx="35" ry="8" fill="black" opacity="0.35" filter="blur(5px)" />
                
                <g transform="translate(-32,40) scale(0.56,0.39)">
                  <path d="m129.35 128.52l-0.65 108.35 87.97-40.55 11.68-100.33z" fill={`url(#${uid}-g1)`} />
                  <path d="m153.74 57.5l-91.37 22.76 66.98 48.26 99-32.53z" fill={`url(#${uid}-g2)`} />
                  <path d="m62.37 80.26l6.63 97.66 59.7 58.95 0.65-108.35z" fill={`url(#${uid}-g3)`} />
                  <path d="M 129.5 130 L 129.5 236" stroke="rgba(255,255,255,0.06)" strokeWidth="1.2" />
                  <ellipse cx="165.45" cy="79.57" rx="17" ry="5" fill="rgba(255,255,255,0.04)" />

                  {/* Right-face Perspective WLED */}
                  {(() => {
                    const wledColor = color || '#0050ff';
                    const baseGray = online ? '#323240' : '#1a1a22';
                    return (
                      <g transform="translate(174,172) rotate(-24) skewX(-26) scale(1.8)">
                        <rect x="-18" y="6" width="12" height="6" fill={buzzing ? lighten(wledColor, 30) : baseGray} />
                        <rect x="-6"  y="-6" width="6"  height="12" fill={buzzing ? lighten(wledColor, 20) : baseGray} />
                        <rect x="0"   y="-12" width="6"  height="12" fill={buzzing ? lighten(wledColor, 10) : baseGray} />
                        <rect x="6"   y="-18" width="12" height="6"  fill={buzzing ? wledColor : baseGray} />
                      </g>
                    );
                  })()}
                </g>
              </>
            ) : (
              <>
                <rect x="12" y="72" width="76" height="52" rx="12" fill={`url(#${uid}-body)`} />
                <rect x="12" y="72" width="76" height="13" rx="12" fill="rgba(255,255,255,0.055)" />
                <rect x="12" y="110" width="76" height="14" rx="12" fill="rgba(0,0,0,0.18)" />
                {/* Vent ribs only for flat variants */}
                <rect x="17"   y="86" width="2.5" height="18" rx="1.2" fill="rgba(255,255,255,0.045)" />
                <rect x="21.5" y="86" width="2.5" height="18" rx="1.2" fill="rgba(255,255,255,0.045)" />
                <rect x="76"   y="86" width="2.5" height="18" rx="1.2" fill="rgba(255,255,255,0.045)" />
                <rect x="80.5" y="86" width="2.5" height="18" rx="1.2" fill="rgba(255,255,255,0.045)" />
              </>
            )}

            {/* ── 2. LED INDICATORS (FLAT ONLY) ── */}
            {variant === 'classic' && (
              <>
                <circle cx="50" cy="94" r="4"   fill="#0b0b12" />
                <circle cx="50" cy="94" r="2.5" fill={ledColor} />
                <circle cx="49" cy="93" r="0.9" fill="rgba(255,255,255,0.40)" />
              </>
            )}
            {variant === 'wled' && (
              <g transform={`translate(0,3) translate(52 106) scale(0.65) translate(-52 -106)`}>
                {(() => {
                  const wledColor = color || '#0050ff';
                  const baseGray = online ? '#505060' : '#2a2a33';
                  return (
                    <>
                      <rect x="34" y="100" width="12" height="6" fill={buzzing ? lighten(wledColor, 30) : baseGray} />
                      <rect x="46" y="88"  width="6"  height="12" fill={buzzing ? lighten(wledColor, 20) : baseGray} />
                      <rect x="52" y="82"  width="6"  height="12" fill={buzzing ? lighten(wledColor, 10) : baseGray} />
                      <rect x="58" y="76"  width="12" height="6"  fill={buzzing ? wledColor : baseGray} />
                    </>
                  );
                })()}
              </g>
            )}

            {/* ── 3. COLLAR & DOME ── */}
            {variant === 'perspective' ? (
              <>
                {/* Perspective Collar */}
                <g transform="translate(50, 71)">
                  <ellipse cx="0" cy="2" rx="34" ry="9" fill="rgba(0,0,0,0.6)" />
                  <ellipse cx="0" cy="0" rx="31" ry="8" fill="#050508" />
                  <ellipse cx="0" cy="-0.5" rx="29" ry="7" fill="#12121a" />
                </g>
                {/* Perspective Dome */}
                <g transform="translate(-32,40) scale(0.56,0.39)">
                  <defs>
                    <clipPath id={`${uid}-dome-clip-persp`}>
                      <path d="M 91,72 A 56,20 0 1 0 203,72 L 203,-50 L 91,-50 Z" />
                    </clipPath>
                  </defs>
                  <ellipse cx="147" cy="74" rx="62" ry="22" fill="#0f0f16" /> 
                  <ellipse cx="147" cy="72" rx="58" ry="20" fill="#1c1c28" />
                  <g clipPath={`url(#${uid}-dome-clip-persp)`}>
                    <ellipse cx="147" cy="72" rx="56" ry="85" fill={`url(#${uid}-dome)`} />
                    <ellipse cx="147" cy="72" rx="56" ry="15" fill={color} opacity="0.3" />
                    {buzzing && (
                      <>
                        <ellipse cx="147" cy="32" rx="42" ry="25" fill={`url(#${uid}-dome-top)`} opacity="0.95" />
                        <ellipse cx="132" cy="27" rx="18" ry="10" fill="white" fillOpacity="0.8" transform="rotate(-25, 132, 27)" />
                        <ellipse cx="128" cy="20" rx="6" ry="3" fill="white" fillOpacity="0.9" transform="rotate(-25, 128, 20)" />
                        <ellipse cx="147" cy="72" rx="56" ry="60" fill="white" opacity="0.25" filter="blur(4px)" />
                      </>
                    )}
                  </g>
                  <path d="M 91,72 A 56,20 0 0 0 203,72" fill="none" stroke={buzzing ? "white" : "rgba(255,255,255,0.08)"} strokeWidth={buzzing ? "2" : "1"} strokeOpacity={buzzing ? "0.8" : "0.2"} />
                </g>
              </>
            ) : (
              /* Flat Variants Dome (Classic / Wled) */
              <>
                <g transform="translate(51, 72)">
                  <ellipse cx="0" cy="2" rx="38" ry="7"   fill="#0f0f16" />
                  <ellipse cx="0" cy="1" rx="36" ry="5.5" fill="#1c1c28" />
                  <ellipse cx="0" cy="0" rx="34" ry="4"   fill={`url(#${uid}-collar)`} />
                </g>
                <circle cx="50" cy="51" r="37" fill="#0f0f16" />
                <circle cx="50" cy="51" r="35" fill="#1c1c28" />
                <circle cx="50" cy="49" r="32" fill={`url(#${uid}-dome)`} />
                <path d="M 19,56 A 32,32 0 0 1 81,56 Z" fill="rgba(0,0,0,0.12)" />
                <ellipse cx="39.5" cy="36.5" rx="11"  ry="6.5" fill="rgba(255,255,255,0.20)" transform="rotate(-28 39.5 36.5)" />
                <ellipse cx="36.5" cy="33"   rx="5"   ry="2.8" fill="rgba(255,255,255,0.38)" transform="rotate(-28 36.5 33)" />
                <ellipse cx="34"   cy="30.5" rx="2"   ry="1.2" fill="rgba(255,255,255,0.58)" transform="rotate(-28 34 30.5)" />
              </>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}