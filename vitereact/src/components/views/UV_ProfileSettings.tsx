import React, { FC, useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useAppStore } from '@/store/main';
import { useNavigate } from 'react-router-dom';

// Define interfaces based on OpenAPI spec and UX datamap
interface StreamingServiceDetails {
    uid: string;
    name: string;
    logo_url: string | null;
    base_url: string | null;
    is_active: boolean;
}

interface GenreRef {
    uid: string;
    name: string;
}

interface MoodDetails {
    uid: string;
    name: string;
    icon_emoji: string | null;
}

// UserPreferencesData as returned by the GET preferences endpoint
interface UserPreferencesData {
    default_mood_uid: string | null;
    min_release_year: number;
    max_release_year: number;
    preferred_duration_category: "any" | "short" | "medium" | "long";
    min_rating: number;
    preferred_content_type: "both" | "movie" | "tv_show";
    parental_rating_filter_json: string; // JSON array string e.g., '["G", "PG-13"]'
    selected_streaming_services: { uid: string }[]; // Note: Backend returns objects with UID, not just UID strings directly
    selected_genres: { uid: string }[];
    excluded_genres: { uid: string }[];
    excluded_streaming_services: { uid: string }[];
}

interface UserPreferencesGetResponse {
    success: boolean;
    preferences: UserPreferencesData;
}

// UserPreferencesUpdateRequest for the PUT preferences endpoint
interface UserPreferencesUpdateRequest {
    default_mood_uid?: string | null;
    min_release_year?: number; // Optional as backend defines default if not provided
    max_release_year?: number; // Optional as backend defines default if not provided
    preferred_duration_category?: "any" | "short" | "medium" | "long"; // Optional as backend defines default
    min_rating?: number; // Optional as backend defines default
    preferred_content_type?: "both" | "movie" | "tv_show"; // Optional as backend defines default
    parental_rating_filter_json?: string; // Optional as backend defines default
    selected_service_uids?: string[];
    selected_genre_uids?: string[];
    excluded_genre_uids?: string[];
    excluded_service_uids?: string[];
}

interface SuccessResponse {
    success: boolean;
    message: string;
}

interface ErrorResponse {
    success: boolean;
    message: string;
}

// Constants
const PARENTAL_RATINGS_OPTIONS: string[] = [
    "G", "PG", "PG-13", "R", "NC-17",
    "TV-Y", "TV-G", "TV-PG", "TV-14", "TV-MA"
];

const PREFERRED_DURATION_CATEGORIES = [
    { value: "any", label: "Any" },
    { value: "short", label: "< 60 min" },
    { value: "medium", label: "60-120 min" },
    { value: "long", label: "> 120 min" },
];

const CONTENT_TYPE_OPTIONS = [
    { value: "both", label: "Movies & TV Shows" },
    { value: "movie", label: "Movies Only" },
    { value: "tv_show", label: "TV Shows Only" },
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Axios instance for API calls
const axios_client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

const UV_ProfileSettings: FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { authentication_status, show_notification } = useAppStore(state => ({
        authentication_status: state.authentication_status,
        show_notification: state.show_notification,
    }));

    // Local state for all preference fields
    const [default_mood_uid, set_default_mood_uid] = useState<string | null>(null);
    const [selected_service_uids, set_selected_service_uids] = useState<string[]>([]);
    const [selected_genre_uids, set_selected_genre_uids] = useState<string[]>([]);
    const [min_release_year, set_min_release_year] = useState<number>(1900);
    const [max_release_year, set_max_release_year] = useState<number>(2024); // Fixed: Init to 2024 as per datamap/schema
    const [preferred_duration_category, set_preferred_duration_category] = useState<"any" | "short" | "medium" | "long">("any");
    const [min_rating, set_min_rating] = useState<number>(0);
    const [preferred_content_type, set_preferred_content_type] = useState<"both" | "movie" | "tv_show">("both");
    const [selected_parental_ratings, set_selected_parental_ratings] = useState<Set<string>>(new Set());
    const [excluded_genre_uids, set_excluded_genre_uids] = useState<string[]>([]);
    const [excluded_service_uids, set_excluded_service_uids] = useState<string[]>([]);
    
    // Determine current year for max_release_year validation
    const current_year = useMemo(() => new Date().getFullYear(), []);

    // --- Data Fetching: User Preferences ---
    const fetch_user_preferences = useCallback(async (): Promise<UserPreferencesGetResponse> => {
        const token = authentication_status.auth_token;
        if (!token) {
            // This should ideally be caught by ProtectedRoute, but for robust API calls:
            throw new Error("Authentication token not available. Please log in.");
        }
        const { data } = await axios_client.get<UserPreferencesGetResponse>(`/api/v1/users/me/preferences`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return data;
    }, [authentication_status.auth_token]);

    const {
        data: preferences_data,
        isLoading: is_loading_preferences_query, // Use a distinct name to prevent conflict with local state variable as defined in the datamap -> is_loading_preferences
        isError: is_error_preferences,
        error: preferences_query_error,
    } = useQuery<UserPreferencesGetResponse, Error>({
        queryKey: ['user_preferences'],
        queryFn: fetch_user_preferences,
        enabled: authentication_status.is_logged_in, // Only fetch if user is logged in
        staleTime: 5 * 60 * 1000, // Keep data fresh for 5 minutes without refetch
        refetchOnWindowFocus: false, // Don't refetch on window focus
        retry: 1, // Only retry once on failure
    });
    
    // --- Data Fetching: Lookup Data (for Issue-001 fix) --- 
    const fetch_streaming_services = useCallback(async (): Promise<StreamingServiceDetails[]> => {
        const { data } = await axios_client.get<{ streaming_services: StreamingServiceDetails[] }>(`/api/v1/lookup/streaming_services`);
        return data.streaming_services;
    }, []);

    const fetch_genres = useCallback(async (): Promise<GenreRef[]> => {
        const { data } = await axios_client.get<{ genres: GenreRef[] }>(`/api/v1/lookup/genres`);
        return data.genres;
    }, []);

    const fetch_moods = useCallback(async (): Promise<MoodDetails[]> => {
        const { data } = await axios_client.get<{ moods: MoodDetails[] }>(`/api/v1/lookup/moods`);
        return data.moods;
    }, []);

    const { 
        data: streaming_services_data, 
        isLoading: is_loading_streaming_services, 
        isError: is_error_streaming_services 
    } = useQuery<StreamingServiceDetails[], Error>({
        queryKey: ['lookup_streaming_services'],
        queryFn: fetch_streaming_services,
        staleTime: Infinity,
        cacheTime: Infinity,
    });

    const { 
        data: genres_data, 
        isLoading: is_loading_genres, 
        isError: is_error_genres 
    } = useQuery<GenreRef[], Error>({
        queryKey: ['lookup_genres'],
        queryFn: fetch_genres,
        staleTime: Infinity,
        cacheTime: Infinity,
    });

    const { 
        data: moods_data, 
        isLoading: is_loading_moods, 
        isError: is_error_moods 
    } = useQuery<MoodDetails[], Error>({
        queryKey: ['lookup_moods'],
        queryFn: fetch_moods,
        staleTime: Infinity,
        cacheTime: Infinity,
    });

    // Combine loading states for initial display - Fixed: Issue-004 & Issue-001 logic
    const is_loading_all_data = is_loading_preferences_query || is_loading_streaming_services || is_loading_genres || is_loading_moods;
    const are_all_loaded = preferences_data?.success && streaming_services_data && genres_data && moods_data;

    // --- Data Sync: Populate form on successful preference fetch ---
    useEffect(() => {
        if (preferences_data?.success && preferences_data.preferences) {
            const prefs = preferences_data.preferences;
            set_default_mood_uid(prefs.default_mood_uid);
            set_selected_service_uids(prefs.selected_streaming_services.map(s => s.uid));
            set_selected_genre_uids(prefs.selected_genres.map(g => g.uid));
            set_min_release_year(prefs.min_release_year);
            set_max_release_year(prefs.max_release_year);
            set_preferred_duration_category(prefs.preferred_duration_category);
            set_min_rating(prefs.min_rating);
            set_preferred_content_type(prefs.preferred_content_type);
            
            try {
                // Ensure parental_rating_filter_json is a valid string, not empty
                const parsed_parental_ratings = prefs.parental_rating_filter_json 
                    ? JSON.parse(prefs.parental_rating_filter_json) 
                    : [];
                set_selected_parental_ratings(new Set(parsed_parental_ratings));
            } catch (e) {
                console.error("Failed to parse parental_rating_filter_json:", e);
                set_selected_parental_ratings(new Set()); // Default to empty if parsing fails
            }

            set_excluded_genre_uids(prefs.excluded_genres.map(g => g.uid));
            set_excluded_service_uids(prefs.excluded_streaming_services.map(s => s.uid));
        }
    }, [preferences_data]);

    // --- Mutations: Save User Preferences ---
    const update_user_preferences = useCallback(async (
        payload: UserPreferencesUpdateRequest
    ): Promise<SuccessResponse> => {
        const token = authentication_status.auth_token;
        if (!token) {
            throw new Error("Authentication token not available for update.");
        }
        const { data } = await axios_client.put<SuccessResponse>(`/api/v1/users/me/preferences`, payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return data;
    }, [authentication_status.auth_token]);

    const {
        mutate: save_preferences_mutate,
        isPending: is_saving_preferences,
        isError: is_error_saving,
        error: save_error,
        isSuccess: is_save_success_mutation, // To differentiate from a potentially separate local success flag if needed
    } = useMutation<SuccessResponse, Error, UserPreferencesUpdateRequest>({
        mutationFn: update_user_preferences,
        onSuccess: () => {
            show_notification("Preferences saved successfully!", "success");
            queryClient.invalidateQueries({ queryKey: ['user_preferences'] }); // Invalidate to ensure consistency next time
        },
        onError: (err) => {
            const msg = (err as any)?.response?.data?.message || err.message || "Failed to save preferences.";
            show_notification(`Error: ${msg}`, "error");
        },
    });

    // --- Event Handlers for Form Inputs ---

    const handle_mood_change = useCallback((uid: string) => {
        set_default_mood_uid(uid);
    }, []);

    const handle_checkbox_toggle = useCallback((
        set_uids: React.Dispatch<React.SetStateAction<string[]>>,
        uid: string,
        checked: boolean
    ) => {
        set_uids(prev => {
            if (checked) {
                return [...new Set([...prev, uid])]; // Use Set for uniqueness
            } 
            return prev.filter(item_uid => item_uid !== uid);
        });
    }, []);

    // Specific handlers for each checkbox group
    const handle_service_checkbox_change = useCallback((uid: string, checked: boolean) => {
        handle_checkbox_toggle(set_selected_service_uids, uid, checked);
    }, [handle_checkbox_toggle]);

    const handle_genre_checkbox_change = useCallback((uid: string, checked: boolean) => {
        handle_checkbox_toggle(set_selected_genre_uids, uid, checked);
    }, [handle_checkbox_toggle]);
    
    const handle_excluded_genre_checkbox_change = useCallback((uid: string, checked: boolean) => {
        handle_checkbox_toggle(set_excluded_genre_uids, uid, checked);
    }, [handle_checkbox_toggle]);

    const handle_excluded_service_checkbox_change = useCallback((uid: string, checked: boolean) => {
        handle_checkbox_toggle(set_excluded_service_uids, uid, checked);
    }, [handle_checkbox_toggle]);

    const handle_parental_rating_change = useCallback((rating: string, checked: boolean) => {
        set_selected_parental_ratings(prev => {
            const new_set = new Set(prev);
            if (checked) {
                new_set.add(rating);
            } else {
                new_set.delete(rating);
            }
            return new_set;
        });
    }, []);

    const handle_number_input_change = useCallback((setter: React.Dispatch<React.SetStateAction<number>>, value: string, min_val: number, max_val: number, default_on_empty: number) => {
        const num = parseInt(value, 10);
        if (value === '') {
            setter(default_on_empty); // Fixed: Issue-003, set to default if empty
        } else if (!isNaN(num) && num >= min_val && num <= max_val) {
            setter(num);
        } else if (isNaN(num)) {
            setter(default_on_empty); // Fixed: Issue-003, handle NaN (e.g., non-numeric input) by setting to default
        }
    }, []);

    const handle_min_release_year_change = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handle_number_input_change(set_min_release_year, e.target.value, 1900, current_year, 1900);
    }, [handle_number_input_change, current_year]);

    const handle_max_release_year_change = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        handle_number_input_change(set_max_release_year, e.target.value, 1900, current_year, 2024); // Fixed: Issue-003, default 2024
    }, [handle_number_input_change, current_year]);

    const handle_min_rating_change = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const num = parseFloat(e.target.value);
        if (e.target.value === '') {
            set_min_rating(0);
        } else if (!isNaN(num) && num >= 0 && num <= 10) { // Assuming rating is 0-10 scale
            set_min_rating(num);
        }
    }, []);

    const handle_duration_category_change = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        set_preferred_duration_category(e.target.value as "any" | "short" | "medium" | "long");
    }, []);

    const handle_content_type_change = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        set_preferred_content_type(e.target.value as "both" | "movie" | "tv_show");
    }, []);

    // --- Save button handler ---
    const handle_save_changes = useCallback(() => {
        // Only send fields that are different from defaults OR required (min/max years, etc.)
        const payload: UserPreferencesUpdateRequest = {
            default_mood_uid: default_mood_uid,
            selected_service_uids: selected_service_uids,
            selected_genre_uids: selected_genre_uids,
            min_release_year: min_release_year,
            max_release_year: max_release_year,
            preferred_duration_category: preferred_duration_category,
            min_rating: min_rating,
            preferred_content_type: preferred_content_type,
            parental_rating_filter_json: JSON.stringify(Array.from(selected_parental_ratings)),
            excluded_genre_uids: excluded_genre_uids,
            excluded_service_uids: excluded_service_uids,
        };
        save_preferences_mutate(payload);
    }, [
        default_mood_uid, selected_service_uids, selected_genre_uids, min_release_year,
        max_release_year, preferred_duration_category, min_rating, preferred_content_type,
        selected_parental_ratings, excluded_genre_uids, excluded_service_uids, save_preferences_mutate
    ]);

    // Conditional rendering for authentication check (redundant due to ProtectedRoute, but safe)
    if (!authentication_status.is_logged_in) {
        navigate('/login', { replace: true });
        return null;
    }
    
    // Display loading state for initial fetch - Fixed: Issue-001 & Issue-004 logic
    if (is_loading_all_data || !are_all_loaded) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)]">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
                <p className="mt-4 text-lg text-gray-300">Loading your profile settings...</p>
            </div>
        );
    }
    
    // Display error if anything fails to load
    if (is_error_preferences || is_error_streaming_services || is_error_genres || is_error_moods) {
        const error_message = preferences_query_error?.message || "Failed to load some data. Please try again.";
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] text-red-500">
                <p className="text-xl mb-4">Error loading preferences: {error_message}</p>
                <p>Please try again later or ensure you are logged in.</p>
            </div>
        );
    }
    
    // Memoized sub-components for performance optimization - Fixed: Issue-001 (using useQuery data)
    const MemoizedMoodSelector = React.memo(() => (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-purple-400">Default Mood ✨</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {moods_data?.map(mood => (
                    <button
                        key={mood.uid}
                        className={`
                            py-3 px-4 rounded-lg transition-all duration-200
                            ${default_mood_uid === mood.uid
                                ? "bg-purple-600 text-white shadow-lg scale-105"
                                : "bg-gray-700 text-gray-300 hover:bg-purple-700 hover:text-white"
                            }
                            flex items-center justify-center space-x-2 text-center
                        `}
                        onClick={() => handle_mood_change(mood.uid)}
                    >
                        {mood.icon_emoji && <span className="text-lg">{mood.icon_emoji}</span>}
                        <span className="text-sm font-medium">{mood.name}</span>
                    </button>
                ))}
            </div>
        </div>
    ));

    const MemoizedStreamingServiceSelector = React.memo(() => (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-purple-400">Default Streaming Services 🍿</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                {streaming_services_data?.filter(s => s.is_active).map(service => (
                    <label
                        key={service.uid}
                        className="flex items-center space-x-3 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors duration-200 cursor-pointer"
                    >
                        <input
                            type="checkbox"
                            className="form-checkbox h-5 w-5 text-purple-600 bg-gray-900 border-gray-600 rounded focus:ring-purple-500"
                            checked={selected_service_uids.includes(service.uid)}
                            onChange={(e) => handle_service_checkbox_change(service.uid, e.target.checked)}
                        />
                        {service.logo_url ? (
                            <img src={service.logo_url} alt={service.name} className="h-6 w-6 object-contain" />
                        ) : (
                            <div className="h-6 w-6 bg-gray-500 rounded-full flex items-center justify-center text-xs text-gray-200">
                                {service.name.charAt(0)}
                            </div> 
                        )}
                        <span className="text-gray-200 text-sm font-medium">{service.name}</span>
                    </label>
                ))}
            </div>
        </div>
    ));

    const MemoizedGenreSelector = React.memo(() => (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-purple-400">Default Preferred Genres 🎭</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                {genres_data?.map(genre => (
                    <label
                        key={genre.uid}
                        className="flex items-center space-x-3 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors duration-200 cursor-pointer"
                    >
                        <input
                            type="checkbox"
                            className="form-checkbox h-5 w-5 text-purple-600 bg-gray-900 border-gray-600 rounded focus:ring-purple-500"
                            checked={selected_genre_uids.includes(genre.uid)}
                            onChange={(e) => handle_genre_checkbox_change(genre.uid, e.target.checked)}
                        />
                        <span className="text-gray-200 text-sm font-medium">{genre.name}</span>
                    </label>
                ))}
            </div>
        </div>
    ));

    const MemoizedAdvancedFilters = React.memo(() => (
        <div className="bg-gray-800 p-6 rounded-lg shadow-md mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-purple-400">Default Advanced Filters ⚙️</h2>
            <div className="space-y-6">
                {/* Release Year Range */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
                    <label className="text-gray-300 w-full sm:w-1/4">Release Year:</label>
                    <div className="flex space-x-4 w-full sm:w-3/4 mt-2 sm:mt-0">
                        <input
                            type="number"
                            placeholder="From (e.g., 2000)"
                            value={min_release_year === 1900 && (!preferences_data || preferences_data.preferences.min_release_year === 1900) ? '' : min_release_year}
                            onChange={handle_min_release_year_change}
                            min="1900"
                            max={current_year}
                            className="w-1/2 p-2 rounded-md bg-gray-700 border border-gray-600 text-white focus:ring-purple-500 focus:border-purple-500"
                        />
                        <input
                            type="number"
                            placeholder="To (e.g., 2024)"
                            value={max_release_year === 2024 && (!preferences_data || preferences_data.preferences.max_release_year === 2024) ? '' : max_release_year}
                            onChange={handle_max_release_year_change}
                            min="1900"
                            max={current_year}
                            className="w-1/2 p-2 rounded-md bg-gray-700 border border-gray-600 text-white focus:ring-purple-500 focus:border-purple-500"
                        />
                    </div>
                </div>

                {/* Duration */}
                <div>
                    <label className="block text-gray-300 mb-2">Duration:</label>
                    <div className="flex flex-wrap gap-4">
                        {PREFERRED_DURATION_CATEGORIES.map(option => (
                            <label key={option.value} className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="preferred_duration_category"
                                    value={option.value}
                                    checked={preferred_duration_category === option.value}
                                    onChange={handle_duration_category_change}
                                    className="form-radio h-5 w-5 text-purple-600 bg-gray-900 border-gray-600 focus:ring-purple-500"
                                />
                                <span className="text-gray-200 text-sm">{option.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Minimum Rating */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
                    <label className="text-gray-300 w-full sm:w-1/4">Minimum Rating (0-10):</label>
                    <input
                        type="number"
                        placeholder="e.g., 7.5"
                        step="0.1"
                        min="0"
                        max="10"
                        value={min_rating}
                        onChange={handle_min_rating_change}
                        className="w-full sm:w-3/4 p-2 rounded-md bg-gray-700 border border-gray-600 text-white focus:ring-purple-500 focus:border-purple-500 mt-2 sm:mt-0"
                    />
                </div>

                {/* Content Type */}
                <div>
                    <label className="block text-gray-300 mb-2">Content Type:</label>
                    <div className="flex flex-wrap gap-4">
                        {CONTENT_TYPE_OPTIONS.map(option => (
                            <label key={option.value} className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="preferred_content_type"
                                    value={option.value}
                                    checked={preferred_content_type === option.value}
                                    onChange={handle_content_type_change}
                                    className="form-radio h-5 w-5 text-purple-600 bg-gray-900 border-gray-600 focus:ring-purple-500"
                                />
                                <span className="text-gray-200 text-sm">{option.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Parental Ratings */}
                <div>
                    <label className="block text-gray-300 mb-2">Parental Ratings:</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-2">
                        {PARENTAL_RATINGS_OPTIONS.map(rating => (
                            <label key={rating} className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="form-checkbox h-5 w-5 text-purple-600 bg-gray-900 border-gray-600 rounded focus:ring-purple-500"
                                    checked={selected_parental_ratings.has(rating)}
                                    onChange={(e) => handle_parental_rating_change(rating, e.target.checked)}
                                />
                                <span className="text-gray-200 text-sm">{rating}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Excluded Genres */}
                <div className="border-t border-gray-700 pt-6">
                    <h3 className="text-xl font-semibold mb-3 text-purple-300">Exclude Genres 🚫</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                        {genres_data?.map(genre => (
                            <label
                                key={genre.uid}
                                className="flex items-center space-x-3 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors duration-200 cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    className="form-checkbox h-5 w-5 text-red-600 bg-gray-900 border-gray-600 rounded focus:ring-red-500"
                                    checked={excluded_genre_uids.includes(genre.uid)}
                                    onChange={(e) => handle_excluded_genre_checkbox_change(genre.uid, e.target.checked)}
                                />
                                <span className="text-gray-200 text-sm font-medium">{genre.name}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Excluded Streaming Services */}
                <div className="border-t border-gray-700 pt-6">
                    <h3 className="text-xl font-semibold mb-3 text-purple-300">Exclude Streaming Services ⛔</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                        {streaming_services_data?.filter(s => s.is_active).map(service => (
                            <label
                                key={service.uid}
                                className="flex items-center space-x-3 p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors duration-200 cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    className="form-checkbox h-5 w-5 text-red-600 bg-gray-900 border-gray-600 rounded focus:ring-red-500"
                                    checked={excluded_service_uids.includes(service.uid)}
                                    onChange={(e) => handle_excluded_service_checkbox_change(service.uid, e.target.checked)}
                                />
                                {service.logo_url ? (
                                    <img src={service.logo_url} alt={service.name} className="h-6 w-6 object-contain" />
                                ) : (
                                    <div className="h-6 w-6 bg-gray-500 rounded-full flex items-center justify-center text-xs text-gray-200">
                                        {service.name.charAt(0)}
                                    </div> 
                                )}
                                <span className="text-gray-200 text-sm font-medium">{service.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    ));

    return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-center text-white mb-10 tracking-tight">
                Your Profile Settings
            </h1>

            <div className="max-w-4xl mx-auto">
                <MemoizedMoodSelector />
                <MemoizedStreamingServiceSelector />
                <MemoizedGenreSelector />
                <MemoizedAdvancedFilters />

                <div className="mt-10 text-center">
                    <button
                        onClick={handle_save_changes}
                        className={`
                            px-8 py-3 rounded-lg text-lg font-bold transition-transform duration-200
                            ${is_saving_preferences
                                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                                : "bg-purple-600 hover:bg-purple-700 text-white shadow-lg transform hover:scale-105"
                            }
                        `}
                        disabled={is_saving_preferences}
                    >
                        {is_saving_preferences ? (
                            <span className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-white mr-3"></div>
                                Saving Changes...
                            </span>
                        ) : (
                            "Save Changes"
                        )}
                    </button>
                    {is_error_saving && (
                        <p className="mt-4 text-red-500 text-sm">
                            {(save_error as any)?.response?.data?.message || save_error?.message || "An error occurred while saving."}
                        </p>
                    )}
                    {is_save_success_mutation && !is_saving_preferences && (
                        <p className="mt-4 text-green-400 text-sm">
                            Preferences saved successfully!
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UV_ProfileSettings;