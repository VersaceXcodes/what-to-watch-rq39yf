import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { ErrorBoundary } from 'react-error-boundary';
import { useAppStore } from '@/store/main';
import UV_NoResultsFound from '@/components/views/UV_NoResultsFound'; // Assuming this component exists as per UX Analysis

// --- Type Definitions (matching OpenAPI and UX Analysis) ---

// From OpenAPI schemas
interface GenreRef {
  uid: string;
  name: string;
}

interface AvailableServiceDetails {
  service_uid: string;
  name: string;
  logo_url: string;
  watch_link: string;
}

interface ContentMetadata {
  uid: string;
  title: string;
  release_year: number | null;
  content_type: 'movie' | 'tv_show';
  poster_url: string | null;
  synopsis: string | null;
  tagline: string | null;
  duration_minutes: number | null;
  number_of_seasons: number | null;
  imdb_rating: number | null;
  rotten_tomatoes_score: number | null;
  parental_rating: string | null;
  director: string | null;
  main_cast: string | null; // JSON array string
  genres: GenreRef[];
  available_on_services: AvailableServiceDetails[];
  // is_on_watchlist is specific to ContentDetailsResponse, not a core ContentMetadata
}

// Request payload for /api/v1/recommendations (from OpenAPI)
interface RecommendationRequest {
  mood_uid?: string | null;
  streaming_service_uids: string[];
  genre_uids: string[];
  min_release_year: number;
  max_release_year: number;
  preferred_duration_category: 'any' | 'short' | 'medium' | 'long';
  min_rating: number;
  preferred_content_type: 'both' | 'movie' | 'tv_show';
  parental_rating_filter_json: string;
  excluded_genre_uids?: string[] | null;
  excluded_service_uids?: string[] | null;
  page: number;
  page_size: number;
}

// Response from /api/v1/recommendations (from OpenAPI)
interface RecommendationResponse {
  success: boolean;
  recommendations: ContentMetadata[];
  total_results: number;
  page: number;
  page_size: number;
}

interface WatchlistAddItemRequest {
  content_uid: string;
}

interface SuccessResponse {
  success: boolean;
  message: string;
}

interface ErrorResponse {
  success: boolean;
  message: string;
}

// --- API Configuration ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const axios_instance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Axios Request Interceptor for Auth Token
axios_instance.interceptors.request.use(
  (config) => {
    const token = useAppStore.getState().authentication_status.auth_token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- React Query Fetch & Mutation Functions ---

const fetch_recommendations = async (
  filters: RecommendationRequest,
  page: number
): Promise<RecommendationResponse> => {
  const request_payload = { ...filters, page: page };
  const { data } = await axios_instance.post<RecommendationResponse>(
    `/api/v1/recommendations`,
    request_payload
  );
  return data;
};

const add_to_watchlist = async (content_uid: string): Promise<SuccessResponse> => {
  const { data } = await axios_instance.post<SuccessResponse>(
    `/api/v1/users/me/watchlist`,
    { content_uid }
  );
  return data;
};

// --- Fallback UI for Error Boundary ---
interface FallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

const CustomFallback: React.FC<FallbackProps> = ({ error, resetErrorBoundary }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-red-900 border border-red-700 rounded-lg shadow-md text-red-100 text-center mx-4 md:mx-auto max-w-lg mt-8">
      <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
      <p className="text-lg mb-6">We encountered an unexpected error while fetching recommendations.</p>
      <p className="font-mono text-sm break-all mb-6">{error.message}</p>
      <button
        onClick={resetErrorBoundary}
        className="px-6 py-3 bg-red-700 hover:bg-red-600 text-white rounded-md text-lg font-semibold transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-red-900"
      >
        Try Again
      </button>
      <p className="mt-4 text-sm text-red-200">If the problem persists, please contact support.</p>
    </div>
  );
};

// --- Component_RecommendationCard (Extracted from UV_RecommendationResults) ---
interface RecommendationCardProps {
  content: ContentMetadata;
  onAddToWatchlist: (content_uid: string) => void;
  onWatchNow: (watch_link: string) => void;
  onDismiss: (content_uid: string) => void;
  isLoggedIn: boolean;
  isAddingToWatchlist: boolean;
}

const get_rating_display = (contentType: string, imdbRating: number | null, rtScore: number | null): string => {
  if (contentType === 'movie' || contentType === 'tv_show') {
    const ratings = [];
    if (imdbRating !== null) ratings.push(`IMDb: ${imdbRating}/10`);
    if (rtScore !== null) ratings.push(`Rotten Tomatoes: ${rtScore}%`);
    return ratings.join(' | ');
  }
  return '';
};

const get_duration_display = (contentType: string, durationMinutes: number | null, numberOfSeasons: number | null): string => {
  if (contentType === 'movie' && durationMinutes !== null) {
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return `${hours}h ${minutes}m`;
  } else if (contentType === 'tv_show' && numberOfSeasons !== null) {
    return `${numberOfSeasons} Season${numberOfSeasons > 1 ? 's' : ''}`;
  }
  return '';
};

const Component_RecommendationCard: React.FC<RecommendationCardProps> = ({
  content,
  onAddToWatchlist,
  onWatchNow,
  onDismiss,
  isLoggedIn,
  isAddingToWatchlist,
}) => {
  return (
    <div
      key={content.uid}
      className="bg-gray-800 rounded-lg shadow-lg overflow-hidden flex flex-col transform transition-transform duration-200 hover:scale-105 hover:shadow-2xl"
    >
      {content.poster_url && (
        <img
          src={content.poster_url}
          alt={`${content.title} poster`}
          className="w-full h-80 object-cover object-center"
          onError={(e) => { (e.target as HTMLImageElement).src = 'https://picsum.photos/400/600?random=1'; }}
        />
      )}
      <div className="p-4 flex flex-col flex-grow">
        <h2 className="text-xl font-bold text-white mb-2 line-clamp-2">
          {content.title} ({content.release_year})
        </h2>
        <p className="text-sm text-gray-400 mb-2">
          <span className="bg-purple-700 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full mr-2 uppercase">
            {content.content_type === 'movie' ? 'Movie' : 'TV Show'}
          </span>
          {get_duration_display(content.content_type, content.duration_minutes, content.number_of_seasons)}
        </p>
        {content.tagline && <p className="text-gray-300 text-sm italic mb-2 line-clamp-1">"{content.tagline}"</p>}
        <p className="text-gray-300 text-sm mb-3">
          {get_rating_display(content.content_type, content.imdb_rating, content.rotten_tomatoes_score)}
        </p>
        <p className="text-gray-400 text-sm mb-4 line-clamp-3">
          {content.synopsis || 'No synopsis available.'}
        </p>

        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {content.genres.map((genre) => (
            <span key={genre.uid} className="bg-gray-700 text-gray-200 px-2 py-1 rounded">
              {genre.name}
            </span>
          ))}
        </div>

        <div className="mt-auto pt-4 border-t border-gray-700">
          <p className="text-sm text-gray-400 mb-2">Available On:</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {content.available_on_services.length > 0 ? (
              content.available_on_services.map((service) => (
                <img
                  key={service.service_uid}
                  src={service.logo_url}
                  alt={service.name}
                  title={service.name}
                  className="h-6 w-6 object-contain rounded"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} // Hide broken images
                />
              ))
            ) : (
              <span className="text-gray-500 text-sm">Not found on your selected services.</span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onWatchNow(content.available_on_services[0]?.watch_link || '#')}
              disabled={!content.available_on_services.length}
              className="flex-1 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-md font-semibold text-sm transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Watch Now
            </button>
            <Link
              to={`/content/${content.uid}`}
              className="flex-1 text-center px-4 py-2 border border-gray-600 hover:border-gray-500 text-gray-200 rounded-md font-semibold text-sm transition-colors duration-200"
            >
              More Details
            </Link>
            <button
              onClick={() => onAddToWatchlist(content.uid)}
              title={isLoggedIn ? "Add to Watchlist" : "Log in to add to Watchlist"}
              disabled={isAddingToWatchlist || !isLoggedIn}
              className="p-2 border border-gray-600 hover:border-gray-500 rounded-md text-gray-200 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggedIn ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              )}
            </button>
            <button
              onClick={() => onDismiss(content.uid)}
              title="Not for Me (hide for this session)"
              className="p-2 border border-gray-600 hover:border-gray-500 rounded-md text-gray-200 transition-colors duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- UV_RecommendationResults Component ---
const UV_RecommendationResults: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    authentication_status,
    current_recommendation_filters,
    show_notification,
    set_current_recommendation_filters,
  } = useAppStore(
    (state) => ({
      authentication_status: state.authentication_status,
      current_recommendation_filters: state.current_recommendation_filters,
      show_notification: state.show_notification,
      set_current_recommendation_filters: state.set_current_recommendation_filters,
    })
  );

  // Initialize page number from URL search params, default to 1
  const initial_page = parseInt(searchParams.get('page') || '1', 10);
  const [page, set_page] = useState<number>(initial_page);

  // Keep track of content UIDs dismissed by the user in the current session
  const [hidden_content_uids_session, set_hidden_content_uids_session] = useState<Set<string>>(new Set());

  // Effect to sync URL page param with component state
  useEffect(() => {
    if (page !== initial_page) {
      setSearchParams({ page: page.toString() });
    }
  }, [page, initial_page, setSearchParams]);

  // If current_recommendation_filters is null (e.g., direct access without prior search),
  // navigate back to home to ensure filters are set.
  useEffect(() => {
    if (!current_recommendation_filters) {
      // Potentially load from localStorage for guest user persistence or redirect
      // For MVP, we redirect to ensure filters are set by UV_HomePage_PreferenceInput
      show_notification("Please select your preferences to get recommendations.", "info");
      navigate('/');
    }
  }, [current_recommendation_filters, navigate, show_notification]);

  const {
    data: recommendations_data,
    isLoading,
    isError,
    error,
    refetch, // Allows manual refetching for "Get More Recommendations"
  } = useQuery<RecommendationResponse, Error>({
    queryKey: ['recommendations', { filters: current_recommendation_filters, page }],
    queryFn: () => {
      if (!current_recommendation_filters) {
        // This case should be handled by the useEffect above, but for type safety
        throw new Error('Recommendation filters are not set.');
      }
      return fetch_recommendations(current_recommendation_filters, page);
    },
    enabled: !!current_recommendation_filters, // Only enable query if filters are present
    staleTime: 5 * 60 * 1000, // Data considered fresh for 5 minutes
    keepPreviousData: false, // Ensures new page replaces old data immediately
  });

  // Filter out hidden content from the displayed list
  const filtered_recommendations = recommendations_data?.recommendations.filter(
    (rec) => !hidden_content_uids_session.has(rec.uid)
  ) || [];

  const add_to_watchlist_mutation = useMutation<SuccessResponse, AxiosError<ErrorResponse>, string>({
    mutationFn: add_to_watchlist,
    onSuccess: (data) => {
      show_notification(data.message || 'Content added to watchlist!', 'success');
      // Invalidate queries that fetch watchlist to reflect changes
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      // Optionally, update the specific card's state to reflect it's on watchlist,
      // but for MVP, a simple notification is sufficient.
    },
    onError: (error_data) => {
      const msg = error_data.response?.data?.message || 'Failed to add to watchlist.';
      show_notification(msg, 'error');
    },
  });

  const handle_add_to_watchlist = (content_uid: string) => {
    if (!authentication_status.is_logged_in) {
      show_notification('Please log in or sign up to add items to your watchlist.', 'info');
      navigate('/login'); // Redirect to login after info message
      return;
    }
    if (!add_to_watchlist_mutation.isLoading) {
      add_to_watchlist_mutation.mutate(content_uid);
    }
  };

  const handle_watch_now = (watch_link: string) => {
    window.open(watch_link, '_blank');
  };

  const handle_dismiss_content = (content_uid: string) => {
    set_hidden_content_uids_session((prev) => new Set(prev.add(content_uid)));
  };

  const handle_get_more_recommendations = () => {
    // Increment page for "reroll"
    set_page((prev_page) => prev_page + 1);
    // React Query will refetch because `page` in `queryKey` changed
    set_hidden_content_uids_session(new Set()); // Reset dismissed items for new page
  };

  const handle_refine_search = () => {
    // Clear current filters in global state to allow UV_HomePage_PreferenceInput to initialize
    // from persisted preferences/localStorage, or if it has current filter tracking, it will load that.
    // For now, setting to null ensures UV_HomePage_PreferenceInput knows user wants to "start fresh" with current filters.
    set_current_recommendation_filters(null); // Signal to home page to re-init filters
    navigate('/');
  };

  // --- Render Logic ---
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-160px)]">
        <div className="animate-spin rounded-full h-20 w-20 border-t-2 border-b-2 border-purple-500"></div>
        <p className="ml-4 text-xl text-gray-400">Fetching your personalized recommendations...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={CustomFallback} onReset={() => queryClient.refetchQueries(['recommendations'])}>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-center mb-6 sm:mb-10 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
          Your CineCrib Recommendations
        </h1>

        {isError && (
          <div className="bg-red-800 p-4 rounded-md text-red-100 mb-6">
            <p className="font-semibold">Error: {error?.message || 'Failed to load recommendations.'}</p>
            <p className="text-sm">Please try refining your search or refreshing the page.</p>
          </div>
        )}

        {filtered_recommendations.length === 0 && !isLoading && !isError ? (
          <UV_NoResultsFound />
        ) : (
          <>
            <div className="flex flex-col sm:flex-row justify-center sm:justify-between items-center mb-8 gap-4 px-4">
              <button
                onClick={handle_refine_search}
                className="w-full sm:w-auto px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-lg font-semibold transition duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              >
                Refine Search
              </button>
              <button
                onClick={handle_get_more_recommendations}
                className="w-full sm:w-auto px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg text-lg font-semibold transition duration-200 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              >
                Get More Recommendations
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered_recommendations.map((content) => (
                <Component_RecommendationCard
                  key={content.uid}
                  content={content}
                  onAddToWatchlist={handle_add_to_watchlist}
                  onWatchNow={handle_watch_now}
                  onDismiss={handle_dismiss_content}
                  isLoggedIn={authentication_status.is_logged_in}
                  isAddingToWatchlist={add_to_watchlist_mutation.isLoading}
                />
              ))}
            </div>

            {/* Optional: Add a subtle loading spinner for "Get More Recommendations" if needed */}
            {isLoading && (
               <div className="flex justify-center items-center py-8">
               <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
               <p className="ml-4 text-gray-400">Loading more recommendations...</p>
             </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default UV_RecommendationResults;