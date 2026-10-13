import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Footer = () => {
    const location = useLocation();

    if (location.pathname !== '/login') {
        return null;
    }

    return (
        <footer className="text-center p-4 mt-8">
            <div className="container mx-auto text-sm text-neutral-600 dark:text-neutral-400">
                <div className="flex justify-center space-x-4">
                    <Link to="/terms" className="hover:underline">Terms</Link>
                    <span>|</span>
                    <Link to="/cookies" className="hover:underline">Cookie Policy</Link>
                    <span>|</span>
                    <Link to="/faq" className="hover:underline">FAQ</Link>
                    <span>|</span>
                    <Link to="/safety" className="hover:underline">Safety</Link>
                    <span>|</span>
                    <Link to="/privacy-settings" className="hover:underline">Privacy Settings</Link>
                </div>
                <p className="mt-4">&copy; {new Date().getFullYear()} Hart2Hart. All Rights Reserved.</p>
            </div>
        </footer>
    );
};

export default Footer;
