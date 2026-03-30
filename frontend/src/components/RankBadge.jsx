const RANK_COLORS = ['#ffd700', '#b8c0cc', '#cd7f32', 'rgba(255,255,255,0.55)'];

export default function RankBadge({ i }) {
  const color = RANK_COLORS[i] ?? 'rgba(255,255,255,0.4)';
  return <span className="rank-badge" style={{ color }}>{i + 1}</span>;
}
