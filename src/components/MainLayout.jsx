import React from 'react';
import { Outlet } from 'react-router-dom';
import BottomNavBar from './BottomNavBar';
import Footer from './Footer';

const MainLayout = () => {
  return (
    <div className="app-shell relative min-h-screen flex flex-col">
      <main
        className="app-main flex-grow"
        style={{ paddingBottom: 'calc(var(--bottom-nav-height) + 20px)' }}
      >
        {/* The Outlet will render the matched child route component */}
        <Outlet />
      </main>
      <Footer />
      <BottomNavBar />
    </div>
  );
};

export default MainLayout;
