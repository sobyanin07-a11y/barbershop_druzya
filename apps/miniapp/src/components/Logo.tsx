interface LogoProps {
  size?: number;
}

export function Logo({ size = 96 }: LogoProps) {
  return (
    <div className="logo-img-wrap" style={{ width: size, height: size }}>
      <img src="/logo.jpg" alt="Барбершоп Друзья" />
    </div>
  );
}
