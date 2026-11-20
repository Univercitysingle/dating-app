import React from 'react';
import { NavLink } from 'react-router-dom';

const Icon = ({ path }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

const items = [
  { to: '/discover', label: 'Discover', icon: 'M12 3v3m0 12v3M3 12h3m12 0h3M5.64 5.64l2.12 2.12m8.48 8.48 2.12 2.12m0-12.72-2.12 2.12m-8.48 8.48-2.12 2.12M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z' },
  { to: '/likes', label: 'Likes', icon: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z' },
  { to: '/dark-fantasy', label: 'Fantasy', icon: 'M12 3 14.5 9.5 21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z' },
  { to: '/conversations', label: 'Messages', icon: 'M21 11.5a8.4 8.4 0 0 1-8.9 8.4 9.2 9.2 0 0 1-4-.9L3 21l1.4-4.7A8.2 8.2 0 1 1 21 11.5Z' },
  { to: '/profile', label: 'Profile', icon: 'M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
  { to: '/store', label: 'Store', icon: 'M3 9h18l-1.5 11h-15L3 9Zm3 0V6a6 6 0 0 1 12 0v3' },
];

const BottomNavBar = () => (
  <nav className="app-bottom-nav member-mobile-nav fixed bottom-0 left-0 right-0 z-50" aria-label="Primary navigation">
    <div className="member-mobile-nav-inner">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item member-mobile-nav-item${isActive ? ' is-active' : ''}`}>
          <Icon path={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </div>
  </nav>
);

export default BottomNavBar;
