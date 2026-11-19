import React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import BottomNavBar from './BottomNavBar';
import Footer from './Footer';
import { useAuth } from '../context/AuthContext';
import ChatCallPanel from './ChatCallPanel';
import { CallSessionProvider, useCallSession } from '../context/CallSessionContext';

const MainLayoutContent = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { session, setCallActive } = useCallSession();
  const isChatRoute = pathname.startsWith('/chat/');
  const navClass = ({ isActive }) => `member-top-link${isActive ? ' is-active' : ''}`;

  return (
    <div className={`app-shell member-app-shell min-h-screen flex flex-col${isChatRoute ? ' app-shell-chat' : ''}`}>
      <header className="member-topbar">
        <div className="member-topbar-inner">
          <Link to="/discover" className="member-brand" aria-label="Hart2Hart Discover">
            <img src="/logo.jpg" alt="" width="38" height="38" />
            <span>Hart2Hart</span>
          </Link>
          <nav className="member-desktop-nav" aria-label="Main navigation">
            <NavLink to="/discover" className={navClass}>Discover</NavLink>
            <NavLink to="/likes" className={navClass}>Likes</NavLink>
            <NavLink to="/conversations" className={navClass}>Messages</NavLink>
            <NavLink to="/dark-fantasy" className={navClass}>Dark Fantasy</NavLink>
            <NavLink to="/profile" className={navClass}>Profile</NavLink>
            <NavLink to="/store" className={navClass}>Store</NavLink>
          </nav>
          <Link to="/profile" className="member-account-link" aria-label="Open your profile">
            <span className="member-account-avatar" aria-hidden="true">♡</span>
            <span>My profile</span>
          </Link>
        </div>
      </header>
      <main className={`app-main member-app-main flex-grow${isChatRoute ? ' app-main-chat member-app-main-chat' : ''}`}>
        <Outlet />
        {session && user && <ChatCallPanel roomId={session.roomId} currentUser={user} otherUser={session.otherUser} onCallStateChange={setCallActive} />}
      </main>
      {!isChatRoute && <Footer />}
      <BottomNavBar />
    </div>
  );
};

const MainLayout = () => <CallSessionProvider><MainLayoutContent /></CallSessionProvider>;

export default MainLayout;
