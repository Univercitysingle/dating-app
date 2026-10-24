import React from 'react';
import { NavLink } from 'react-router-dom';

// A simple component for SVG icons. In a real app, you might use a library like react-icons.
const Icon = ({ path }) => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
  </svg>
);

const BottomNavBar = () => {
  return (
    <nav
      className="app-bottom-nav fixed bottom-0 left-0 right-0 z-50"
    >
      <div className="mx-auto flex w-full max-w-xl justify-around">
        <NavLink
          to="/discover"
          className={({ isActive }) => `nav-item flex flex-col items-center justify-center ${isActive ? "is-active" : ""}`}
        >
          <Icon path="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 016-6h6a6 6 0 016 6v1h-3" />
          <span className="text-xs">Discover</span>
        </NavLink>
        <NavLink
          to="/likes"
          className={({ isActive }) => `nav-item flex flex-col items-center justify-center ${isActive ? "is-active" : ""}`}
        >
          <Icon path="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          <span className="text-xs">Likes</span>
        </NavLink>
        <NavLink
          to="/conversations"
          className={({ isActive }) => `nav-item flex flex-col items-center justify-center ${isActive ? "is-active" : ""}`}
        >
          <Icon path="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          <span className="text-xs">Conversations</span>
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) => `nav-item flex flex-col items-center justify-center ${isActive ? "is-active" : ""}`}
        >
          <Icon path="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          <span className="text-xs">Profile</span>
        </NavLink>
      </div>
    </nav>
  );
};

export default BottomNavBar;
