import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import BottomNavBar from './BottomNavBar';
import Footer from './Footer';

const MainLayout = () => {
  const { pathname } = useLocation();
  const isChatRoute = pathname.startsWith('/chat/');

  return (
    <div className={`app-shell relative min-h-screen flex flex-col${isChatRoute ? " app-shell-chat" : ""}`}>
      <main
        className={`app-main flex-grow${isChatRoute ? " app-main-chat" : ""}`}
        style={isChatRoute ? undefined : { paddingBottom: 'calc(var(--bottom-nav-height) + 20px)' }}
      >
        {/* The Outlet will render the matched child route component */}
        <Outlet />
      </main>
      {!isChatRoute && <Footer />}
      <BottomNavBar />
    </div>
  );
};

export default MainLayout;
