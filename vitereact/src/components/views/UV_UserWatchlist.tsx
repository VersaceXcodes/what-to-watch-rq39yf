import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios, { AxiosInstance } from 'axios';
import { useAppStore } from '@/store/main';

// --- Type Definitions (from OpenAPI and PRD/FRD) ---

// Define types based on OpenAPI ContentMetadata schema structure
interface GenreRef {
  uid: string;
  name: string;
}

interface AvailableServiceDetails {
  service_uid: string;
  name: string;
  logo_url: string | null;
  watch_link: string | null;
}

interface ContentMetadata {
  uid: string;
  title: string;
  release_year: number | null;
  content_type: "movie" | "tv_show";
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
}

// Watchlist item extends ContentMetadata with added_at
interface WatchlistItem extends ContentMetadata {
  added_at: string; // ISO 8601 timestamp string
}

// API Response Types
interface WatchlistGetResponse {
  success: boolean;
  watchlist: WatchlistItem[];
}

interface SuccessResponse {
  success: boolean;
  message: string;
}

// --- Axios Instance with Authentication Interceptor ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    // Ensure the auth_token is always the most current from the Zustand store
    const token = useAppStore.getState().authentication_status.auth_token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// --- API Functions for React Query ---

const fetchWatchlist = async (): Promise<WatchlistItem[]> => {
  const { data } = await api.get<WatchlistGetResponse>('/api/v1/users/me/watchlist');
  return data.watchlist;
};

const removeWatchlistItem = async (contentUid: string): Promise<SuccessResponse> => {
  const { data } = await api.delete<SuccessResponse>(`/api/v1/users/me/watchlist/${contentUid}`);
  return data;
};

// --- UV_UserWatchlist Component ---

const UV_UserWatchlist: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Using 'showNotification' for camelCase consistency
  const showNotification = useAppStore((state) => state.show_notification);

  // Fetch Watchlist with React Query
  const {
    data: watchlistItems,
    isLoading: isLoadingWatchlist,
    isError: isErrorWatchlist,
    error: watchlistError,
  } = useQuery<WatchlistItem[], Error>({
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
    staleTime: 5 * 60 * 1000, // Data considered fresh for 5 minutes
  });

  // Mutation for removing item from watchlist
  const removeMutation = useMutation<SuccessResponse, Error, string>({
    mutationFn: removeWatchlistItem,
    onSuccess: () => {
      // Invalidate and refetch the watchlist query to update the UI
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      showNotification('Content removed from watchlist successfully!', 'success');
    },
    onError: (error) => {
      showNotification(`Failed to remove item: ${error.message}`, 'error');
      console.error('Error removing from watchlist:', error);
    },
  });

  const handleRemoveFromWatchlist = (contentUid: string) => {
    removeMutation.mutate(contentUid);
  };

  const handleWatchNow = (watchLink: string | null) => {
    if (watchLink) {
      window.open(watchLink, '_blank');
    } else {
      showNotification('No watch link available for this content.', 'warning');
    }
  };

  const handleNavigateToRecommendations = () => {
    navigate('/');
  };

  // Derived state for empty watchlist
  const isEmpty = !isLoadingWatchlist && !isErrorWatchlist && (watchlistItems?.length === 0);

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-extrabold text-white mb-8 text-center drop-shadow-lg">My Watchlist</h1>

        {isLoadingWatchlist && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="bg-gray-800 rounded-lg shadow-lg overflow-hidden animate-pulse">
                <div className="w-full h-72 bg-gray-700"></div> {/* Placeholder for poster */}
                <div className="p-4">
                  <div className="h-6 bg-gray-600 rounded w-3/4 mb-2"></div> {/* Placeholder for title */}
                  <div className="h-4 bg-gray-600 rounded w-1/2 mb-4"></div> {/* Placeholder for metadata */}
                  <div className="h-4 bg-gray-500 rounded mb-2"></div> {/* Placeholder for synopsis */}
                  <div className="h-4 bg-gray-500 rounded w-2/3"></div>
                  <div className="mt-4 flex space-x-2">
                    <div className="h-10 bg-gray-600 rounded w-1/2"></div> {/* Placeholder for watch now */}
                    <div className="h-10 bg-gray-600 rounded w-1/2"></div> {/* Placeholder for remove */}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {isErrorWatchlist && (
          <div className="bg-red-900 border border-red-700 text-white px-4 py-3 rounded relative text-center" role="alert">
            <strong className="font-bold">Error!</strong>
            <span className="block sm:inline">{watchlistError?.message || 'Failed to load watchlist.'}</span>
            <p className="mt-2 text-sm">Please try again later. If the problem persists, ensure you are logged in.</p>
          </div>
        )}

        {isEmpty && (
          <div className="text-center py-16">
            <p className="text-xl text-gray-400 mb-6">"Nothing to watch? Add movies and TV shows to your watchlist!"</p>
            <p className="text-lg text-gray-500 mb-8">Your watchlist is currently empty.</p>
            <button
              onClick={handleNavigateToRecommendations}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75"
            >
              Start browsing recommendations
            </button>
          </div>
        )}

        {watchlistItems && watchlistItems.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {watchlistItems.map((item) => (
              <div key={item.uid} className="bg-gray-800 rounded-lg shadow-xl overflow-hidden flex flex-col transform hover:scale-102 transition-transform duration-200">
                <Link to={`/content/${item.uid}`} className="relative block h-72 overflow-hidden group">
                  <img
                    src={item.poster_url || `https://picsum.photos/400/600?random=${item.uid.charCodeAt(0)}`}
                    alt={item.title}
                    className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-80"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4 text-white font-bold text-lg text-center">
                    <span className="p-2 bg-black bg-opacity-50 rounded">More Details</span>
                  </div>
                </Link>
                <div className="p-4 flex flex-col flex-grow">
                  <h2 className="text-xl font-bold text-white mb-1 leading-tight">{item.title}</h2>
                  <p className="text-sm text-gray-400 mb-2">
                    {item.release_year && `${item.release_year} | `}
                    <span className="capitalize">{item.content_type.replace('_', ' ')}</span>
                    {item.content_type === 'movie' && item.duration_minutes && item.duration_minutes > 0 && (
                      ` | ${Math.floor(item.duration_minutes / 60)}h ${item.duration_minutes % 60}m`
                    )}
                    {item.content_type === 'tv_show' && item.number_of_seasons && item.number_of_seasons > 0 && (
                      ` | ${item.number_of_seasons} Season${item.number_of_seasons > 1 ? 's' : ''}`
                    )}
                    {item.parental_rating && ` | ${item.parental_rating}`}
                  </p>
                  <p className="text-gray-300 text-sm italic mb-3 line-clamp-3">{item.synopsis}</p>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {item.imdb_rating && (
                      <span className="bg-yellow-600 px-2 py-1 rounded text-xs font-semibold text-gray-900">
                        IMDb {item.imdb_rating}
                      </span>
                    )}
                    {item.rotten_tomatoes_score && (
                      <span className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-white">
                        RT {item.rotten_tomatoes_score}%
                      </span>
                    )}
                    {item.genres.slice(0, 2).map((genre) => ( // Display first 2 genres
                      <span key={genre.uid} className="bg-gray-700 px-2 py-1 rounded text-xs text-gray-300">
                        {genre.name}
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-1 mb-4 flex-wrap">
                    {item.available_on_services.map((service) => (
                      service.logo_url && service.watch_link && (
                        <img
                          key={service.service_uid}
                          src={service.logo_url}
                          alt={service.name}
                          className="h-6 w-6 rounded-full object-contain cursor-pointer transition-transform hover:scale-110"
                          title={`Watch on ${service.name}`}
                          onClick={() => handleWatchNow(service.watch_link)}
                        />
                      )
                    ))}
                  </div>

                  <div className="mt-auto flex gap-2">
                    {item.available_on_services.length > 0 ? (
                      <button
                        onClick={() => handleWatchNow(item.available_on_services[0]?.watch_link || null)}
                        className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-md transition duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-75"
                        disabled={!item.available_on_services[0]?.watch_link}
                      >
                        Watch Now
                      </button>
                    ) : (
                      <button
                        className="flex-1 py-2 px-4 bg-gray-600 text-white font-semibold rounded-lg cursor-not-allowed"
                        disabled
                      >
                        Not Available
                      </button>
                    )}

                    <button
                      onClick={() => handleRemoveFromWatchlist(item.uid)}
                      className="py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md transition duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75"
                      aria-label="Remove from watchlist"
                      title="Remove from Watchlist"
                      disabled={removeMutation.isPending}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default UV_UserWatchlist;