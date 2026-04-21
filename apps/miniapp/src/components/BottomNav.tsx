import { NavLink } from 'react-router-dom';
import { useTelegram } from '../hooks/useTelegram';

const items = [
  {
    to: '/',
    label: 'Главная',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" />
      </svg>
    )
  },
  {
    to: '/services',
    label: 'Услуги',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    )
  },
  {
    to: '/masters',
    label: 'Мастера',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
      </svg>
    )
  },
  {
    to: '/profile',
    label: 'Профиль',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="7" r="4" />
        <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      </svg>
    )
  }
];

export function BottomNav() {
  const { haptic } = useTelegram();
  return (
    <nav className="nav-bar">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === '/'}
          className={({ isActive }) => `nav-btn ${isActive ? 'on' : ''}`}
          onClick={() => haptic('light')}
        >
          {it.icon}
          <span>{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
