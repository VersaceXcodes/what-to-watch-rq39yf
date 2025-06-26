import React, { useState, ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import axios, { AxiosError } from 'axios';
import { useAppStore } from '@/store/main';
import { AuthLoginRequest, AuthSuccessResponse, ErrorResponse } from '@/store/main';

// --- UV_LogIn Component ---

const UV_LogIn: React.FC = () => {
    const navigate = useNavigate();
    const { set_authentication_status, show_notification } = useAppStore();

    const [email_input, set_email_input] = useState<string>('');
    const [password_input, set_password_input] = useState<string>('');
    const [remember_me, set_remember_me] = useState<boolean>(false);
    const [api_error_message, set_api_error_message] = useState<string | null>(null);

    // TanStack Query Mutation for Login
    const login_mutation = useMutation<AuthSuccessResponse, AxiosError<ErrorResponse>, AuthLoginRequest>({
        mutationFn: async (credentials: AuthLoginRequest) => {
            // Use the globally configured axios instance as per prompt's requirement,
            // assuming `axios.defaults.baseURL` is set in '@/store/main.ts' or a similar global configuration.
            const { data } = await axios.post<AuthSuccessResponse>('/api/v1/auth/login', credentials);
            return data;
        },
        onSuccess: (data) => {
            // Update global authentication status with user details and token
            set_authentication_status(data.user.uid, data.user.email, data.token);

            // Show success notification
            show_notification('You have successfully logged in!', 'success');

            // Redirect to the home page
            navigate('/');
        },
        onError: (error) => {
            // Reset API error message. This is fine here as it's immediately set if an error occurs
            // and already cleared on input changes.
            set_api_error_message(null);

            let message_to_display = 'An unexpected error occurred. Please try again.';
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                message_to_display = error.response.data?.message || 'Invalid credentials. Please check your email and password.';
                set_api_error_message(message_to_display); // Set for display near the form
            } else if (error.request) {
                // The request was made but no response was received
                // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
                // http.ClientRequest in node.js
                message_to_display = 'No response from server. Please check your internet connection.';
                set_api_error_message(message_to_display);
            }

            // Show a global notification for the error
            show_notification(`Login failed: ${message_to_display}`, 'error');
            console.error('Login error:', error);
        },
    });

    const handle_email_change = (e: ChangeEvent<HTMLInputElement>) => {
        set_email_input(e.target.value);
        set_api_error_message(null); // Clear previous errors on input change
    };

    const handle_password_change = (e: ChangeEvent<HTMLInputElement>) => {
        set_password_input(e.target.value);
        set_api_error_message(null); // Clear previous errors on input change
    };

    const handle_remember_me_change = (e: ChangeEvent<HTMLInputElement>) => {
        set_remember_me(e.target.checked);
    };

    const handle_log_in_submit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault(); // Prevent default form submission

        // Basic client-side validation
        if (!email_input.trim() || !password_input.trim()) {
            set_api_error_message('Email and password cannot be empty.');
            show_notification('Email and password cannot be empty.', 'warning');
            return;
        }

        // Trigger the login mutation
        login_mutation.mutate({
            email: email_input,
            password: password_input,
            remember_me: remember_me,
        });
    };

    return (
        <>
            <div className="flex items-center justify-center min-h-screen bg-gray-900 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8 p-8 bg-gray-800 rounded-lg shadow-xl border border-gray-700">
                    <div>
                        <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
                            Log in to your account
                        </h2>
                        <p className="mt-2 text-center text-sm text-gray-400">
                            Or {' '}
                            <Link to="/signup" className="font-medium text-indigo-400 hover:text-indigo-300">
                                sign up for a new account
                            </Link>
                        </p>
                    </div>
                    <form className="mt-8 space-y-6" onSubmit={handle_log_in_submit}>
                        <div className="rounded-md shadow-sm -space-y-px">
                            <div>
                                <label htmlFor="email_address" className="sr-only">
                                    Email address
                                </label>
                                <input
                                    id="email_address"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-500 text-white bg-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                    placeholder="Email address"
                                    value={email_input}
                                    onChange={handle_email_change}
                                    disabled={login_mutation.isPending}
                                />
                            </div>
                            <div className="pt-2"> {/* Added pt-2 for spacing between fields */}
                                <label htmlFor="password" className="sr-only">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-500 text-white bg-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                    placeholder="Password"
                                    value={password_input}
                                    onChange={handle_password_change}
                                    disabled={login_mutation.isPending}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <input
                                    id="remember_me"
                                    name="remember_me"
                                    type="checkbox"
                                    className="h-4 w-4 text-indigo-400 focus:ring-indigo-500 border-gray-600 rounded bg-gray-700"
                                    checked={remember_me}
                                    onChange={handle_remember_me_change}
                                    disabled={login_mutation.isPending}
                                />
                                <label htmlFor="remember_me" className="ml-2 block text-sm text-gray-300">
                                    Remember me
                                </label>
                            </div>

                            <div className="text-sm">
                                <Link to="#" className="font-medium text-indigo-400 hover:text-indigo-300 pointer-events-none opacity-50">
                                    {/* Placeholder for forgot password - out of scope for MVP */}
                                    Forgot your password?
                                </Link>
                            </div>
                        </div>

                        {api_error_message && (
                            <div className="text-red-400 text-sm text-center">
                                {api_error_message}
                            </div>
                        )}

                        <div>
                            <button
                                type="submit"
                                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-500 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                                disabled={login_mutation.isPending}
                            >
                                {login_mutation.isPending ? (
                                    <>
                                        <svg
                                            className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                        >
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            ></circle>
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                        Logging in...
                                    </>
                                ) : (
                                    'Log In'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
};

export default UV_LogIn;