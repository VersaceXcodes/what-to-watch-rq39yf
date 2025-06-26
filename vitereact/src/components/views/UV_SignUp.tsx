import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import axios, { AxiosError } from 'axios';
import { useAppStore } from '@/store/main';

// Define the API base URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Type definitions (from OpenAPI spec for AuthSignUpRequest and AuthSuccessResponse)
interface AuthSignUpRequest {
    email: string;
    password: string;
}

interface UserAuthDetails {
    uid: string;
    email: string;
    created_at: string;
}

interface AuthSuccessResponse {
    success: boolean;
    message: string;
    user: UserAuthDetails;
    token: string;
}

interface ErrorResponse {
    success: boolean;
    message: string;
}

// Local state interfaces for form management
interface SignUpFormState {
    email: string;
    password: string;
    confirm_password: string;
}

interface SignUpErrorState {
    email?: string;
    password?: string;
    confirm_password?: string;
    api_error?: string;
}

const UV_SignUp: React.FC = () => {
    const navigate = useNavigate();
    const set_authentication_status = useAppStore((state) => state.set_authentication_status);
    const show_notification = useAppStore((state) => state.show_notification);
    const is_logged_in = useAppStore((state) => state.auth.is_logged_in); // Get auth status for redirection

    // ISSUE-002 Fix: Redirect authenticated users away from the signup page
    useEffect(() => {
        if (is_logged_in) {
            navigate('/');
        }
    }, [is_logged_in, navigate]);

    const [form_values, set_form_values] = useState<SignUpFormState>({
        email: '',
        password: '',
        confirm_password: '',
    });
    const [errors, set_errors] = useState<SignUpErrorState>({});

    // Function to validate email format
    const validate_email = (email: string): string | undefined => {
        if (!email) return 'Email is required.';
        if (!/\S+@\S+\.\S+/.test(email)) return 'Email address is invalid.';
        return undefined;
    };

    // Function to validate password strength
    const validate_password = (password: string): string | undefined => {
        if (!password) return 'Password is required.';
        if (password.length < 8) return 'Password must be at least 8 characters.';
        if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
        if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
        if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return 'Password must contain at least one special character.';
        return undefined;
    };

    // Password strength indicator logic
    const get_password_strength = (password: string): { text: string; color: string } => {
        let strength = 0;
        if (password.length > 7) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[a-z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;

        switch (strength) {
            case 0:
            case 1:
                return { text: 'Very Weak', color: 'text-red-500' };
            case 2:
                return { text: 'Weak', color: 'text-orange-500' };
            case 3:
                return { text: 'Medium', color: 'text-yellow-500' };
            case 4:
                return { text: 'Strong', color: 'text-green-500' };
            case 5:
                return { text: 'Very Strong', color: 'text-green-600' };
            default:
                return { text: '', color: 'text-gray-400' };
        }
    };

    const handle_change = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        set_form_values((prev) => ({ ...prev, [name]: value }));

        // ISSUE-003 Fix: Clear individual error for the field being typed into immutably
        set_errors((prev) => ({
            ...prev,
            [name]: undefined, // Explicitly set the specific field's error to undefined
            api_error: undefined, // Clear general API errors on any input change
        }));
    };

    const signup_mutation = useMutation<AuthSuccessResponse, AxiosError<ErrorResponse>, AuthSignUpRequest>({
        mutationFn: async (payload) => {
            const response = await axios.post<AuthSuccessResponse>(
                `${API_BASE_URL}/api/v1/auth/signup`,
                payload
            );
            return response.data;
        },
        onSuccess: (data) => {
            set_authentication_status(data.user.uid, data.user.email, data.token);
            show_notification('Sign up successful! Welcome to CineCrib!', 'success');
            navigate('/');
        },
        onError: (error) => {
            const api_error_message =
                error.response?.data?.message || 'An unexpected error occurred during sign up.';
            set_errors((prev) => ({ ...prev, api_error: api_error_message }));
            show_notification(api_error_message, 'error');
            console.error('Sign up error:', error);
        },
    });

    const handle_submit = async (e: React.FormEvent) => {
        e.preventDefault();

        const new_errors: SignUpErrorState = {};
        const email_error = validate_email(form_values.email);
        if (email_error) {
            new_errors.email = email_error;
        }

        const password_error = validate_password(form_values.password);
        if (password_error) {
            new_errors.password = password_error;
        }

        // ISSUE-001 Fix: Corrected password confirmation logic
        if (!form_values.confirm_password) {
            new_errors.confirm_password = 'Confirm password is required.';
        } else if (form_values.password !== form_values.confirm_password) {
            new_errors.confirm_password = 'Passwords do not match.';
        }

        set_errors(new_errors);

        if (Object.keys(new_errors).length === 0) {
            signup_mutation.mutate({
                email: form_values.email,
                password: form_values.password,
            });
        }
    };

    const password_strength = form_values.password ? get_password_strength(form_values.password) : null;

    return (
        <>
            <div className="flex items-center justify-center min-h-[calc(100vh-theme(spacing.16))] py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full p-8 space-y-8 bg-gray-800 rounded-lg shadow-xl border border-gray-700">
                    <div>
                        <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
                            Sign Up for CineCrib
                        </h2>
                        <p className="mt-2 text-center text-sm text-gray-400">
                            Or{' '}
                            <Link to="/login" className="font-medium text-purple-400 hover:text-purple-300">
                                log in to your account
                            </Link>
                        </p>
                    </div>
                    <form className="mt-8 space-y-6" onSubmit={handle_submit}>
                        <div className="rounded-md shadow-sm -space-y-px">
                            <div>
                                <label htmlFor="email-address" className="sr-only">
                                    Email address
                                </label>
                                <input
                                    id="email-address"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    className={`appearance-none rounded-none relative block w-full px-3 py-2 border ${
                                        errors.email ? 'border-red-500' : 'border-gray-600'
                                    } placeholder-gray-500 text-white bg-gray-700 rounded-t-md focus:outline-none focus:ring-purple-500 focus:border-purple-500 focus:z-10 sm:text-sm`}
                                    placeholder="Email address"
                                    value={form_values.email}
                                    onChange={handle_change}
                                />
                                {errors.email && (
                                    <p className="mt-1 text-xs text-red-400">{errors.email}</p>
                                )}
                            </div>
                            <div className="mt-4">
                                <label htmlFor="password" className="sr-only">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    className={`appearance-none rounded-none relative block w-full px-3 py-2 border ${
                                        errors.password ? 'border-red-500' : 'border-gray-600'
                                    } placeholder-gray-500 text-white bg-gray-700 focus:outline-none focus:ring-purple-500 focus:border-purple-500 focus:z-10 sm:text-sm`}
                                    placeholder="Password"
                                    value={form_values.password}
                                    onChange={handle_change}
                                />
                                {errors.password && (
                                    <p className="mt-1 text-xs text-red-400">{errors.password}</p>
                                )}
                                {password_strength && form_values.password.length > 0 && (
                                    <p className={`mt-1 text-xs ${password_strength.color}`}>
                                        Password Strength: {password_strength.text}
                                    </p>
                                )}
                            </div>
                            <div className="mt-4">
                                <label htmlFor="confirm-password" className="sr-only">
                                    Confirm Password
                                </label>
                                <input
                                    id="confirm-password"
                                    name="confirm_password"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    className={`appearance-none rounded-none relative block w-full px-3 py-2 border ${
                                        errors.confirm_password ? 'border-red-500' : 'border-gray-600'
                                    } placeholder-gray-500 text-white bg-gray-700 rounded-b-md focus:outline-none focus:ring-purple-500 focus:border-purple-500 focus:z-10 sm:text-sm`}
                                    placeholder="Confirm Password"
                                    value={form_values.confirm_password}
                                    onChange={handle_change}
                                />
                                {errors.confirm_password && (
                                    <p className="mt-1 text-xs text-red-400">{errors.confirm_password}</p>
                                )}
                            </div>
                        </div>

                        {errors.api_error && (
                            <div
                                className="bg-red-900 border border-red-700 text-red-300 px-4 py-3 rounded relative"
                                role="alert"
                            >
                                <span className="block sm:inline">{errors.api_error}</span>
                            </div>
                        )}

                        <div>
                            <button
                                type="submit"
                                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors duration-200"
                                disabled={signup_mutation.isPending}
                            >
                                {signup_mutation.isPending ? (
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
                                ) : (
                                    'Sign Up'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
};

export default UV_SignUp;