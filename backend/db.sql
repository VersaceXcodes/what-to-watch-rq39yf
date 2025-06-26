-- Drop tables in reverse order of creation to avoid foreign key conflicts
DROP TABLE IF EXISTS watchlist_entries CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS user_default_streaming_services CASCADE;
DROP TABLE IF EXISTS user_default_genres CASCADE;
DROP TABLE IF EXISTS user_excluded_genres CASCADE;
DROP TABLE IF EXISTS user_excluded_streaming_services CASCADE;
DROP TABLE IF EXISTS content_genres CASCADE;
DROP TABLE IF EXISTS content_streaming_availability CASCADE;
DROP TABLE IF EXISTS content CASCADE;
DROP TABLE IF EXISTS genres CASCADE;
DROP TABLE IF EXISTS moods CASCADE;
DROP TABLE IF EXISTS streaming_services CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- CREATE TABLES

CREATE TABLE users (
    uid TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE streaming_services (
    uid TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    base_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE genres (
    uid TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE moods (
    uid TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    icon_emoji TEXT
);

CREATE TABLE content (
    uid TEXT PRIMARY KEY,
    external_api_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    release_year INTEGER,
    content_type TEXT NOT NULL, -- 'movie' or 'tv_show'
    poster_url TEXT,
    synopsis TEXT,
    tagline TEXT,
    duration_minutes INTEGER, -- For movies (runtime)
    number_of_seasons INTEGER, -- For TV shows
    imdb_rating NUMERIC(3, 1),
    rotten_tomatoes_score INTEGER,
    parental_rating TEXT,
    director TEXT,
    main_cast TEXT, -- JSON array string of cast members, e.g., '["Actor 1", "Actor 2"]'
    last_synced_at TEXT NOT NULL
);

CREATE TABLE user_settings (
    user_uid TEXT PRIMARY KEY REFERENCES users(uid),
    default_mood_uid TEXT REFERENCES moods(uid),
    min_release_year INTEGER NOT NULL DEFAULT 1900,
    max_release_year INTEGER NOT NULL DEFAULT 2024,
    preferred_duration_category TEXT NOT NULL DEFAULT 'any', -- 'any', 'short', 'medium', 'long'
    min_rating NUMERIC(2, 1) NOT NULL DEFAULT 0.0,
    preferred_content_type TEXT NOT NULL DEFAULT 'both', -- 'both', 'movie', 'tv_show'
    parental_rating_filter_json TEXT DEFAULT '[]' -- JSON array string, e.g., '["G", "PG-13", "R"]'
);

CREATE TABLE user_default_streaming_services (
    user_uid TEXT NOT NULL REFERENCES users(uid),
    service_uid TEXT NOT NULL REFERENCES streaming_services(uid),
    PRIMARY KEY (user_uid, service_uid)
);

CREATE TABLE user_default_genres (
    user_uid TEXT NOT NULL REFERENCES users(uid),
    genre_uid TEXT NOT NULL REFERENCES genres(uid),
    PRIMARY KEY (user_uid, genre_uid)
);

CREATE TABLE user_excluded_genres (
    user_uid TEXT NOT NULL REFERENCES users(uid),
    genre_uid TEXT NOT NULL REFERENCES genres(uid),
    PRIMARY KEY (user_uid, genre_uid)
);

CREATE TABLE user_excluded_streaming_services (
    user_uid TEXT NOT NULL REFERENCES users(uid),
    service_uid TEXT NOT NULL REFERENCES streaming_services(uid),
    PRIMARY KEY (user_uid, service_uid)
);

CREATE TABLE watchlist_entries (
    uid TEXT PRIMARY KEY,
    user_uid TEXT NOT NULL REFERENCES users(uid),
    content_uid TEXT NOT NULL REFERENCES content(uid),
    added_at TEXT NOT NULL,
    UNIQUE (user_uid, content_uid)
);

CREATE TABLE content_genres (
    content_uid TEXT NOT NULL REFERENCES content(uid),
    genre_uid TEXT NOT NULL REFERENCES genres(uid),
    PRIMARY KEY (content_uid, genre_uid)
);

CREATE TABLE content_streaming_availability (
    uid TEXT PRIMARY KEY,
    content_uid TEXT NOT NULL REFERENCES content(uid),
    service_uid TEXT NOT NULL REFERENCES streaming_services(uid),
    watch_link TEXT,
    region TEXT NOT NULL DEFAULT 'GLOBAL',
    last_checked_at TEXT NOT NULL,
    UNIQUE (content_uid, service_uid, region)
);

-- SEED THE DATABASE

-- Users
INSERT INTO users (uid, email, password_hash, created_at, updated_at) VALUES
('user_123', 'mark@example.com', 'hashed_password_mark', '2023-01-15 10:00:00', '2024-04-20 15:30:00'),
('user_456', 'brenda@example.com', 'hashed_password_brenda', '2023-02-20 11:30:00', '2024-04-21 09:00:00'),
('user_789', 'alice@example.com', 'hashed_password_alice', '2023-03-01 08:00:00', '2024-04-20 10:15:00');

-- Streaming Services
INSERT INTO streaming_services (uid, name, logo_url, base_url, is_active) VALUES
('service_netflix', 'Netflix', 'https://picsum.photos/200/200?random=1', 'https://www.netflix.com/title/', TRUE),
('service_prime', 'Prime Video', 'https://picsum.photos/200/200?random=2', 'https://www.primevideo.com/detail/', TRUE),
('service_hulu', 'Hulu', 'https://picsum.photos/200/200?random=3', 'https://www.hulu.com/watch/', TRUE),
('service_disney', 'Disney+', 'https://picsum.photos/200/200?random=4', 'https://www.disneyplus.com/movies/', TRUE),
('service_max', 'Max', 'https://picsum.photos/200/200?random=5', 'https://play.max.com/movie/', TRUE),
('service_youtube', 'YouTube TV', 'https://picsum.photos/200/200?random=6', 'https://tv.youtube.com/', FALSE);

-- Genres
INSERT INTO genres (uid, name) VALUES
('genre_action', 'Action'),
('genre_comedy', 'Comedy'),
('genre_drama', 'Drama'),
('genre_scifi', 'Science Fiction'),
('genre_thriller', 'Thriller'),
('genre_horror', 'Horror'),
('genre_animation', 'Animation'),
('genre_documentary', 'Documentary'),
('genre_fantasy', 'Fantasy'),
('genre_romance', 'Romance'),
('genre_crime', 'Crime'),
('genre_mystery', 'Mystery');

-- Moods
INSERT INTO moods (uid, name, icon_emoji) VALUES
('mood_exciting', 'Exciting', '⚡️'),
('mood_relaxing', 'Relaxing', '😌'),
('mood_funny', 'Funny', '😂'),
('mood_thought_provoking', 'Thought-Provoking', '🤔'),
('mood_chilling', 'Chilling', '👻'),
('mood_inspiring', 'Inspiring', '✨');

-- Content
INSERT INTO content (uid, external_api_id, title, release_year, content_type, poster_url, synopsis, tagline, duration_minutes, number_of_seasons, imdb_rating, rotten_tomatoes_score, parental_rating, director, main_cast, last_synced_at) VALUES
('content_inception', 'ext_api_id_101', 'Inception', 2010, 'movie', 'https://picsum.photos/400/600?random=11', 'A thief who steals corporate secrets through use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.', 'Your mind is the scene of the crime.', 148, NULL, 8.8, 87, 'PG-13', 'Christopher Nolan', '["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page"]', '2024-04-22 08:00:00'),
('content_stranger_things', 'ext_api_id_102', 'Stranger Things', 2016, 'tv_show', 'https://picsum.photos/400/600?random=12', 'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces, and one strange little girl.', 'Every adventure starts with a first step.', NULL, 4, 8.7, 93, 'TV-14', 'The Duffer Brothers', '["Millie Bobby Brown", "Finn Wolfhard", "Winona Ryder"]', '2024-04-22 08:00:00'),
('content_pulp_fiction', 'ext_api_id_103', 'Pulp Fiction', 1994, 'movie', 'https://picsum.photos/400/600?random=13', 'The lives of two mob hitmen, a boxer, a gangster and his wife, and a pair of diner bandits intertwine in four tales of violence and redemption.', 'You won''t know the facts until you''ve seen the fiction.', 154, NULL, 8.9, 92, 'R', 'Quentin Tarantino', '["John Travolta", "Uma Thurman", "Samuel L. Jackson"]', '2024-04-22 08:00:00'),
('content_the_office', 'ext_api_id_104', 'The Office (US)', 2005, 'tv_show', 'https://picsum.photos/400/600?random=14', 'A mockumentary on the everyday lives of a group of office employees in the Scranton, Pennsylvania branch of the fictional Dunder Mifflin Paper Company.', 'The paper business is their life.', NULL, 9, 9.0, 81, 'TV-14', 'Greg Daniels', '["Steve Carell", "John Krasinski", "Jenna Fischer"]', '2024-04-22 08:00:00'),
('content_interstellar', 'ext_api_id_105', 'Interstellar', 2014, 'movie', 'https://picsum.photos/400/600?random=15', 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity''s survival.', 'Mankind was born on Earth. It was never meant to die here.', 169, NULL, 8.7, 72, 'PG-13', 'Christopher Nolan', '["Matthew McConaughey", "Anne Hathaway", "Jessica Chastain"]', '2024-04-22 08:00:00'),
('content_the_crown', 'ext_api_id_106', 'The Crown', 2016, 'tv_show', 'https://picsum.photos/400/600?random=16', 'Follows the political rivalries and romance of Queen Elizabeth II''s reign and the events that shaped the second half of the 20th century.', 'The monarchy is a marathon, not a sprint.', NULL, 6, 8.2, 90, 'TV-MA', 'Peter Morgan', '["Claire Foy", "Olivia Colman", "Imelda Staunton"]', '2024-04-22 08:00:00'),
('content_breaking_bad', 'ext_api_id_107', 'Breaking Bad', 2008, 'tv_show', 'https://picsum.photos/400/600?random=17', 'A chemistry teacher diagnosed with lung cancer teams up with a former student to manufacture and sell methamphetamine to secure his family''s future.', 'No more half measures.', NULL, 5, 9.5, 96, 'TV-MA', 'Vince Gilligan', '["Bryan Cranston", "Aaron Paul", "Anna Gunn"]', '2024-04-22 08:00:00'),
('content_coco', 'ext_api_id_108', 'Coco', 2017, 'movie', 'https://picsum.photos/400/600?random=18', 'Aspiring musician Miguel, confronted with his family''s ancestral ban on music, enters the Land of the Dead to find his great-great-grandfather, a legendary singer.', 'The celebration of a lifetime.', 105, NULL, 8.4, 97, 'PG', 'Lee Unkrich', '["Anthony Gonzalez", "Gael García Bernal", "Benjamin Bratt"]', '2024-04-22 08:00:00'),
('content_parasite', 'ext_api_id_109', 'Parasite', 2019, 'movie', 'https://picsum.photos/400/600?random=19', 'Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.', 'Act like you own the world, and the world will be yours to command.', 132, NULL, 8.5, 98, 'R', 'Bong Joon-ho', '["Song Kang-ho", "Choi Woo-shik", "Park So-dam"]', '2024-04-22 08:00:00'),
('content_the_martian', 'ext_api_id_110', 'The Martian', 2015, 'movie', 'https://picsum.photos/400/600?random=20', 'An astronaut becomes stranded on Mars after his team assume him dead, and must rely on his ingenuity to find a way to signal to Earth that he is alive.', 'Bring him home.', 144, NULL, 8.0, 91, 'PG-13', 'Ridley Scott', '["Matt Damon", "Jessica Chastain", "Kristen Wiig"]', '2024-04-22 08:00:00');


-- User Settings
INSERT INTO user_settings (user_uid, default_mood_uid, min_release_year, max_release_year, preferred_duration_category, min_rating, preferred_content_type, parental_rating_filter_json) VALUES
('user_123', 'mood_exciting', 2000, 2024, 'medium', 7.5, 'movie', '["PG-13", "R"]'),
('user_456', 'mood_funny', 1990, 2023, 'any', 6.0, 'both', '["G", "PG"]'),
('user_789', 'mood_relaxing', 2010, 2024, 'short', 7.0, 'tv_show', '["TV-14"]');

-- User Default Streaming Services (Mark prefers Netflix and Prime, Brenda prefers Hulu and Disney+)
INSERT INTO user_default_streaming_services (user_uid, service_uid) VALUES
('user_123', 'service_netflix'),
('user_123', 'service_prime'),
('user_456', 'service_hulu'),
('user_456', 'service_disney');

-- User Default Genres (Alice prefers Sci-Fi and Drama)
INSERT INTO user_default_genres (user_uid, genre_uid) VALUES
('user_789', 'genre_scifi'),
('user_789', 'genre_drama'),
('user_123', 'genre_action'),
('user_123', 'genre_thriller');

-- User Excluded Genres (Mark excludes Horror)
INSERT INTO user_excluded_genres (user_uid, genre_uid) VALUES
('user_123', 'genre_horror');

-- User Excluded Streaming Services (Brenda excludes Max)
INSERT INTO user_excluded_streaming_services (user_uid, service_uid) VALUES
('user_456', 'service_max');


-- Watchlist Entries
INSERT INTO watchlist_entries (uid, user_uid, content_uid, added_at) VALUES
('watchlist_entry_1', 'user_123', 'content_inception', '2024-04-22 10:00:00'),
('watchlist_entry_2', 'user_123', 'content_stranger_things', '2024-04-22 10:15:00'),
('watchlist_entry_3', 'user_789', 'content_interstellar', '2024-04-22 11:00:00'),
('watchlist_entry_4', 'user_456', 'content_the_office', '2024-04-22 11:30:00');


-- Content Genres
INSERT INTO content_genres (content_uid, genre_uid) VALUES
('content_inception', 'genre_action'),
('content_inception', 'genre_scifi'),
('content_inception', 'genre_thriller'),
('content_stranger_things', 'genre_scifi'),
('content_stranger_things', 'genre_drama'),
('content_stranger_things', 'genre_horror'),
('content_pulp_fiction', 'genre_crime'),
('content_pulp_fiction', 'genre_drama'),
('content_the_office', 'genre_comedy'),
('content_the_office', 'genre_drama'),
('content_interstellar', 'genre_scifi'),
('content_interstellar', 'genre_drama'),
('content_the_crown', 'genre_drama'),
('content_breaking_bad', 'genre_drama'),
('content_breaking_bad', 'genre_thriller'),
('content_coco', 'genre_animation'),
('content_coco', 'genre_family'), -- Assuming 'family' is implicitly covered by animation, or would be added as new genre
('content_parasite', 'genre_drama'),
('content_parasite', 'genre_thriller'),
('content_the_martian', 'genre_scifi'),
('content_the_martian', 'genre_adventure'), -- Assuming 'adventure' is implicitly covered by action/scifi
('content_pulp_fiction', 'genre_mystery'); -- Adding another genre to demonstrate multiple genres


-- Content Streaming Availability
INSERT INTO content_streaming_availability (uid, content_uid, service_uid, watch_link, region, last_checked_at) VALUES
('csa_inception_nf', 'content_inception', 'service_netflix', 'https://www.netflix.com/title/80020675', 'GLOBAL', '2024-04-22 08:30:00'),
('csa_inception_prime', 'content_inception', 'service_prime', 'https://www.primevideo.com/detail/0HV9JF4V5O3K8B7G6H2I1J0K9L8M7N6O', 'US', '2024-04-22 08:30:00'),
('csa_stranger_things_nf', 'content_stranger_things', 'service_netflix', 'https://www.netflix.com/title/80057281', 'GLOBAL', '2024-04-22 08:30:00'),
('csa_pulp_fiction_hulu', 'content_pulp_fiction', 'service_hulu', 'https://www.hulu.com/watch/a1h2j3k4', 'US', '2024-04-22 08:30:00'),
('csa_pulp_fiction_prime', 'content_pulp_fiction', 'service_prime', 'https://www.primevideo.com/detail/b2c3d4e5', 'US', '2024-04-22 08:30:00'),
('csa_the_office_max', 'content_the_office', 'service_max', 'https://play.max.com/movie/c3d4e5f6', 'US', '2024-04-22 08:30:00'),
('csa_the_office_hulu', 'content_the_office', 'service_hulu', 'https://www.hulu.com/watch/office_series', 'US', '2024-04-22 08:30:00'),
('csa_interstellar_prime', 'content_interstellar', 'service_prime', 'https://www.primevideo.com/detail/d4e5f6g7', 'GLOBAL', '2024-04-22 08:30:00'),
('csa_interstellar_max', 'content_interstellar', 'service_max', 'https://play.max.com/movie/e5f6g7h8', 'US', '2024-04-22 08:30:00'),
('csa_the_crown_nf', 'content_the_crown', 'service_netflix', 'https://www.netflix.com/title/80080387', 'GLOBAL', '2024-04-22 08:30:00'),
('csa_breaking_bad_nf', 'content_breaking_bad', 'service_netflix', 'https://www.netflix.com/title/70143836', 'GLOBAL', '2024-04-22 08:30:00'),
('csa_breaking_bad_max', 'content_breaking_bad', 'service_max', 'https://play.max.com/movie/f6g7h8i9', 'US', '2024-04-22 08:30:00'),
('csa_coco_disney', 'content_coco', 'service_disney', 'https://www.disneyplus.com/movies/coco/1t3wB0i', 'GLOBAL', '2024-04-22 08:30:00'),
('csa_parasite_hulu', 'content_parasite', 'service_hulu', 'https://www.hulu.com/watch/e5f6g7h8', 'US', '2024-04-22 08:30:00'),
('csa_the_martian_hulu', 'content_the_martian', 'service_hulu', 'https://www.hulu.com/watch/g7h8i9j0', 'US', '2024-04-22 08:30:00'),
('csa_the_martian_disney', 'content_the_martian', 'service_disney', 'https://www.disneyplus.com/movies/the-martian/2u4xA0j', 'GLOBAL', '2024-04-22 08:30:00');