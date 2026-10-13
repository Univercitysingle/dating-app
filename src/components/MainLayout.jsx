import React from 'react';
import { Outlet } from 'react-router-dom';
import BottomNavBar from './BottomNavBar';
import Footer from './Footer';

const MainLayout = () => {
  return (
    <div className="relative min-h-screen bg-neutral-50 dark:bg-neutral-900 flex flex-col">
      <main
        className="flex-grow"
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
