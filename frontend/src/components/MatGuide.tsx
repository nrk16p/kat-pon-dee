/** Framing overlay: four corner brackets where the ArUco markers must land, and
 *  the measurement area in the middle. Keeping the guide geometrically faithful
 *  to the printed sheet is what makes people frame it correctly first try. */
export default function MatGuide({ areaRatio }: { areaRatio: number }) {
  const pad = 7 // % inset of the mat within the frame
  const mat = 100 - pad * 2
  const area = mat * areaRatio
  const areaPad = (100 - area) / 2
  const b = 7 // bracket arm length, %

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <mask id="cut">
          <rect width="100" height="100" fill="white" />
          <rect x={pad} y={pad} width={mat} height={mat} fill="black" />
        </mask>
      </defs>
      <rect width="100" height="100" fill="rgb(11 15 13 / 0.45)" mask="url(#cut)" />

      {/* marker corners */}
      {[
        [pad, pad, 1, 1],
        [100 - pad, pad, -1, 1],
        [100 - pad, 100 - pad, -1, -1],
        [pad, 100 - pad, 1, -1],
      ].map(([x, y, sx, sy], i) => (
        <path
          key={i}
          d={`M ${x} ${y + sy * b} L ${x} ${y} L ${x + sx * b} ${y}`}
          fill="none"
          stroke="#22C55E"
          strokeWidth="0.9"
          strokeLinecap="square"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {/* measurement area */}
      <rect
        x={areaPad}
        y={areaPad}
        width={area}
        height={area}
        fill="none"
        stroke="#22C55E"
        strokeOpacity="0.5"
        strokeWidth="0.5"
        strokeDasharray="2 1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
