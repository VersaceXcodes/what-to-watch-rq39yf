import React, { useEffect } from 'react';
import {
    BrowserRouter,
    Route,
    Routes,
    Navigate,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from '@/store/main';

// Import the provided views
import GV_Header from '@/components/views/GV_Header.tsx';
import GV_Footer from '@/components/views/GV_Footer.tsx';
import UV_HomePage_PreferenceInput from '@/components/views/UV_HomePage_PreferenceInput.tsx';
import UV_RecommendationResults from '@/components/views/UV_RecommendationResults.tsx';
import UV_ContentDetail from '@/components/views/UV_ContentDetail.tsx';
import UV_SignUp from '@/components/views/UV_SignUp.tsx';
import UV_LogIn from '@/components/views/UV_LogIn.tsx';
import UV_UserWatchlist from '@/components/views/UV_UserWatchlist.tsx';
import UV_ProfileSettings from '@/components/views/UV_ProfileSettings.tsx';
import UV_NoResultsFound from '@/components/views/UV_NoResultsFound.tsx';

// Initialize React Query client outside the component to prevent re-creation on re-renders
const queryClient = new QueryClient();

// --- Error Boundary Component ---
// This is a simple generic ErrorBoundary. For production, you might want
// more sophisticated logging/reporting.
interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        // Update state so the next render will show the fallback UI.
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        // You can also log the error to an error reporting service
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return this.props.fallback || (
                <div className="flex flex-col items-center justify-center h-full p-4 text-red-500">
                    <h1 className="text-2xl font-bold mb-4">Oops! Something went wrong.</h1>
                    <p className="text-lg">We're sorry for the inconvenience. Please try refreshing the page.</p>
                </div>
            );
        }
        return this.props.children;
    }
}

// --- Lazy-loaded View Components ---
// Global views (Header, Footer) are typically NOT lazy-loaded as they are always present.
import GV_Header from '@/components/views/GV_Header.tsx';
import GV_Footer from '@/components/views/GV_Footer.tsx';

// Lazy load route-specific views for better performance
const UV_HomePage_PreferenceInput = lazy(() => import('@/components/views/UV_HomePage_PreferenceInput.tsx'));
const UV_RecommendationResults = lazy(() => import('@/components/views/UV_RecommendationResults.tsx'));
const UV_ContentDetail = lazy(() => import('@/components/views/UV_ContentDetail.tsx'));
const UV_SignUp = lazy(() => import('@/components/views/UV_SignUp.tsx'));
const UV_LogIn = lazy(() => import('@/components/views/UV_LogIn.tsx'));
const UV_UserWatchlist = lazy(() => import('@/components/views/UV_UserWatchlist.tsx'));
const UV_ProfileSettings = lazy(() => import('@/components/views/UV_ProfileSettings.tsx'));
const UV_NoResultsFound = lazy(() => import('@/components/views/UV_NoResultsFound.tsx'));

// --- Auth-related Wrapper Components ---

interface ProtectedRouteProps {
    children: React.ReactNode;
}

/**
 * A wrapper component for routes that should only be accessible by authenticated users.
 * Redirects to the login page if the user is not logged in.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const authentication_status = useAppStore((state) => state.authentication_status);
    if (!authentication_status.is_logged_in) {
        // User is not logged in, redirect to login page
        return <Navigate to="/login" replace />;
    }
    return <>{children}</>;
};

interface PublicOnlyRouteProps {
    children: React.ReactNode;
}

/**
 * A wrapper component for routes that should only be accessible by unauthenticated users (e.g., Login, Sign Up).
 * Redirects to the home page if the user is already logged in.
 */
const PublicOnlyRoute: React.FC<PublicOnlyRouteProps> = ({ children }) => {
    const authentication_status = useAppStore((state) => state.authentication_status);
    if (authentication_status.is_logged_in) {
        // User is logged in, redirect to home page
        return <Navigate to="/" replace />;
    }
    return <>{children}</>;
};

// --- Main App Component ---

const App: React.FC = () => {
    const loadAllLookupData = useAppStore((state) => state.load_all_lookup_data);

    // Effect hook to load essential lookup data when the app component mounts.
    // This data (streaming services, genres, moods) is fundamental for the app's functionality.
    useEffect(() => {
        loadAllLookupData();
    }, [loadAllLookupData]); // Dependency array ensures it runs once on mount, or if loadAllLookupData identity changes (less likely)

    return (
        // BrowserRouter is essential for react-router-dom to work
        <BrowserRouter>
            {/* Provider for React Query setup */}
            <QueryClientProvider client={queryClient}>
                {/* Main application container, using Tailwind for sticky footer layout */}
                <div className="flex flex-col min-h-screen bg-gray-900 text-white">
                    {/* Global Header, always visible */}
                    <GV_Header />

                    {/* Main content area, takes available space and contains routes */}
                    {/* ErrorBoundary around main content to catch UI errors within routes */}
                    <ErrorBoundary>
                        <main className="flex-grow">
                            {/* Suspense for lazy-loaded routes, provide a loading fallback */}
                            <Suspense fallback={
                                <div className="flex items-center justify-center h-full text-xl py-20">
                                    Loading page...
                                </div>
                            }>
                                <Routes>
                                    {/* Publicly accessible routes */}
                                    <Route path="/" element={<UV_HomePage_PreferenceInput />} />
                                    <Route path="/recommendations" element={<UV_RecommendationResults />} />
                                    <Route path="/content/:content_uid" element={<UV_ContentDetail />} />
                                    <Route path="/no-results" element={<UV_NoResultsFound />} />

                                    {/* Routes accessible only when NOT logged in */}
                                    <Route path="/signup" element={<PublicOnlyRoute><UV_SignUp /></PublicOnlyRoute>} />
                                    <Route path="/login" element={<PublicOnlyRoute><UV_LogIn /></PublicOnlyRoute>} />

                                    {/* Routes accessible only when LOGGED IN (protected routes) */}
                                    <Route path="/watchlist" element={<ProtectedRoute><UV_UserWatchlist /></ProtectedRoute>} />
                                    <Route path="/settings" element={<ProtectedRoute><UV_ProfileSettings /></ProtectedRoute>} />

                                    {/* Fallback route for unmatched paths - can redirect to home or a 404 page */}
                                    <Route path="*" element={<Navigate to="/" replace />} />
                                </Routes>
                            </Suspense>
                        </main>
                    </ErrorBoundary>

                    {/* Global Footer, always visible */}
                    <GV_Footer />
                </div>
            </QueryClientProvider>
        </BrowserRouter>
    );
};

export default App;