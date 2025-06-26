import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios, { AxiosResponse } from 'axios';
import { useAppStore } from '@/store/main'; // Assuming this path is correct based on instructions.
import {
    MoodDetails,
    GenreRef,
    StreamingServiceDetails,
    AuthStatus,
} from '@/store/main'; // Import types from global store

// --- Type Definitions (from OpenAPI/UX Analysis) ---

interface UserPreferencesGetResponse {
    success: boolean;
    preferences: {
        default_mood_uid: string | null;
        min_release_year: number;
        max_release_year: number;
        preferred_duration_category: string;
        min_rating: number;
        preferred_content_type: string;
        parental_rating_filter_json: string; // JSON string for array ['G', 'PG-13']
        selected_streaming_services: Array<{ uid: string }>; // Only UID needed for payload
        selected_genres: Array<{ uid: string }>; // Only UID needed for payload
        excluded_genres: Array<{ uid: string }>;
        excluded_streaming_services: Array<{ uid: string }>;
    };
}

interface RecommendationRequestPayload {
    mood_uid: string | null;
    streaming_service_uids: string[];
    genre_uids: string[];
    min_release_year: number;
    max_release_year: number;
    preferred_duration_category: string;
    min_rating: number;
    preferred_content_type: string;
    parental_rating_filter_json: string;
    excluded_genre_uids: string[];
    excluded_service_uids: string[];
    page: number;
    page_size: number;
}
interface RecommendationResponse {
    success: boolean;
    recommendations: any[]; // ContentMetadata, for now any
    total_results: number;
    page: number;
    page_size: number;
}

interface ErrorResponse {
    success: boolean;
    message: string;
}

// --- Constants ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const LOCAL_STORAGE_GUEST_PREFERENCES_KEY = 'cinecrib-guest-preferences';

// Min/Max years for the range filter. Actual current year for max.
const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR_DEFAULT = 1900;

// Parental Rating Options (from FRD G8.0 examples)
const PARENTAL_RATING_OPTIONS = [
    'G',
    'PG',
    'PG-13',
    'R',
    'NC-17',
    'TV-Y',
    'TV-G',
    'TV-PG',
    'TV-14',
    'TV-MA',
];

// --- Internal Axios Instance (Configured in Global Store with Interceptors) ---
// For consistency, we reuse the axios instance that the global store sets up
// for auth headers etc. We can't directly `import axios_instance` from the store
// since it's not exported, so we create a new one, ensuring it's not re-created
// on every render and explicitly set the baseURL. For request interceptors,
// we'd typically need to apply them here again or ensure global interceptors
// configured on the `axios` default export are robust. For this task,
// let's assume `axios` directly or a similarly configured instance is used.
// If the global store's `axios_instance` was exported, it would be preferred.
// As it's not, we'll create a local one and ensure baseURL. For auth interceptors,
// the App component sets up `axios_instance.interceptors.request.use` from the store.
// This design note clarifies the choice for the current scope.
const axios_client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});


// Helper function to debounce an action
function debounce<T extends (...args: any[]) => void>(func: T, delay: number): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => func(...args), delay);
    };
}


const UV_HomePage_PreferenceInput: React.FC = () => {
    const navigate = useNavigate();

    // --- Global State Access ---
    const {
        authentication_status,
        lookup_data,
        set_global_loading,
        show_notification,
    } = useAppStore((state) => ({
        authentication_status: state.authentication_status,
        lookup_data: state.lookup_data,
        set_global_loading: state.set_global_loading,
        show_notification: state.show_notification,
    }));

    // --- Local Component State for Preferences ---
    const [selected_mood_uid, set_selected_mood_uid] = useState<string | null>(null);
    const [selected_service_uids, set_selected_service_uids] = useState<string[]>([]);
    const [selected_genre_uids, set_selected_genre_uids] = useState<string[]>([]);
    const [min_release_year, set_min_release_year] = useState<number>(MIN_YEAR_DEFAULT);
    const [max_release_year, set_max_release_year] = useState<number>(CURRENT_YEAR);
    const [preferred_duration_category, set_preferred_duration_category] = useState<string>('any'); // 'any', 'short', 'medium', 'long'
    const [min_rating, set_min_rating] = useState<number>(0);
    const [preferred_content_type, set_preferred_content_type] = useState<string>('both'); // 'both', 'movie', 'tv_show'
    const [selected_parental_ratings, set_selected_parental_ratings] = useState<string[]>([]);
    const [excluded_genre_uids, set_excluded_genre_uids] = useState<string[]>([]);
    const [excluded_service_uids, set_excluded_service_uids] = useState<string[]>([]);

    const [is_advanced_filters_open, set_is_advanced_filters_open] = useState<boolean>(false);

    // --- State to track user_uid changes for preference reset ---
    const [prev_user_uid, set_prev_user_uid] = useState<string | null>(authentication_status.user_uid);

    // Function to reset form to default state
    const reset_form_to_defaults = useCallback(() => {
        set_selected_mood_uid(null);
        set_selected_service_uids([]);
        set_selected_genre_uids([]);
        set_min_release_year(MIN_YEAR_DEFAULT);
        set_max_release_year(CURRENT_YEAR);
        set_preferred_duration_category('any');
        set_min_rating(0);
        set_preferred_content_type('both');
        set_selected_parental_ratings([]);
        set_excluded_genre_uids([]);
        set_excluded_service_uids([]);
    }, []);

    // Effect to reset form when user_uid changes (login/logout)
    useEffect(() => {
        if (authentication_status.user_uid !== prev_user_uid) {
            reset_form_to_defaults();
            set_prev_user_uid(authentication_status.user_uid);
        }
    }, [authentication_status.user_uid, prev_user_uid, reset_form_to_defaults]);

    // --- Data Fetching: Logged-in User Preferences ---
    const { data: user_preferences, isLoading: isLoadingUserPreferences } = useQuery<
        UserPreferencesGetResponse,
        ErrorResponse
    >({
        queryKey: ['user_preferences', authentication_status.user_uid],
        queryFn: async () => {
            const token = authentication_status.auth_token;
            if (!token) {
                throw new Error("No authorization token found for logged-in user.");
            }
            const response = await axios.get(`${API_BASE_URL}/api/v1/users/me/preferences`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data;
        },
        enabled: authentication_status.is_logged_in && authentication_status.user_uid !== null,
        staleTime: Infinity,
        cacheTime: Infinity,
        onSuccess: (data) => {
            if (data.success && data.preferences) {
                const prefs = data.preferences;
                set_selected_mood_uid(prefs.default_mood_uid);
                set_selected_service_uids(prefs.selected_streaming_services.map((s) => s.uid));
                set_selected_genre_uids(prefs.selected_genres.map((g) => g.uid));
                set_min_release_year(prefs.min_release_year);
                set_max_release_year(prefs.max_release_year);
                set_preferred_duration_category(prefs.preferred_duration_category);
                set_min_rating(prefs.min_rating);
                set_preferred_content_type(prefs.preferred_content_type);
                try {
                    const parsed_parental_ratings = JSON.parse(prefs.parental_rating_filter_json);
                    set_selected_parental_ratings(parsed_parental_ratings);
                } catch (e) {
                    console.error("Failed to parse parental ratings JSON:", e);
                    set_selected_parental_ratings([]);
                }
                set_excluded_genre_uids(prefs.excluded_genres?.map(g => g.uid) || []);
                set_excluded_service_uids(prefs.excluded_streaming_services?.map(s => s.uid) || []);
            }
        },
        onError: (error) => {
            show_notification(`Failed to load saved preferences: ${error.message || 'Unknown error'}`, 'error');
        },
        refetchOnWindowFocus: false, // Prevent unnecessary refetches
    });

    // Effect to load guest preferences from localStorage when form is in default state
    useEffect(() => {
        if (!authentication_status.is_logged_in && authentication_status.user_uid === null && selected_mood_uid === null) {
            try {
                const saved_prefs_string = localStorage.getItem(LOCAL_STORAGE_GUEST_PREFERENCES_KEY);
                if (saved_prefs_string) {
                    const saved_prefs = JSON.parse(saved_prefs_string);
                    set_selected_mood_uid(saved_prefs.selected_mood_uid || null);
                    set_selected_service_uids(saved_prefs.selected_service_uids || []);
                    set_selected_genre_uids(saved_prefs.selected_genre_uids || []);
                    set_min_release_year(saved_prefs.min_release_year || MIN_YEAR_DEFAULT);
                    set_max_release_year(saved_prefs.max_release_year || CURRENT_YEAR);
                    set_preferred_duration_category(saved_prefs.preferred_duration_category || 'any');
                    set_min_rating(saved_prefs.min_rating || 0);
                    set_preferred_content_type(saved_prefs.preferred_content_type || 'both');
                    set_selected_parental_ratings(saved_prefs.selected_parental_ratings || []);
                    set_excluded_genre_uids(saved_prefs.excluded_genre_uids || []);
                    set_excluded_service_uids(saved_prefs.excluded_service_uids || []);
                }
            } catch (e) {
                console.error("Failed to load guest preferences from localStorage:", e);
                // Clear corrupted storage in case of parsing error
                localStorage.removeItem(LOCAL_STORAGE_GUEST_PREFERENCES_KEY);
            }
        }
    }, [authentication_status.is_logged_in, authentication_status.user_uid, selected_mood_uid]);

    // --- Persistence for Guest Users (localStorage) ---
    const save_local_preferences = useCallback(debounce(() => {
        if (!authentication_status.is_logged_in && authentication_status.user_uid === null) { // Only save for guests after initial load
            const current_preferences = {
                selected_mood_uid,
                selected_service_uids,
                selected_genre_uids,
                min_release_year,
                max_release_year,
                preferred_duration_category,
                min_rating,
                preferred_content_type,
                selected_parental_ratings,
                excluded_genre_uids,
                excluded_service_uids,
            };
            try {
                localStorage.setItem(LOCAL_STORAGE_GUEST_PREFERENCES_KEY, JSON.stringify(current_preferences));
            } catch (e) {
                console.error("Failed to save guest preferences to localStorage:", e);
            }
        }
    }, 500), [
        authentication_status.is_logged_in,
        authentication_status.user_uid,
        selected_mood_uid,
        selected_service_uids,
        selected_genre_uids,
        min_release_year,
        max_release_year,
        preferred_duration_category,
        min_rating,
        preferred_content_type,
        selected_parental_ratings,
        excluded_genre_uids,
        excluded_service_uids,
    ]);

    // Effect to save guest preferences
    useEffect(() => {
        save_local_preferences();
    }, [save_local_preferences]);


    // --- Handlers for Preference Changes ---

    const handle_mood_change = (uid: string) => {
        set_selected_mood_uid(uid === selected_mood_uid ? null : uid); // Toggle selection
    };

    const handle_service_toggle = (uid: string) => {
        set_selected_service_uids((prev) =>
            prev.includes(uid) ? prev.filter((s) => s !== uid) : [...prev, uid]
        );
    };

    const handle_genre_toggle = (uid: string) => {
        set_selected_genre_uids((prev) =>
            prev.includes(uid) ? prev.filter((g) => g !== uid) : [...prev, uid]
        );
    };

    const handle_exclude_service_toggle = (uid: string) => {
        set_excluded_service_uids((prev) =>
            prev.includes(uid) ? prev.filter((s) => s !== uid) : [...prev, uid]
        );
    };

    const handle_exclude_genre_toggle = (uid: string) => {
        set_excluded_genre_uids((prev) =>
            prev.includes(uid) ? prev.filter((g) => g !== uid) : [...prev, uid]
        );
    };

    const handle_min_year_change = (e: React.ChangeEvent<HTMLInputElement>) => {
        set_min_release_year(Number(e.target.value));
    };

    const handle_max_year_change = (e: React.ChangeEvent<HTMLInputElement>) => {
        set_max_release_year(Number(e.target.value));
    };

    const handle_duration_change = (e: React.ChangeEvent<HTMLInputElement>) => {
        set_preferred_duration_category(e.target.value);
    };

    const handle_min_rating_change = (e: React.ChangeEvent<HTMLSelectElement>) => {
        set_min_rating(Number(e.target.value));
    };

    const handle_content_type_change = (e: React.ChangeEvent<HTMLInputElement>) => {
        set_preferred_content_type(e.target.value);
    };

    const handle_parental_rating_toggle = (rating: string) => {
        set_selected_parental_ratings((prev) =>
            prev.includes(rating) ? prev.filter((r) => r !== rating) : [...prev, rating]
        );
    };

    // Select/Deselect All handlers
    const select_all_services = () => set_selected_service_uids(lookup_data.streaming_services.map(s => s.uid));
    const deselect_all_services = () => set_selected_service_uids([]);
    const select_all_genres = () => set_selected_genre_uids(lookup_data.genres.map(g => g.uid));
    const deselect_all_genres = () => set_selected_genre_uids([]);
    const select_all_excluded_services = () => set_excluded_service_uids(lookup_data.streaming_services.map(s => s.uid));
    const deselect_all_excluded_services = () => set_excluded_service_uids([]);
    const select_all_excluded_genres = () => set_excluded_genre_uids(lookup_data.genres.map(g => g.uid));
    const deselect_all_excluded_genres = () => set_excluded_genre_uids([]);

    // --- Recommendation Mutation ---
    const recommendation_mutation = useMutation<
        AxiosResponse<RecommendationResponse>,
        AxiosResponse<ErrorResponse>,
        RecommendationRequestPayload
    >({
        mutationFn: async (payload) => {
            const token = authentication_status.auth_token;
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            return axios.post<RecommendationResponse>(
                `${API_BASE_URL}/api/v1/recommendations`,
                payload,
                { headers }
            );
        },
        onMutate: () => {
            set_global_loading(true); // Show global loading spinner
        },
        onSuccess: (response, variables) => {
            show_notification('Recommendations fetched!', 'success');
            // Navigate to results page, passing filters state
            navigate('/recommendations', { state: { filters: variables } });
        },
        onError: (error) => {
            const error_message = error.response?.data?.message || 'Failed to get recommendations. Please try again.';
            show_notification(error_message, 'error');
            console.error('Recommendation error:', error);
        },
        onSettled: () => {
            set_global_loading(false); // Hide global loading spinner
        },
    });

    const handle_get_recommendations = (e: React.FormEvent) => {
        e.preventDefault();

        // Basic form validation
        if (selected_service_uids.length === 0) {
            show_notification('Please select at least one streaming service.', 'warning');
            return;
        }
        if (min_release_year > max_release_year) {
            show_notification('Minimum release year cannot be greater than maximum release year.', 'warning');
            return;
        }

        const payload: RecommendationRequestPayload = {
            mood_uid: selected_mood_uid,
            streaming_service_uids: selected_service_uids,
            genre_uids: selected_genre_uids,
            min_release_year: Math.max(min_release_year, MIN_YEAR_DEFAULT), // Ensure min year is not too low
            max_release_year: Math.min(max_release_year, CURRENT_YEAR + 1), // Ensure max year is not in distant future
            preferred_duration_category,
            min_rating,
            preferred_content_type,
            parental_rating_filter_json: JSON.stringify(selected_parental_ratings),
            excluded_genre_uids,
            excluded_service_uids,
            page: 1, // Start at page 1 for initial request
            page_size: 20, // Default page size for initial request
        };
        recommendation_mutation.mutate(payload);
    };

    const is_loading_data = isLoadingUserPreferences || recommendation_mutation.isPending || lookup_data.genres.length === 0;

    return (
        <>
            <div className={`container mx-auto px-4 py-8 max-w-4xl ${is_loading_data ? 'opacity-50 pointer-events-none' : ''}`}>
                <h1 className="text-4xl font-extrabold text-center text-red-600 mb-8">
                    CineCrib: Your Decision Helper
                </h1>
                <p className="text-xl text-center text-gray-300 mb-10">
                    Find your next movie or TV show in minutes!
                </p>

                <form onSubmit={handle_get_recommendations} className="space-y-8">
                    {/* Mood Selection */}
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                        <h2 className="text-2xl font-bold text-gray-100 mb-4">What's your mood?</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {lookup_data.moods.map((mood) => (
                                <button
                                    type="button"
                                    key={mood.uid}
                                    onClick={() => handle_mood_change(mood.uid)}
                                    className={`
                                        flex flex-col items-center justify-center p-3 rounded-md text-lg font-semibold
                                        transform transition-all duration-200 ease-in-out
                                        ${selected_mood_uid === mood.uid
                                            ? 'bg-red-700 text-white shadow-xl scale-105 border-2 border-red-500'
                                            : 'bg-gray-700 text-gray-200 hover:bg-gray-600 hover:scale-105 border-2 border-transparent'
                                        }
                                    `}
                                >
                                    {mood.icon_emoji && <span className="text-2xl mb-1">{mood.icon_emoji}</span>}
                                    {mood.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Streaming Services Selection */}
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                        <h2 className="text-2xl font-bold text-gray-100 mb-4">Where do you watch?</h2>
                        <div className="flex justify-end gap-2 mb-4">
                            <button type='button' onClick={select_all_services} className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition">Select All</button>
                            <button type='button' onClick={deselect_all_services} className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition">Deselect All</button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {lookup_data.streaming_services.map((service) => (
                                <div
                                    key={service.uid}
                                    className={`
                                        flex items-center p-2 rounded-md cursor-pointer transition-colors duration-200
                                        ${selected_service_uids.includes(service.uid)
                                            ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                        }
                                    `}
                                    onClick={() => handle_service_toggle(service.uid)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected_service_uids.includes(service.uid)}
                                        readOnly // Prevents direct input change, handled by parent div click
                                        className="form-checkbox h-5 w-5 text-red-600 bg-gray-900 border-gray-600 rounded focus:ring-red-500 mr-2"
                                    />
                                    {service.logo_url && (
                                        <img src={service.logo_url} alt={service.name} className="h-6 w-6 mr-2 object-contain" />
                                    )}
                                    <span className="font-medium">{service.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Genre Selection */}
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                        <h2 className="text-2xl font-bold text-gray-100 mb-4">What genres do you like?</h2>
                        <div className="flex justify-end gap-2 mb-4">
                            <button type='button' onClick={select_all_genres} className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition">Select All</button>
                            <button type='button' onClick={deselect_all_genres} className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition">Deselect All</button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                            {lookup_data.genres.map((genre) => (
                                <div
                                    key={genre.uid}
                                    className={`
                                        flex items-center p-2 rounded-md cursor-pointer transition-colors duration-200
                                        ${selected_genre_uids.includes(genre.uid)
                                            ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                        }
                                    `}
                                    onClick={() => handle_genre_toggle(genre.uid)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected_genre_uids.includes(genre.uid)}
                                        readOnly
                                        className="form-checkbox h-5 w-5 text-red-600 bg-gray-900 border-gray-600 rounded focus:ring-red-500 mr-2"
                                    />
                                    <span className="font-medium">{genre.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Advanced Filters (Collapsible) */}
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                        <button
                            type="button"
                            className="w-full text-left text-2xl font-bold text-gray-100 flex justify-between items-center mb-4"
                            onClick={() => set_is_advanced_filters_open(!is_advanced_filters_open)}
                        >
                            Advanced Filters
                            <svg
                                className={`w-6 h-6 transform transition-transform duration-300 ${is_advanced_filters_open ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {is_advanced_filters_open && (
                            <div className="space-y-6 pt-4 border-t border-gray-700">
                                {/* Release Year Range */}
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-200 mb-2">Release Year</h3>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="number"
                                            className="w-full p-2 rounded-md bg-gray-700 text-white border-gray-600 focus:border-red-500 focus:ring focus:ring-red-500 focus:ring-opacity-50"
                                            placeholder="From"
                                            value={min_release_year}
                                            onChange={handle_min_year_change}
                                            min="1900"
                                            max={CURRENT_YEAR}
                                        />
                                        <span className="text-gray-400">-</span>
                                        <input
                                            type="number"
                                            className="w-full p-2 rounded-md bg-gray-700 text-white border-gray-600 focus:border-red-500 focus:ring focus:ring-red-500 focus:ring-opacity-50"
                                            placeholder="To"
                                            value={max_release_year}
                                            onChange={handle_max_year_change}
                                            min="1900"
                                            max={CURRENT_YEAR + 1} // Allow current year + 1 for future releases
                                        />
                                    </div>
                                </div>

                                {/* Duration */}
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-200 mb-2">Duration</h3>
                                    <div className="flex flex-wrap gap-4">
                                        <label className="flex items-center text-gray-300">
                                            <input
                                                type="radio"
                                                name="duration"
                                                value="any"
                                                checked={preferred_duration_category === 'any'}
                                                onChange={handle_duration_change}
                                                className="form-radio h-5 w-5 text-red-600 bg-gray-900 border-gray-600 focus:ring-red-500"
                                            />
                                            <span className="ml-2">Any</span>
                                        </label>
                                        <label className="flex items-center text-gray-300">
                                            <input
                                                type="radio"
                                                name="duration"
                                                value="short"
                                                checked={preferred_duration_category === 'short'}
                                                onChange={handle_duration_change}
                                                className="form-radio h-5 w-5 text-red-600 bg-gray-900 border-gray-600 focus:ring-red-500"
                                            />
                                            <span className="ml-2">Short (&lt;60 min)</span>
                                        </label>
                                        <label className="flex items-center text-gray-300">
                                            <input
                                                type="radio"
                                                name="duration"
                                                value="medium"
                                                checked={preferred_duration_category === 'medium'}
                                                onChange={handle_duration_change}
                                                className="form-radio h-5 w-5 text-red-600 bg-gray-900 border-gray-600 focus:ring-red-500"
                                            />
                                            <span className="ml-2">Medium (60-120 min)</span>
                                        </label>
                                        <label className="flex items-center text-gray-300">
                                            <input
                                                type="radio"
                                                name="duration"
                                                value="long"
                                                checked={preferred_duration_category === 'long'}
                                                onChange={handle_duration_change}
                                                className="form-radio h-5 w-5 text-red-600 bg-gray-900 border-gray-600 focus:ring-red-500"
                                            />
                                            <span className="ml-2">Long (&gt;120 min)</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Minimum Rating */}
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-200 mb-2">Minimum Rating (IMDb/RT)</h3>
                                    <select
                                        className="w-full p-2 rounded-md bg-gray-700 text-white border-gray-600 focus:border-red-500 focus:ring focus:ring-red-500 focus:ring-opacity-50"
                                        value={min_rating}
                                        onChange={handle_min_rating_change}
                                    >
                                        <option value="0">Any</option>
                                        <option value="6.0">6.0+</option>
                                        <option value="7.0">7.0+</option>
                                        <option value="7.5">7.5+</option>
                                        <option value="8.0">8.0+</option>
                                        <option value="8.5">8.5+</option>
                                        <option value="9.0">9.0+</option>
                                    </select>
                                </div>

                                {/* Content Type */}
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-200 mb-2">Content Type</h3>
                                    <div className="flex flex-wrap gap-4">
                                        <label className="flex items-center text-gray-300">
                                            <input
                                                type="radio"
                                                name="content_type"
                                                value="both"
                                                checked={preferred_content_type === 'both'}
                                                onChange={handle_content_type_change}
                                                className="form-radio h-5 w-5 text-red-600 bg-gray-900 border-gray-600 focus:ring-red-500"
                                            />
                                            <span className="ml-2">Both Movies & TV Shows</span>
                                        </label>
                                        <label className="flex items-center text-gray-300">
                                            <input
                                                type="radio"
                                                name="content_type"
                                                value="movie"
                                                checked={preferred_content_type === 'movie'}
                                                onChange={handle_content_type_change}
                                                className="form-radio h-5 w-5 text-red-600 bg-gray-900 border-gray-600 focus:ring-red-500"
                                            />
                                            <span className="ml-2">Movies Only</span>
                                        </label>
                                        <label className="flex items-center text-gray-300">
                                            <input
                                                type="radio"
                                                name="content_type"
                                                value="tv_show"
                                                checked={preferred_content_type === 'tv_show'}
                                                onChange={handle_content_type_change}
                                                className="form-radio h-5 w-5 text-red-600 bg-gray-900 border-gray-600 focus:ring-red-500"
                                            />
                                            <span className="ml-2">TV Shows Only</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Parental Content Rating */}
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-200 mb-2">Parental Rating</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                        {PARENTAL_RATING_OPTIONS.map((rating) => (
                                            <label
                                                key={rating}
                                                className={`
                                                    flex items-center p-2 rounded-md cursor-pointer transition-colors duration-200
                                                    ${selected_parental_ratings.includes(rating)
                                                        ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                                    }
                                                `}
                                                onClick={() => handle_parental_rating_toggle(rating)}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selected_parental_ratings.includes(rating)}
                                                    readOnly
                                                    className="form-checkbox h-5 w-5 text-red-600 bg-gray-900 border-gray-600 rounded focus:ring-red-500 mr-2"
                                                />
                                                <span className="font-medium">{rating}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Exclude Genres */}
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-200 mb-2">Exclude Genres</h3>
                                    <div className="flex justify-end gap-2 mb-4">
                                        <button type='button' onClick={select_all_excluded_genres} className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition">Select All</button>
                                        <button type='button' onClick={deselect_all_excluded_genres} className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition">Deselect All</button>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                        {lookup_data.genres.map((genre) => (
                                            <div
                                                key={`exclude-${genre.uid}`}
                                                className={`
                                                    flex items-center p-2 rounded-md cursor-pointer transition-colors duration-200
                                                    ${excluded_genre_uids.includes(genre.uid)
                                                        ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                                    }
                                                `}
                                                onClick={() => handle_exclude_genre_toggle(genre.uid)}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={excluded_genre_uids.includes(genre.uid)}
                                                    readOnly
                                                    className="form-checkbox h-5 w-5 text-red-600 bg-gray-900 border-gray-600 rounded focus:ring-red-500 mr-2"
                                                />
                                                <span className="font-medium">{genre.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Exclude Streaming Services */}
                                <div>
                                    <h3 className="text-xl font-semibold text-gray-200 mb-2">Exclude Streaming Services</h3>
                                    <div className="flex justify-end gap-2 mb-4">
                                        <button type='button' onClick={select_all_excluded_services} className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition">Select All</button>
                                        <button type='button' onClick={deselect_all_excluded_services} className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition">Deselect All</button>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                        {lookup_data.streaming_services.map((service) => (
                                            <div
                                                key={`exclude-${service.uid}`}
                                                className={`
                                                    flex items-center p-2 rounded-md cursor-pointer transition-colors duration-200
                                                    ${excluded_service_uids.includes(service.uid)
                                                        ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                                    }
                                                `}
                                                onClick={() => handle_exclude_service_toggle(service.uid)}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={excluded_service_uids.includes(service.uid)}
                                                    readOnly
                                                    className="form-checkbox h-5 w-5 text-red-600 bg-gray-900 border-gray-600 rounded focus:ring-red-500 mr-2"
                                                />
                                                {service.logo_url && (
                                                    <img src={service.logo_url} alt={service.name} className="h-6 w-6 mr-2 object-contain" />
                                                )}
                                                <span className="font-medium">{service.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        className={`
                            w-full py-4 text-2xl font-extrabold rounded-lg shadow-xl
                            bg-gradient-to-r from-red-600 to-red-800 text-white
                            hover:from-red-700 hover:to-red-900 transition-all duration-300
                            ${(recommendation_mutation.isPending || is_loading_data) ? 'opacity-70 cursor-not-allowed' : ''}
                        `}
                        disabled={recommendation_mutation.isPending || is_loading_data}
                    >
                        {recommendation_mutation.isPending ? (
                            <span className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-3 h-7 w-7 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Getting Recommendations...
                            </span>
                        ) : (
                            'Get Recommendations'
                        )}
                    </button>
                </form>
            </div>
            {/* Custom Scrollbar Styles (typically in a global CSS or utility file) */}
            <style dangerouslySetInnerHTML={{__html: `
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #333;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #555;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #777;
                }
            `}} />
        </>
    );
};

export default UV_HomePage_PreferenceInput;