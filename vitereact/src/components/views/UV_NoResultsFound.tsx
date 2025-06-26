import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * UV_NoResultsFound Component
 *
 * This view informs the user when no recommendations could be found matching their specified criteria.
 * It provides clear feedback and actionable guidance, suggesting ways to adjust criteria and quickly
 * return to content discovery.
 */
const UV_NoResultsFound: React.FC = () => {
    const navigate = useNavigate();

    /**
     * handleReturnToFilters
     * Navigates the user back to the main preference input page (`/`) to adjust their search criteria.
     * The target page (`UV_HomePage_PreferenceInput`) is responsible for pre-filling the form
     * with previously selected criteria (either from localStorage for guests or saved preferences for logged-in users).
     */
    const handleReturnToFilters = () => {
        navigate('/');
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] p-4 text-center bg-gray-900 text-white">
            <svg
                className="w-24 h-24 text-primary-500 mb-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
            </svg>
            <h1 className="text-4xl font-extrabold mb-4 text-primary-400">Oops! No Results Found</h1>
            <p className="text-lg md:text-xl max-w-2xl mb-6 text-gray-300">
                It looks like we couldn't find any content that matches all your current filters.
            </p>
            <div className="mb-8 max-w-md space-y-3 text-gray-400">
                <p>Try broadening your search by:</p>
                <ul className="list-disc list-inside space-y-1">
                    <li>Selecting more streaming services.</li>
                    <li>Choosing more genres.</li>
                    <li>Widening your release year range.</li>
                    <li>Adjusting your mood selection.</li>
                    <li>Checking your Parental Ratings filters (they might be too strict!).</li>
                </ul>
            </div>
            <button
                onClick={handleReturnToFilters}
                className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg shadow-lg transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            >
                Return to Filters
            </button>
        </div>
    );
};

export default UV_NoResultsFound;