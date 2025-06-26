import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios, { AxiosError } from 'axios';
import { useAppStore, axios_instance } from '@/store/main';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';
import { PlayIcon, HeartIcon, ArrowLeftIcon, TvIcon, FilmIcon } from '@heroicons/react/24/solid';

// Assuming the axios_instance is now exported from the main store (Fix for ISSUE-002)
import { useAppStore } from '@/store/main';

// --- Type Definitions (Extending OpenAPI Schemas) ---
// These are defined here for direct use in this component.
// More complex shared types should ideally reside in a central types file.

interface GenreRef {
  uid: string;
  name: string;
}

interface AvailableServiceDetails {
  service_uid: string;
  name: string;
  logo_url: string | null; // Fix for ISSUE-001: Added nullability
  watch_link: string;
}

interface ContentMetadata {
  uid: string;
  external_api_id?: string;
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
  is_on_watchlist?: boolean; // Only present for authenticated requests from backend
}

interface ContentDetailsResponse {
  success: boolean;
  content: ContentMetadata;
}

interface AddRemoveWatchlistPayload {
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

// --- Constants ---
// Important: Ensure VITE_API_BASE_URL is defined in your .env file for Vite
// Removed direct API_BASE_URL constant as axios_instance handles it.
// This key should be consistently used when saving/retrieving the user's selected services.
// UV_HomePage_PreferenceInput or UV_RecommendationResults should be responsible for saving this.
const USER_FILTERED_SERVICES_STORAGE_KEY = 'cineCribUserFilteredServices';

// --- Utility Functions ---

/**
 * Formats duration in minutes to human-readable string (e.g., "1h 45m").
 */
const format_duration = (minutes: number | null): string => {
  if (minutes === null || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const remaining_minutes = minutes % 60;
  let result = '';
  if (hours > 0) result += `${hours}h`;
  if (remaining_minutes > 0) result += ` ${remaining_minutes}m`;
  return result.trim();
};

/**
 * Formats IMDb and Rotten Tomatoes ratings.
 */
const get_rating_display = (imdb: number | null, rt: number | null): string => {
  const ratings: string[] = [];
  if (imdb !== null) ratings.push(`${imdb.toFixed(1)}/10 IMDb`);
  if (rt !== null) ratings.push(`${rt}% Rotten Tomatoes`);
  return ratings.join(', ');
};

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-950 text-red-400">
      <h2 className="text-2xl font-bold mb-4">Oops! Something went wrong.</h2>
      <p className="text-lg text-center mb-6">
        We're sorry, but there was an unexpected error displaying this content.
      </p>
      <pre className="p-4 bg-gray-800 rounded-lg text-sm text-gray-300 overflow-auto max-w-lg mb-6">
        {error.message}
      </pre>
      <button
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition duration-200"
        onClick={resetErrorBoundary}
      >
        Try again
      </button>
      <Link to="/" className="text-blue-400 hover:underline mt-4">
        Go back to recommendations
      </Link>
    </div>
  );
}

const UV_ContentDetail: React.FC = () => {
  const { content_uid } = useParams<{ content_uid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { authentication_status, show_notification } = useAppStore(state => ({
    authentication_status: state.authentication_status,
    show_notification: state.show_notification,
  }));

  // Fetch content details
  const fetch_content_details = async (uid: string): Promise<ContentMetadata> => {
    try {
      // Fix for ISSUE-002: Using axios_instance directly, relying on its interceptors for auth
      const { data } = await axios_instance.get<ContentDetailsResponse>(`/api/v1/content/${uid}`);
      if (!data.success) {
        // Assuming an error response will have a 'message' field
        throw new Error((data as unknown as ErrorResponse).message || "Failed to fetch content details with unknown error.");
      }
      return data.content;
    } catch (err: unknown) { // Explicitly typing error as unknown for safety
      console.error("Error fetching content details:", err);
      // Re-throw to be caught by React Query's error handling
      if (axios.isAxiosError(err)) {
        throw err;
      } else if (err instanceof Error) {
        throw err;
      } else {
        // Fallback for truly unknown error types
        throw new Error('An unexpected error occurred.');
      }
    }
  };

  const { data: content, isLoading, isError, error } = useQuery<ContentMetadata, AxiosError, ContentMetadata, (string | null | undefined)[]>({
    // Fix for ISSUE-005: Added authentication_status.auth_token to queryKey to ensure re-fetch on auth changes
    queryKey: ['content', content_uid, authentication_status.auth_token],
    queryFn: () => {
      if (!content_uid) throw new Error('Content UID is missing.');
      return fetch_content_details(content_uid);
    },
    enabled: !!content_uid, // Only run query if content_uid is available
    staleTime: 1000 * 60 * 5, // 5 minutes
    cacheTime: 1000 * 60 * 30, // 30 minutes
  });

  // Watchlist Mutations
  const add_watchlist_mutation = useMutation<SuccessResponse, AxiosError, AddRemoveWatchlistPayload>({
    mutationFn: async (payload) => {
      // Fix for ISSUE-002: Using axios_instance directly, no manual headers needed
      const { data } = await axios_instance.post<SuccessResponse>(`/api/v1/users/me/watchlist`, payload);
      return data;
    },
    onSuccess: () => {
      show_notification('Added to watchlist!', 'success');
      // Invalidate queries to refetch content details (to update is_on_watchlist)
      // and watchlist (to update the watchlist page if user navigates there)
      queryClient.invalidateQueries({ queryKey: ['content', content_uid] });
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: (err: unknown) => {
      let error_message = 'Failed to add to watchlist.';
      if (axios.isAxiosError(err) && err.response?.data) {
        error_message = (err.response.data as ErrorResponse).message || error_message;
      } else if (err instanceof Error) {
        error_message = err.message;
      }
      show_notification(error_message, 'error');
    },
  });

  const remove_watchlist_mutation = useMutation<SuccessResponse, AxiosError, string>({
    mutationFn: async (uid) => {
      // Fix for ISSUE-002: Using axios_instance directly, no manual headers needed
      const { data } = await axios_instance.delete<SuccessResponse>(`/api/v1/users/me/watchlist/${uid}`);
      return data;
    },
    onSuccess: () => {
      show_notification('Removed from watchlist!', 'success');
      // Invalidate queries as above
      queryClient.invalidateQueries({ queryKey: ['content', content_uid] });
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: (err: unknown) => {
      let error_message = 'Failed to remove from watchlist.';
      if (axios.isAxiosError(err) && err.response?.data) {
        error_message = (err.response.data as ErrorResponse).message || error_message;
      } else if (err instanceof Error) {
        error_message = err.message;
      }
      show_notification(error_message, 'error');
    },
  });

  const handle_add_to_watchlist = () => {
    if (content_uid && authentication_status.is_logged_in) {
      add_watchlist_mutation.mutate({ content_uid });
    }
  };

  const handle_remove_from_watchlist = () => {
    if (content_uid && authentication_status.is_logged_in) {
      remove_watchlist_mutation.mutate(content_uid);
    }
  };

  const handle_watch_now = (link: string) => {
    if (link) {
      window.open(link, '_blank');
    }
  };

  // Retrieve user's selected streaming services from localStorage for filtering display
  const user_selected_services_raw = localStorage.getItem(USER_FILTERED_SERVICES_STORAGE_KEY);
  let user_selected_service_uids: string[] = [];
  try {
    if (user_selected_services_raw) {
        user_selected_service_uids = JSON.parse(user_selected_services_raw);
        // Ensure it's an array of strings
        if (!Array.isArray(user_selected_service_uids) || !user_selected_service_uids.every(s => typeof s === 'string')) {
            user_selected_service_uids = []; // Reset if invalid format
        }
    }
  } catch (e) {
    console.error("Failed to parse user selected services from localStorage:", e);
    user_selected_service_uids = [];
  }

  // Filter available services based on user's selected preferences
  const filtered_available_services = content?.available_on_services.filter(service =>
    user_selected_service_uids.includes(service.service_uid)
  ) || [];

  // Fallback for poster image if none provided
  const primary_poster_url = content?.poster_url || "https://picsum.photos/400/600?random=1";

  // Cast array parsing
  let main_cast_array: string[] = [];
  // Fix for ISSUE-003: Added null check before JSON.parse
  try {
    if (content?.main_cast) {
      main_cast_array = JSON.parse(content.main_cast);
    }
  } catch (e) {
    console.error("Failed to parse main_cast:", e);
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-8 relative">
        <button
          onClick={() => navigate(-1)} // Go back to the previous page
          className="absolute top-4 left-4 sm:top-8 sm:left-8 z-10 p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition"
          aria-label="Go back"
        >
          <ArrowLeftIcon className="h-6 w-6 text-white" />
        </button>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] animate-pulse">
             <div className="bg-gray-700 h-64 w-48 rounded-lg mb-4"></div>
             <div className="bg-gray-700 h-8 w-60 rounded mb-2"></div>
             <div className="bg-gray-700 h-5 w-40 rounded"></div>
             <p className="mt-4 text-gray-400">Loading content details...</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] text-red-500">
            <h2 className="text-xl font-semibold mb-2">Error loading content</h2>
            <p className="text-gray-400 text-center">
              {(error as AxiosError)?.response?.status === 404 // Cast to AxiosError for specific property access
                ? "This content could not be found. It might have been removed or never existed."
                : `An error occurred: ${error?.message || 'Unknown error'}. Please try again.`}
            </p>
            <p className="text-gray-400 text-sm mt-2">
              If the problem persists, please check your network connection.
            </p>
            <Link to="/" className="text-blue-400 hover:underline mt-4">
              Return to Home
            </Link>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto py-8 lg:py-12">
            <div className="flex flex-col md:flex-row gap-8 lg:gap-12 items-start">
              {/* Poster/Image Section */}
              <div className="flex-shrink-0 w-full md:w-1/3 lg:w-1/4 rounded-lg overflow-hidden shadow-2xl">
                <img
                  src={primary_poster_url}
                  alt={`${content?.title} poster`}
                  className="w-full h-auto object-cover max-h-[600px] object-top"
                />
              </div>

              {/* Details Section */}
              <div className="flex-grow w-full md:w-2/3 lg:w-3/4">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-3 leading-tight">
                  {content?.title}
                  {content?.release_year && (
                    <span className="text-gray-400 text-xl sm:text-2xl lg:text-3xl ml-3">
                      ({content.release_year})
                    </span>
                  )}
                </h1>

                {/* Content Type, Ratings & Duration */}
                <div className="flex items-center text-gray-300 text-lg mb-4 flex-wrap gap-y-2">
                  <span className="flex items-center bg-gray-800 text-sm px-3 py-1 rounded-full mr-3">
                    {content?.content_type === 'movie' ? (
                      <FilmIcon className="h-4 w-4 mr-1 text-purple-400" />
                    ) : (
                      <TvIcon className="h-4 w-4 mr-1 text-green-400" />
                    )}
                    {content?.content_type === 'movie' ? 'Movie' : 'TV Series'}
                  </span>
                  {content?.parental_rating && (
                    <span className="bg-gray-700 text-xs px-2 py-1 rounded mr-3 uppercase font-medium">
                      {content.parental_rating}
                    </span>
                  )}
                  {content?.duration_minutes !== null && content?.content_type === 'movie' && (
                    <span className="text-sm mr-3">
                      {format_duration(content.duration_minutes)}
                    </span>
                  )}
                  {content?.number_of_seasons !== null && content?.content_type === 'tv_show' && (
                    <span className="text-sm mr-3">
                      {content.number_of_seasons > 1 ? `${content.number_of_seasons} seasons` : `${content.number_of_seasons} season`}
                    </span>
                  )}
                  {get_rating_display(content?.imdb_rating, content?.rotten_tomatoes_score) && (
                    <span className="text-sm">
                      {get_rating_display(content?.imdb_rating, content?.rotten_tomatoes_score)}
                    </span>
                  )}
                </div>

                {/* Tagline */}
                {content?.tagline && (
                  <p className="text-gray-400 italic text-lg mb-6 leading-relaxed">
                    "{content.tagline}"
                  </p>
                )}

                {/* Synopsis */}
                {content?.synopsis && (
                  <p className="text-gray-200 text-base lg:text-lg mb-6 leading-relaxed">
                    {content.synopsis}
                  </p>
                )}

                {/* Genres */}
                {content && content.genres.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-md sm:text-lg font-semibold text-gray-400 mb-2">Genres:</h3>
                    <div className="flex flex-wrap gap-2">
                      {content.genres.map(genre => (
                        <span key={genre.uid} className="bg-blue-600/20 text-blue-300 text-sm px-3 py-1 rounded-full">
                          {genre.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Director & Cast */}
                <div className="mb-6">
                  {content?.director && (
                    <h3 className="text-md sm:text-lg font-semibold text-gray-400 mb-2">
                      <span className="text-gray-300">Director:</span> {content.director}
                    </h3>
                  )}
                  {main_cast_array.length > 0 && (
                    <h3 className="text-md sm:text-lg font-semibold text-gray-400">
                      <span className="text-gray-300">Cast:</span> {main_cast_array.slice(0, 3).join(', ')}{main_cast_array.length > 3 ? '...' : ''}
                    </h3>
                  )}
                </div>

                {/* Available On Services */}
                <div className="mb-6">
                  <h3 className="text-md sm:text-lg font-semibold text-gray-400 mb-2">Available On:</h3>
                  {filtered_available_services.length > 0 ? (
                    <div className="flex flex-wrap gap-4 items-center">
                      {filtered_available_services.map(service => (
                        // Defensive rendering for ISSUE-001: Check for service.logo_url
                        <img
                          key={service.service_uid}
                          src={service.logo_url || "https://via.placeholder.com/32x32?text=N/A"} // Placeholder for null logo
                          alt={service.name}
                          className="h-8 w-8 object-contain rounded-full shadow-md"
                          title={service.name}
                        />
                      ))}
                    </div>
                  ) : (
                    // Fix for ISSUE-004: Correctly placed conditional message
                    user_selected_service_uids.length > 0 && (
                      <p className="text-gray-500 text-sm">
                          Not available on your selected streaming services.
                      </p>
                    )
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 mt-8">
                  {filtered_available_services.length > 0 && (
                    <button
                      onClick={() => handle_watch_now(filtered_available_services[0].watch_link)}
                      className="flex items-center justify-center bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition duration-200 w-full sm:w-auto"
                    >
                      <PlayIcon className="h-5 w-5 mr-2" /> Watch Now
                    </button>
                  )}

                  {authentication_status.is_logged_in ? (
                    content?.is_on_watchlist ? (
                      <button
                        onClick={handle_remove_from_watchlist}
                        className={`flex items-center justify-center border border-gray-600 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition duration-200 w-full sm:w-auto
                                  ${remove_watchlist_mutation.isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={remove_watchlist_mutation.isLoading}
                      >
                        <HeartIcon className="h-5 w-5 mr-2 text-red-400" />
                        {remove_watchlist_mutation.isLoading ? 'Removing...' : 'On Watchlist'}
                      </button>
                    ) : (
                      <button
                        onClick={handle_add_to_watchlist}
                        className={`flex items-center justify-center border border-yellow-500 text-yellow-500 hover:text-white hover:bg-yellow-500 font-semibold py-3 px-6 rounded-lg shadow-lg transition duration-200 w-full sm:w-auto
                                  ${add_watchlist_mutation.isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={add_watchlist_mutation.isLoading}
                      >
                        <HeartIcon className="h-5 w-5 mr-2" />
                        {add_watchlist_mutation.isLoading ? 'Adding...' : 'Add to Watchlist'}
                      </button>
                    )
                  ) : (
                    <Link
                      to="/login"
                      className="flex items-center justify-center border border-gray-600 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition duration-200 w-full sm:w-auto"
                    >
                      <HeartIcon className="h-5 w-5 mr-2" /> Login to Add to Watchlist
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default UV_ContentDetail;