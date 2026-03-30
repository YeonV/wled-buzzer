export default function IntroSlide({ question }) {
  return (
    <div className="slide-card slide-card--intro">
      <div className="slide-text">
        {question.split('\n').map((line, i, arr) => (
          <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
        ))}
      </div>
    </div>
  );
}
