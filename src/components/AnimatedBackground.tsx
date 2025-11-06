export const AnimatedBackground = () => {
  const particles = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    delay: Math.random() * 5,
    duration: 15 + Math.random() * 10,
    size: 150 + Math.random() * 200,
    left: Math.random() * 100,
    top: Math.random() * 100,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Gradiente base */}
      <div 
        className="absolute inset-0 opacity-70"
        style={{
          background: `linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--accent) / 0.12))`,
        }}
      />

      {/* Partículas flotantes */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full blur-3xl opacity-30 animate-float-slow"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: `radial-gradient(circle, hsl(var(--primary) / 0.5), transparent)`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
};
