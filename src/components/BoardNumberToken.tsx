export default function BoardNumberToken({ value, x = 25, y = 25 }: { value: number; x?: number; y?: number }) {
  const pips = value <= 7 ? value - 1 : 13 - value;
  return <g role="img" aria-label={`Número ${value}: ${pips} combinações dos dados`}>
    <circle cx={x} cy={y + 16} r="21" className="number-token" />
    <text x={x} y={y + 17} textAnchor="middle" className={`number-text ${value === 6 || value === 8 ? "red" : ""}`}>{value}</text>
    {Array.from({ length: pips }, (_, index) => <circle key={index} cx={x + (index - (pips - 1) / 2) * 5} cy={y + 29} r="1.7" className="number-dot" />)}
  </g>;
}
