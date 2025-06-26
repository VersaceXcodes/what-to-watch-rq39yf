import React from 'react';

/**
 * GV_Footer Component
 *
 * Provides consistent auxiliary information and corporate/legal links across the entire application.
 * Contains copyright information and placeholders for legal links (e.g., Privacy Policy, Terms of Service)
 * and social media icons (with generic SVG placeholders for MVP).
 */
const GV_Footer: React.FC = () => {
  const current_year = new Date().getFullYear();

  return (
    <>
      <footer className="bg-gray-800 text-gray-400 py-6 text-sm">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          {/* Copyright Information */}
          <div className="text-center md:text-left">
            <p>&copy; {current_year} CineCrib. All rights reserved.</p>
          </div>

          {/* Legal Links (Placeholder) */}
          <nav className="flex flex-wrap justify-center md:justify-start space-x-4">
            <a
              href="/privacy-policy" // Placeholder URL for Privacy Policy
              className="hover:text-white transition-colors duration-200"
            >
              Privacy Policy
            </a>
            <a
              href="/terms-of-service" // Placeholder URL for Terms of Service
              className="hover:text-white transition-colors duration-200"
            >
              Terms of Service
            </a>
          </nav>

          {/* Social Media Icons (Placeholder) */}
          <div className="flex space-x-4">
            <a
              href="https://twitter.com/CineCrib"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="CineCrib on Twitter"
              className="hover:text-white transition-colors duration-200"
            >
              <svg fill="currentColor" viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                <path d="M22.162 5.656a8.314 8.314 0 01-2.457.674 4.148 4.148 0 003.65-1.332 8.286 8.286 0 01-2.617 1 4.137 4.137 0 00-7.07 3.766 11.71 11.71 0 01-8.508-4.305 4.136 4.136 0 001.278 5.518 4.116 4.116 0 01-1.874-.516v.053a4.136 4.136 0 003.324 4.053 4.146 4.146 0 01-1.867.07 4.138 4.138 0 003.864 2.87 8.311 8.311 0 01-5.143 1.77 11.777 11.777 0 006.353 1.861c7.625 0 11.782-6.31 11.782-11.782 0-.179-.004-.358-.012-.533a8.435 8.435 0 002.067-2.146z"></path>
              </svg>
            </a>
            <a
              href="https://facebook.com/CineCrib"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="CineCrib on Facebook"
              className="hover:text-white transition-colors duration-200"
            >
              <svg fill="currentColor" viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                <path d="M19 0H5a5 5 0 00-5 5v14a5 5 0 005 5h14a5 5 0 005-5V5a5 5 0 00-5-5zm-2 7h-2v3h2a.5.5 0 01.5.5v2a.5.5 0 01-.5.5h-2v6h-3v-6H9V7h1a.5.5 0 01.5-.5h2V5a2.5 2.5 0 012.5-2.5h2V2s.5 0 .5.5v1.5H19a.5.5 0 01.5.5v2a.5.5 0 01-.5.5zm-5 4h-2a.5.5 0 01-.5-.5V7a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v3.5a.5.5 0 01-.5.5z"></path>
              </svg>
            </a>
            <a
              href="https://instagram.com/CineCrib"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="CineCrib on Instagram"
              className="hover:text-white transition-colors duration-200"
            >
              <svg fill="currentColor" viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.772 1.637 4.908 4.908.058 1.265.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.148 3.252-1.637 4.772-4.908 4.908-1.265.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-3.252-.148-4.772-1.637-4.908-4.908-.058-1.265-.07-1.646-.07-4.85s.012-3.584.07-4.85c.148-3.252 1.637-4.772 4.908-4.908 1.265-.058 1.646-.07 4.85-.07zm0-2.163C8.75 0 8.358.016 7.07 0.07A6.618 6.618 0 002.04 2.04 6.618 6.618 0 000.07 7.07C.016 8.358 0 8.75 0 12c0 3.25.016 3.642.07 4.93A6.618 6.618 0 002.04 21.96 6.618 6.618 0 007.07 23.93c1.288.054 1.68.07 4.93.07s3.642-.016 4.93-.07A6.618 6.618 0 0021.96 21.96 6.618 6.618 0 0023.93 16.93c.054-1.288.07-1.68.07-4.93s-.016-3.642-.07-4.93A6.618 6.618 0 0021.96 2.04 6.618 6.618 0 0016.93.07C15.642.016 15.25 0 12 0zm0 5.864a6.136 6.136 0 100 12.272 6.136 6.136 0 000-12.272zm0 10.32c-2.31 0-4.184-1.874-4.184-4.184s1.874-4.184 4.184-4.184 4.184 1.874 4.184 4.184-1.874 4.184-4.184 4.184zm6.807-9.527a1.45 1.45 0 100-2.9 1.45 1.45 0 000 2.9z"></path>
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </>
  );
};

export default GV_Footer;