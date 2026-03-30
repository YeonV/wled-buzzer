export default function RulesSlide({ question }) {
  const lines = question.split('\n');
  const parsed = lines.map((line) => {
    if (!line.trim()) return { type: 'spacer' };
    const m = line.match(/^(\d+)[.)\s]\s*(.+)/);
    if (m) return { type: 'item', num: m[1], text: m[2] };
    if (/^\s+/.test(line)) return { type: 'subitem', text: line.trim() };
    return { type: 'label', text: line };
  });

  const firstLabelIdx = parsed.findIndex(e => e.type === 'label');

  return (
    <div className="slide-card slide-card--rules">
      {parsed.map((entry, i) => {
        if (entry.type === 'spacer') return null;
        if (entry.type === 'label') {
          if (i === firstLabelIdx)
            return <div key={i} className="rules-header">{entry.text}</div>;
          return <div key={i} className="rules-para">{entry.text}</div>;
        }
        if (entry.type === 'subitem')
          return <div key={i} className="rules-subitem">{entry.text}</div>;
        return (
          <div key={i} className="rules-item">
            <span className="rules-num">{entry.num}</span>
            <span className="rules-text">{entry.text}</span>
          </div>
        );
      })}
    </div>
  );
}
