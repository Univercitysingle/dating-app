import React from 'react';
import { Outlet } from 'react-router-dom';
import BottomNavBar from './BottomNavBar';

const MainLayout = () => {
  return (
    <div className="relative min-h-screen bg-neutral-50 dark:bg-neutral-900">
      <main className="pb-20">
        {/* The Outlet will render the matched child route component */}
        <Outlet />
      </main>
      <BottomNavBar />
    </div>
  );
};

export default MainLayout;
