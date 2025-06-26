import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/main';

interface GV_HeaderProps {
    // No props are directly passed to this component as its data comes from global state.
}

const GV_Header: React.FC<GV_HeaderProps> = () => {
    // Access authentication status and logout action from the global Zustand store
    // Optimized selection for better performance and fewer unnecessary re-renders
    const is_logged_in = useAppStore((state) => state.authentication_status.is_logged_in);
    const display_user_email = useAppStore((state) => state.authentication_status.user_email);
    const clear_authentication_status = useAppStore((state) => state.clear_authentication_status);

    // Hook for programmatic navigation
    const navigate = useNavigate();

    // Event handler for clicking the CineCrib logo (navigates to home)
    const handle_logo_click = () => {
        navigate('/');
    };

    // Event handler for the login button
    const handle_login_click = () => {
        navigate('/login');
    };

    // Event handler for the sign-up button
    const handle_signup_click = () => {
        navigate('/signup');
    };

    // Event handler for the watchlist link (no longer needed, Link handles navigation)
    // const handle_watchlist_click = () => {
    //     navigate('/watchlist');
    // };

    // Event handler for the profile/settings link (no longer needed, Link handles navigation)
    // const handle_profile_click = () => {
    //     navigate('/settings');
    // };

    // Event handler for the logout button
    const handle_logout_click = () => {
        clear_authentication_status(); // Clears user session from global state
        navigate('/login'); // Redirect to login page after logout
    };

    return (
        <>
            <header className="fixed top-0 left-0 w-full bg-gray-900 border-b border-gray-700 z-50 shadow-lg">
                <nav className="container mx-auto px-4 py-3 flex items-center justify-between h-16">
                    {/* Logo/App Name - Always links to home */}
                    <div className="flex items-center space-x-2 cursor-pointer" onClick={handle_logo_click}>
                        {/* Using a placeholder for a logo, as no specific image assets are provided */}
                        <span className="text-2xl font-bold text-red-500">
                            🎬
                        </span>
                        <h1 className="text-xl font-semibold text-white tracking-tight">CineCrib</h1>
                    </div>

                    {/* Navigation Links / Auth Buttons */}
                    <div className="flex items-center space-x-4">
                        {is_logged_in ? (
                            // Authenticated User Navigation
                            <div className="flex items-center space-x-4">
                                <span className="text-gray-300 hidden md:block">
                                    Welcome, {display_user_email || 'User'}!
                                </span>
                                <Link
                                    to="/watchlist"
                                    className="text-white hover:text-red-400 transition-colors duration-200"
                                >
                                    Watchlist
                                </Link>
                                <Link
                                    to="/settings"
                                    className="text-white hover:text-red-400 transition-colors duration-200"
                                >
                                    Profile
                                </Link>
                                <button
                                    onClick={handle_logout_click}
                                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                                >
                                    Logout
                                </button>
                            </div>
                        ) : (
                            // Guest User Authentication Options
                            <div className="flex items-center space-x-4">
                                <button
                                    onClick={handle_login_click}
                                    className="px-4 py-2 text-red-400 border border-red-400 rounded-md hover:bg-red-400 hover:text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                                >
                                    Login
                                </button>
                                <button
                                    onClick={handle_signup_click}
                                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                                >
                                    Sign Up
                                </button>
                            </div>
                        )}
                    </div>
                </nav>
            </header>
            {/* Spacer to prevent content from hiding beneath the fixed header */}
            <div className="h-16"></div>
        </>
    );
};

export default GV_Header;