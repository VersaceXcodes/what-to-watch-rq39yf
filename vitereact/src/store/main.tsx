import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import axios, { AxiosInstance } from 'axios';

// --- Type Definitions for Global State and API Responses ---

// Global Authentication Status
export interface AuthStatus {
    is_logged_in: boolean;
    user_uid: string | null;
    user_email: string | null;
    auth_token: string | null;
}

// Global Notification State
export interface NotificationState {
    display: boolean;
    message: string | null;
    type: "success" | "error" | "warning" | "info" | null;
    uid: string | null; // Unique ID for dismissing specific notifications
}

// Lookup Data Interfaces (from OpenAPI/UX-analysis-document)
export interface StreamingServiceDetails {
    uid: string;
    name: string;
    logo_url: string | null; // URI
    base_url: string | null; // URI
    is_active: boolean;
}

export interface GenreRef {
    uid: string;
    name: string;
}

export interface MoodDetails {
    uid: string;
    name: string;
    icon_emoji: string | null;
}

export interface LookupData {
    streaming_services: StreamingServiceDetails[];
    genres: GenreRef[];
    moods: MoodDetails[];
}

// API Response Schemas (for type-checking Axios responses)
interface AuthSuccessResponse {
    success: boolean;
    message: string;
    user: {
        uid: string;
        email: string;
        created_at: string;
    };
    token: string;
}

interface LookupStreamingServicesResponse {
    success: boolean;
    streaming_services: StreamingServiceDetails[];
}

interface LookupGenresResponse {
    success: boolean;
    genres: GenreRef[];
}

interface LookupMoodsResponse {
    success: boolean;
    moods: MoodDetails[];
}

interface ErrorResponse {
    success: boolean;
    message: string;
}

// --- Global Store State Interface (combining all state and actions) ---

export interface AppState {
    // Global State Variables
    authentication_status: AuthStatus;
    global_loading: boolean;
    notifications: NotificationState;
    lookup_data: LookupData;

    // Global Actions
    set_authentication_status: (user_uid: string, user_email: string, auth_token: string) => void;
    clear_authentication_status: () => void;
    set_global_loading: (is_loading: boolean) => void;
    show_notification: (message: string, type: NotificationState['type']) => string; // Returns uid for potential manual dismissal
    hide_notification: (uid: string) => void;
    load_all_lookup_data: () => Promise<void>;
}

// --- Default Values for Global State ---

const default_auth_status: AuthStatus = {
    is_logged_in: false,
    user_uid: null,
    user_email: null,
    auth_token: null,
};

const default_notification_state: NotificationState = {
    display: false,
    message: null,
    type: null,
    uid: null,
};

const default_lookup_data: LookupData = {
    streaming_services: [],
    genres: [],
    moods: [],
};

// --- API Configuration (Axios Instance) ---

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const axios_instance: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Axios Request Interceptor for Authentication Token
axios_instance.interceptors.request.use(
    (config) => {
        const token = useAppStore.getState().authentication_status.auth_token;
        if (token && config.headers) {
            config.headers['Authorization'] = `Bearer ${token}`; // Use Bearer token for JWT auth
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// --- Zustand Store Definition ---

export const useAppStore = create<AppState>()(
    // Persist middleware configuration
    persist(
        (set, get) => ({
            // Initialize Global State
            authentication_status: default_auth_status,
            global_loading: false, // Default is false, not persisted
            notifications: default_notification_state, // Default is cleared, not persisted
            lookup_data: default_lookup_data, // Will be loaded from persistence if available

            // Global Actions Implementation
            set_authentication_status: (user_uid, user_email, auth_token) => {
                set({
                    authentication_status: {
                        is_logged_in: true,
                        user_uid,
                        user_email,
                        auth_token,
                    },
                });
            },
            clear_authentication_status: () => {
                set({ authentication_status: default_auth_status });
            },
            set_global_loading: (is_loading) => {
                set({ global_loading: is_loading });
            },
            show_notification: (message, type) => {
                // Generate a simple unique ID for the notification
                const notification_uid = `notif-${Date.now()}-${Math.random().toString(36).substring(7)}`;
                set({ notifications: { display: true, message, type, uid: notification_uid } });

                // Automatically hide the notification after 5 seconds
                setTimeout(() => {
                    const current_notifications_state = get().notifications;
                    if (current_notifications_state.uid === notification_uid) {
                        set({ notifications: default_notification_state });
                    }
                }, 5000); // 5 seconds

                return notification_uid; // Return uid for potential manual dismissal
            },
            hide_notification: (uid_to_hide) => {
                set((state) => {
                    // Only hide if the UID matches the currently displayed notification
                    if (state.notifications.uid === uid_to_hide) {
                        return { notifications: default_notification_state };
                    }
                    return state; // No change if a different notification is active
                });
            },
            load_all_lookup_data: async () => {
                const { lookup_data, set_global_loading, show_notification } = get();

                // Check if lookup data is already populated (e.g., from localStorage persistence)
                if (
                    lookup_data.moods.length > 0 &&
                    lookup_data.genres.length > 0 &&
                    lookup_data.streaming_services.length > 0
                ) {
                    // console.log("Lookup data already loaded from persistence."); // For debugging
                    return;
                }

                set_global_loading(true); // Indicate global loading
                try {
                    const [
                        services_res,
                        genres_res,
                        moods_res,
                    ] = await Promise.all([
                        axios_instance.get<LookupStreamingServicesResponse>(`/api/v1/lookup/streaming_services`),
                        axios_instance.get<LookupGenresResponse>(`/api/v1/lookup/genres`),
                        axios_instance.get<LookupMoodsResponse>(`/api/v1/lookup/moods`),
                    ]);

                    if (services_res.data.success && genres_res.data.success && moods_res.data.success) {
                        set({
                            lookup_data: {
                                streaming_services: services_res.data.streaming_services,
                                genres: genres_res.data.genres,
                                moods: moods_res.data.moods,
                            },
                        });
                        // Do not show success notification for lookup data, typically too noisy on app load
                    } else {
                        // Handle partial success or unexpected response format
                        show_notification("Failed to load some lookup data. Please try again.", "error");
                    }
                } catch (error) {
                    const error_message =
                        (error as { response?: { data?: ErrorResponse } })?.response?.data?.message ||
                        "An unknown error occurred while fetching essential app data.";
                    show_notification(`Error loading essential data: ${error_message}`, "error");
                    console.error("Error loading lookup data:", error); // Log for debugging
                } finally {
                    set_global_loading(false); // End global loading
                }
            },
        }),
        {
            // Zustand Persist configuration
            name: 'cinecrib-store', // Unique name for the localStorage key
            storage: createJSONStorage(() => localStorage), // Use localStorage for persistence
            partialize: (state) => ({ // Selectively persist only these parts of the state
                authentication_status: state.authentication_status,
                lookup_data: state.lookup_data,
            }),
            // merge: (persistedState, currentState) => ({ ...currentState, ...persistedState }),
            // Zustand's default merge behavior for persisted items is usually sufficient
            // where persistedState overrides currentState for the partialized keys.
            // Non-partialized keys will take their default values from the `create` call.
        },
    ),
);