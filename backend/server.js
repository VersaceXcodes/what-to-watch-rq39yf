import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config();

// ESM workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'a_very_secret_key_for_jwt'; // Default for development

// PostgreSQL Pool Configuration
const { Pool } = pkg;
const { DATABASE_URL, PGHOST, PGDATABASE, PGUSER, PGPASSWORD, PGPORT = 5432 } = process.env;

const pool = new Pool(
  DATABASE_URL
    ? {
        connectionString: DATABASE_URL,
        ssl: { require: true }
      }
    : {
        host: PGHOST,
        database: PGDATABASE,
        user: PGUSER,
        password: PGPASSWORD,
        port: Number(PGPORT),
        ssl: { require: true }, // Ensure SSL is required as per snippet
      }
);

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies

// Morgan middleware for request logging
morgan.token('headers', (req, res) => JSON.stringify(req.headers));
morgan.token('params', (req, res) => JSON.stringify(req.params));
morgan.token('query', (req, res) => JSON.stringify(req.query));
morgan.token('body', (req, res) => JSON.stringify(req.body));
app.use(morgan(':method :url :status :res[content-length] - :response-time ms :headers :params :query :body'));


/**
 * Helper function to generate a new UUID.
 * @returns {string} A new UUID string.
 */
function generate_uid() {
  return uuidv4();
}

/**
 * Helper function to get current UTC timestamp in ISO 8601 format.
 * @returns {string} Current timestamp string.
 */
function get_current_timestamp() {
  return new Date().toISOString();
}

/**
 * Hashes a plain-text password.
 * @param {string} password - The plain-text password.
 * @returns {Promise<string>} The hashed password.
 */
async function hash_password(password) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Compares a plain-text password with a hashed password.
 * @param {string} password - The plain-text password.
 * @param {string} hash - The hashed password.
 * @returns {Promise<boolean>} True if passwords match, false otherwise.
 */
async function compare_password(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generates a JWT token for a given user.
 * @param {object} user - User object containing uid and email.
 * @returns {string} The generated JWT token.
 */
function generate_token(user) {
  return jwt.sign({ uid: user.uid, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
}

/**
 * Middleware to authenticate JWT token.
 * Extracts token from Authorization header, verifies it, and attaches user info to req.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Unauthorized: Token expired' });
      }
      return res.status(403).json({ success: false, message: 'Forbidden: Invalid token' });
    }
    req.user = user;
    next();
  });
}

// Routes

/**
 * POST /api/v1/auth/signup
 * @summary Register a new user
 * @description Allows a new user to create an account by providing an email address and a password.
 * Upon successful registration, the user is automatically logged in and a JWT token is returned.
 * Also initializes default user settings.
 */
app.post('/api/v1/auth/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
  }

  const client = await pool.connect();
  try {
    // Check if user already exists
    const userExists = await client.query('SELECT uid FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'User with this email already exists' });
    }

    // Hash password and create user
    const password_hash = await hash_password(password);
    const uid = generate_uid();
    const created_at = get_current_timestamp();
    const updated_at = created_at;

    await client.query(
      'INSERT INTO users (uid, email, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
      [uid, email, password_hash, created_at, updated_at]
    );

    // Initialize default user settings for the new user
    await client.query(
      `INSERT INTO user_settings (user_uid, min_release_year, max_release_year, preferred_duration_category, min_rating, preferred_content_type, parental_rating_filter_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uid, 1900, new Date().getFullYear(), 'any', 0.0, 'both', '[]']
    );

    const token = generate_token({ uid, email });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: { uid, email, created_at },
      token
    });

  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).json({ success: false, message: 'Internal server error during signup' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/auth/login
 * @summary Log in an existing user
 * @description Authenticates an existing user based on their email and password.
 * Returns a JWT token on successful login.
 */
app.post('/api/v1/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query('SELECT uid, email, password_hash FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !(await compare_password(password, user.password_hash))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Update updated_at timestamp
    await client.query('UPDATE users SET updated_at = $1 WHERE uid = $2', [get_current_timestamp(), user.uid]);

    const token = generate_token({ uid: user.uid, email: user.email });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: { uid: user.uid, email: user.email },
      token
    });

  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ success: false, message: 'Internal server error during login' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/auth/me
 * @summary Get current authenticated user's profile
 * @description Retrieves the profile information of the currently authenticated user.
 * Requires a valid JWT token.
 */
app.get('/api/v1/auth/me', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT uid, email, created_at, updated_at FROM users WHERE uid = $1', [req.user.uid]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ success: false, message: 'Internal server error fetching user profile' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/users/me/preferences
 * @summary Get logged-in user's saved default preferences
 * @description Fetches the logged-in user's saved default filtering preferences,
 * including mood, release year range, duration, rating, content type, parental ratings,
 * default streaming services, and default/excluded genres.
 * Requires a valid JWT token.
 */
app.get('/api/v1/users/me/preferences', authenticateToken, async (req, res) => {
  const user_uid = req.user.uid;
  const client = await pool.connect();

  try {
    // Fetch user settings
    const settingsResult = await client.query(
      `SELECT
         us.default_mood_uid,
         m.name as default_mood_name,
         m.icon_emoji as default_mood_icon,
         us.min_release_year,
         us.max_release_year,
         us.preferred_duration_category,
         us.min_rating,
         us.preferred_content_type,
         us.parental_rating_filter_json
       FROM user_settings us
       LEFT JOIN moods m ON us.default_mood_uid = m.uid
       WHERE us.user_uid = $1`,
      [user_uid]
    );
    const settings = settingsResult.rows[0];

    if (!settings) {
      return res.status(404).json({ success: false, message: 'User settings not found' });
    }

    // Fetch selected streaming services
    const defaultServicesResult = await client.query(
      `SELECT ss.uid, ss.name, ss.logo_url
       FROM user_default_streaming_services uds
       JOIN streaming_services ss ON uds.service_uid = ss.uid
       WHERE uds.user_uid = $1`,
      [user_uid]
    );
    settings.selected_streaming_services = defaultServicesResult.rows;

    // Fetch selected genres
    const defaultGenresResult = await client.query(
      `SELECT g.uid, g.name
       FROM user_default_genres udg
       JOIN genres g ON udg.genre_uid = g.uid
       WHERE udg.user_uid = $1`,
      [user_uid]
    );
    settings.selected_genres = defaultGenresResult.rows;

    // Fetch excluded genres
    const excludedGenresResult = await client.query(
      `SELECT g.uid, g.name
       FROM user_excluded_genres ueg
       JOIN genres g ON ueg.genre_uid = g.uid
       WHERE ueg.user_uid = $1`,
      [user_uid]
    );
    settings.excluded_genres = excludedGenresResult.rows;

    // Fetch excluded streaming services
    const excludedServicesResult = await client.query(
      `SELECT ss.uid, ss.name, ss.logo_url
       FROM user_excluded_streaming_services ues
       JOIN streaming_services ss ON ues.service_uid = ss.uid
       WHERE ues.user_uid = $1`,
      [user_uid]
    );
    settings.excluded_streaming_services = excludedServicesResult.rows;

    res.status(200).json({
      success: true,
      preferences: settings
    });

  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({ success: false, message: 'Internal server error fetching preferences' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/v1/users/me/preferences
 * @summary Update logged-in user's saved default preferences
 * @description Updates the logged-in user's default filtering preferences.
 * This operation involves updating the main user_settings record and managing
 * the relationships in multiple junction tables for streaming services and genres.
 * Requires a valid JWT token.
 */
app.put('/api/v1/users/me/preferences', authenticateToken, async (req, res) => {
  const user_uid = req.user.uid;
  const {
    default_mood_uid,
    min_release_year = 1900,
    max_release_year = new Date().getFullYear(),
    preferred_duration_category = 'any',
    min_rating = 0.0,
    preferred_content_type = 'both',
    parental_rating_filter_json = '[]', // Should be a stringified JSON array
    selected_service_uids = [],
    selected_genre_uids = [],
    excluded_genre_uids = [],
    excluded_service_uids = []
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // Start transaction

    // 1. Update user_settings
    await client.query(
      `UPDATE user_settings SET
         default_mood_uid = $1,
         min_release_year = $2,
         max_release_year = $3,
         preferred_duration_category = $4,
         min_rating = $5,
         preferred_content_type = $6,
         parental_rating_filter_json = $7
       WHERE user_uid = $8`,
      [
        default_mood_uid,
        min_release_year,
        max_release_year,
        preferred_duration_category,
        min_rating,
        preferred_content_type,
        parental_rating_filter_json,
        user_uid
      ]
    );

    // 2. Manage user_default_streaming_services
    await client.query('DELETE FROM user_default_streaming_services WHERE user_uid = $1', [user_uid]);
    if (selected_service_uids.length > 0) {
      const defaultServiceValues = selected_service_uids.map(s_uid => `('${user_uid}', '${s_uid}')`).join(',');
      await client.query(`INSERT INTO user_default_streaming_services (user_uid, service_uid) VALUES ${defaultServiceValues}`);
    }

    // 3. Manage user_default_genres
    await client.query('DELETE FROM user_default_genres WHERE user_uid = $1', [user_uid]);
    if (selected_genre_uids.length > 0) {
      const defaultGenreValues = selected_genre_uids.map(g_uid => `('${user_uid}', '${g_uid}')`).join(',');
      await client.query(`INSERT INTO user_default_genres (user_uid, genre_uid) VALUES ${defaultGenreValues}`);
    }

    // 4. Manage user_excluded_genres
    await client.query('DELETE FROM user_excluded_genres WHERE user_uid = $1', [user_uid]);
    if (excluded_genre_uids.length > 0) {
      const excludedGenreValues = excluded_genre_uids.map(g_uid => `('${user_uid}', '${g_uid}')`).join(',');
      await client.query(`INSERT INTO user_excluded_genres (user_uid, genre_uid) VALUES ${excludedGenreValues}`);
    }

    // 5. Manage user_excluded_streaming_services
    await client.query('DELETE FROM user_excluded_streaming_services WHERE user_uid = $1', [user_uid]);
    if (excluded_service_uids.length > 0) {
      const excludedServiceValues = excluded_service_uids.map(s_uid => `('${user_uid}', '${s_uid}')`).join(',');
      await client.query(`INSERT INTO user_excluded_streaming_services (user_uid, service_uid) VALUES ${excludedServiceValues}`);
    }

    await client.query('COMMIT'); // Commit transaction
    res.status(200).json({ success: true, message: 'Preferences updated successfully' });

  } catch (error) {
    await client.query('ROLLBACK'); // Rollback transaction on error
    console.error('Error updating user preferences:', error);
    res.status(500).json({ success: false, message: 'Internal server error updating preferences' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/recommendations
 * @summary Get movie and TV show recommendations based on filters.
 * @description Generates a paginated list of movie and TV show recommendations based on the user's provided filtering criteria.
 * Supports both guest users and logged-in users.
 */
app.post('/api/v1/recommendations', async (req, res) => {
  const {
    mood_uid, // not directly used in the query filter for MVP, frontend uses it to suggest genres
    streaming_service_uids,
    genre_uids,
    min_release_year = 1900,
    max_release_year = new Date().getFullYear(),
    preferred_duration_category = 'any', // "any", "short", "medium", "long"
    min_rating = 0.0,
    preferred_content_type = 'both', // "both", "movie", "tv_show"
    parental_rating_filter_json = '[]',
    excluded_genre_uids = [],
    excluded_service_uids = [],
    page = 1,
    page_size = 20
  } = req.body;

  const client = await pool.connect();
  try {
    const offset = (page - 1) * page_size;

    let query = `
      SELECT
          c.uid,
          c.external_api_id,
          c.title,
          c.release_year,
          c.content_type,
          c.poster_url,
          c.synopsis,
          c.tagline,
          c.duration_minutes,
          c.number_of_seasons,
          c.imdb_rating,
          c.rotten_tomatoes_score,
          c.parental_rating,
          c.director,
          c.main_cast,
          json_agg(DISTINCT jsonb_build_object('uid', g.uid, 'name', g.name)) FILTER (WHERE g.uid IS NOT NULL) AS genres,
          json_agg(DISTINCT jsonb_build_object(
              'service_uid', ss.uid,
              'name', ss.name,
              'logo_url', ss.logo_url,
              'watch_link', csa.watch_link
          )) FILTER (WHERE ss.uid IS NOT NULL) AS available_on_services
      FROM
          content c
      LEFT JOIN
          content_genres cg ON c.uid = cg.content_uid
      LEFT JOIN
          genres g ON cg.genre_uid = g.uid
      LEFT JOIN
          content_streaming_availability csa ON c.uid = csa.content_uid
      LEFT JOIN
          streaming_services ss ON csa.service_uid = ss.uid
    `;

    const queryParams = [];
    const whereClauses = [];

    // Filter by content type
    if (preferred_content_type !== 'both') {
      queryParams.push(preferred_content_type);
      whereClauses.push(`c.content_type = $${queryParams.length}`);
    }

    // Filter by release year
    if (min_release_year && max_release_year) {
      queryParams.push(min_release_year, max_release_year);
      whereClauses.push(`c.release_year BETWEEN $${queryParams.length - 1} AND $${queryParams.length}`);
    }

    // Filter by minimum rating
    if (min_rating > 0) {
      queryParams.push(min_rating, min_rating); // Pass min_rating twice for IMDB and Rotten Tomatoes
      whereClauses.push(`(c.imdb_rating >= $${queryParams.length - 1} OR c.rotten_tomatoes_score >= $${queryParams.length})`);
    }

    // Filter by parental rating
    if (parental_rating_filter_json && parental_rating_filter_json !== '[]') {
      const parentalRatings = JSON.parse(parental_rating_filter_json);
      if (parentalRatings.length > 0) {
        queryParams.push(...parentalRatings);
        whereClauses.push(`c.parental_rating IN (${parentalRatings.map((_, i) => `$${queryParams.length - parentalRatings.length + 1 + i}`).join(',')})`);
      }
    }

    // Filter by preferred duration category
    if (preferred_duration_category !== 'any') {
      let durationCondition = '';
      switch (preferred_duration_category) {
        case 'short':
          durationCondition = `(c.content_type = 'movie' AND c.duration_minutes < 60) OR (c.content_type = 'tv_show' AND c.number_of_seasons = 1)`;
          break;
        case 'medium':
          durationCondition = `(c.content_type = 'movie' AND c.duration_minutes BETWEEN 60 AND 120) OR (c.content_type = 'tv_show' AND c.number_of_seasons BETWEEN 2 AND 4)`;
          break;
        case 'long':
          durationCondition = `(c.content_type = 'movie' AND c.duration_minutes > 120) OR (c.content_type = 'tv_show' AND c.number_of_seasons > 4)`;
          break;
      }
      if (durationCondition) {
        whereClauses.push(`(${durationCondition})`);
      }
    }

    // Filter by selected genres (only apply if genres are specified)
    if (genre_uids && genre_uids.length > 0) {
      queryParams.push(...genre_uids);
      whereClauses.push(`g.uid IN (${genre_uids.map((_, i) => `$${queryParams.length - genre_uids.length + 1 + i}`).join(',')})`);
    }

    // Exclude by genres
    if (excluded_genre_uids && excluded_genre_uids.length > 0) {
      queryParams.push(...excluded_genre_uids);
      whereClauses.push(`g.uid NOT IN (${excluded_genre_uids.map((_, i) => `$${queryParams.length - excluded_genre_uids.length + 1 + i}`).join(',')})`);
    }

    // Filter by streaming services (must be available on selected, and not on excluded)
    // This is generally handled by the JOIN and the IN clause for selected_service_uids.
    // If no specific services are selected, it means "any service".
    if (streaming_service_uids && streaming_service_uids.length > 0) {
      queryParams.push(...streaming_service_uids);
      whereClauses.push(`ss.uid IN (${streaming_service_uids.map((_, i) => `$${queryParams.length - streaming_service_uids.length + 1 + i}`).join(',')})`);
    }

    // Exclude streaming services
    if (excluded_service_uids && excluded_service_uids.length > 0) {
      queryParams.push(...excluded_service_uids);
      whereClauses.push(`ss.uid NOT IN (${excluded_service_uids.map((_, i) => `$${queryParams.length - excluded_service_uids.length + 1 + i}`).join(',')})`);
    }


    // Construct the WHERE clause if conditions exist
    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += `
      GROUP BY
          c.uid
      ORDER BY
          c.rotten_tomatoes_score DESC, c.imdb_rating DESC -- Prioritize higher rated content first
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2};
    `;

    // Count total results for pagination metadata (excluding LIMIT/OFFSET)
    const countQuery = `
      SELECT COUNT(DISTINCT c.uid)
      FROM content c
      LEFT JOIN content_genres cg ON c.uid = cg.content_uid
      LEFT JOIN genres g ON cg.genre_uid = g.uid
      LEFT JOIN content_streaming_availability csa ON c.uid = csa.content_uid
      LEFT JOIN streaming_services ss ON csa.service_uid = ss.uid
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
    `;
    const countResult = await client.query(countQuery, queryParams);
    const total_results = parseInt(countResult.rows[0].count);


    queryParams.push(page_size, offset);
    const result = await client.query(query, queryParams);

    // Format the results to match OpenAPI schema
    const formattedRecommendations = result.rows.map(row => ({
      uid: row.uid,
      external_api_id: row.external_api_id,
      title: row.title,
      release_year: row.release_year,
      content_type: row.content_type,
      poster_url: row.poster_url,
      synopsis: row.synopsis,
      tagline: row.tagline,
      duration_minutes: row.duration_minutes,
      number_of_seasons: row.number_of_seasons,
      imdb_rating: row.imdb_rating ? parseFloat(row.imdb_rating) : null,
      rotten_tomatoes_score: row.rotten_tomatoes_score,
      parental_rating: row.parental_rating,
      director: row.director,
      main_cast: row.main_cast, // Stored as JSON array string, pass as is
      genres: row.genres || [],
      available_on_services: row.available_on_services || []
    }));

    res.status(200).json({
      success: true,
      recommendations: formattedRecommendations,
      total_results,
      page,
      page_size
    });

  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ success: false, message: 'Internal server error getting recommendations' });
  } finally {
    client.release();
  }
});


/**
 * POST /api/v1/users/me/watchlist
 * @summary Add content to the logged-in user's watchlist
 * @description Adds a specific movie or TV show to the logged-in user's watchlist.
 * Requires a valid JWT token.
 */
app.post('/api/v1/users/me/watchlist', authenticateToken, async (req, res) => {
  const user_uid = req.user.uid;
  const { content_uid } = req.body;

  if (!content_uid) {
    return res.status(400).json({ success: false, message: 'content_uid is required' });
  }

  const client = await pool.connect();
  try {
    // Check if content_uid exists
    const contentExists = await client.query('SELECT uid FROM content WHERE uid = $1', [content_uid]);
    if (contentExists.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Content not found' });
    }

    // Check if already in watchlist
    const alreadyInWatchlist = await client.query(
      'SELECT uid FROM watchlist_entries WHERE user_uid = $1 AND content_uid = $2 LIMIT 1',
      [user_uid, content_uid]
    );
    if (alreadyInWatchlist.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Content already in watchlist' });
    }

    const uid = generate_uid();
    const added_at = get_current_timestamp();

    await client.query(
      'INSERT INTO watchlist_entries (uid, user_uid, content_uid, added_at) VALUES ($1, $2, $3, $4)',
      [uid, user_uid, content_uid, added_at]
    );

    res.status(201).json({ success: true, message: 'Content added to watchlist successfully' });

  } catch (error) {
    console.error('Error adding to watchlist:', error);
    res.status(500).json({ success: false, message: 'Internal server error adding to watchlist' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/v1/users/me/watchlist/{content_uid}
 * @summary Remove content from the logged-in user's watchlist
 * @description Removes a specific movie or TV show from the logged-in user's watchlist.
 * Requires a valid JWT token.
 */
app.delete('/api/v1/users/me/watchlist/:content_uid', authenticateToken, async (req, res) => {
  const user_uid = req.user.uid;
  const { content_uid } = req.params;

  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM watchlist_entries WHERE user_uid = $1 AND content_uid = $2',
      [user_uid, content_uid]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Content not found in watchlist' });
    }

    res.status(200).json({ success: true, message: 'Content removed from watchlist successfully' });

  } catch (error) {
    console.error('Error removing from watchlist:', error);
    res.status(500).json({ success: false, message: 'Internal server error removing from watchlist' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/users/me/watchlist
 * @summary Get the logged-in user's watchlist
 * @description Retrieves the full list of content currently on the logged-in user's watchlist.
 * Requires a valid JWT token.
 */
app.get('/api/v1/users/me/watchlist', authenticateToken, async (req, res) => {
  const user_uid = req.user.uid;
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT
          c.uid,
          c.external_api_id,
          c.title,
          c.release_year,
          c.content_type,
          c.poster_url,
          c.synopsis,
          c.tagline,
          c.duration_minutes,
          c.number_of_seasons,
          c.imdb_rating,
          c.rotten_tomatoes_score,
          c.parental_rating,
          c.director,
          c.main_cast,
          json_agg(DISTINCT jsonb_build_object('uid', g.uid, 'name', g.name)) FILTER (WHERE g.uid IS NOT NULL) AS genres,
          json_agg(DISTINCT jsonb_build_object(
              'service_uid', ss.uid,
              'name', ss.name,
              'logo_url', ss.logo_url,
              'watch_link', csa.watch_link
          )) FILTER (WHERE ss.uid IS NOT NULL) AS available_on_services,
          we.added_at
       FROM
           watchlist_entries we
       JOIN
           content c ON we.content_uid = c.uid
       LEFT JOIN
           content_genres cg ON c.uid = cg.content_uid
       LEFT JOIN
           genres g ON cg.genre_uid = g.uid
       LEFT JOIN
           content_streaming_availability csa ON c.uid = csa.content_uid
       LEFT JOIN
           streaming_services ss ON csa.service_uid = ss.uid
       WHERE
           we.user_uid = $1
       GROUP BY
           c.uid, we.added_at
       ORDER BY
           we.added_at DESC;`,
      [user_uid]
    );

    const formattedWatchlist = result.rows.map(row => ({
      uid: row.uid,
      external_api_id: row.external_api_id,
      title: row.title,
      release_year: row.release_year,
      content_type: row.content_type,
      poster_url: row.poster_url,
      synopsis: row.synopsis,
      tagline: row.tagline,
      duration_minutes: row.duration_minutes,
      number_of_seasons: row.number_of_seasons,
      imdb_rating: row.imdb_rating ? parseFloat(row.imdb_rating) : null,
      rotten_tomatoes_score: row.rotten_tomatoes_score,
      parental_rating: row.parental_rating,
      director: row.director,
      main_cast: row.main_cast, // Stored as JSON array string, pass as is
      genres: row.genres || [],
      available_on_services: row.available_on_services || [],
      added_at: row.added_at // Added timestamp specifically for watchlist
    }));

    res.status(200).json({
      success: true,
      watchlist: formattedWatchlist
    });

  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({ success: false, message: 'Internal server error fetching watchlist' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/content/{content_uid}
 * @summary Get detailed information for a specific movie or TV show
 * @description Retrieves detailed information for a specific movie or TV show.
 * If an authenticated user makes the request, it also checks if the content is in their watchlist.
 */
app.get('/api/v1/content/:content_uid', async (req, res) => {
  const { content_uid } = req.params;
  const user_uid = req.user ? req.user.uid : null; // Check if user is authenticated

  const client = await pool.connect();
  try {
    let query = `
      SELECT
          c.uid,
          c.external_api_id,
          c.title,
          c.release_year,
          c.content_type,
          c.poster_url,
          c.synopsis,
          c.tagline,
          c.duration_minutes,
          c.number_of_seasons,
          c.imdb_rating,
          c.rotten_tomatoes_score,
          c.parental_rating,
          c.director,
          c.main_cast,
          json_agg(DISTINCT jsonb_build_object('uid', g.uid, 'name', g.name)) FILTER (WHERE g.uid IS NOT NULL) AS genres,
          json_agg(DISTINCT jsonb_build_object(
              'service_uid', ss.uid,
              'name', ss.name,
              'logo_url', ss.logo_url,
              'watch_link', csa.watch_link
          )) FILTER (WHERE ss.uid IS NOT NULL) AS available_on_services
          ${user_uid ? `, EXISTS (SELECT 1 FROM watchlist_entries we WHERE we.user_uid = $2 AND we.content_uid = c.uid) AS is_on_watchlist` : ''}
      FROM
          content c
      LEFT JOIN
          content_genres cg ON c.uid = cg.content_uid
      LEFT JOIN
          genres g ON cg.genre_uid = g.uid
      LEFT JOIN
          content_streaming_availability csa ON c.uid = csa.content_uid
      LEFT JOIN
          streaming_services ss ON csa.service_uid = ss.uid
      WHERE
          c.uid = $1
      GROUP BY
          c.uid;
    `;

    const queryParams = [content_uid];
    if (user_uid) {
      queryParams.push(user_uid); // Add user_uid to params if authenticated
    }

    const result = await client.query(query, queryParams);
    const content = result.rows[0];

    if (!content) {
      return res.status(404).json({ success: false, message: 'Content not found' });
    }

    // Format the content object
    const formattedContent = {
      uid: content.uid,
      external_api_id: content.external_api_id,
      title: content.title,
      release_year: content.release_year,
      content_type: content.content_type,
      poster_url: content.poster_url,
      synopsis: content.synopsis,
      tagline: content.tagline,
      duration_minutes: content.duration_minutes,
      number_of_seasons: content.number_of_seasons,
      imdb_rating: content.imdb_rating ? parseFloat(content.imdb_rating) : null,
      rotten_tomatoes_score: content.rotten_tomatoes_score,
      parental_rating: content.parental_rating,
      director: content.director,
      main_cast: content.main_cast, // Stored as JSON array string, pass as is
      genres: content.genres || [],
      available_on_services: content.available_on_services || []
    };

    if (user_uid) {
      formattedContent.is_on_watchlist = content.is_on_watchlist;
    }

    res.status(200).json({
      success: true,
      content: formattedContent
    });

  } catch (error) {
    console.error('Error fetching content details:', error);
    res.status(500).json({ success: false, message: 'Internal server error fetching content details' });
  } finally {
    client.release();
  }
});


/**
 * GET /api/v1/lookup/streaming_services
 * @summary Get a list of all available streaming services
 * @description Retrieves a list of all active streaming services available for selection.
 */
app.get('/api/v1/lookup/streaming_services', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT uid, name, logo_url, base_url FROM streaming_services WHERE is_active = TRUE ORDER BY name ASC');
    res.status(200).json({
      success: true,
      streaming_services: result.rows
    });
  } catch (error) {
    console.error('Error fetching streaming services:', error);
    res.status(500).json({ success: false, message: 'Internal server error fetching streaming services' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/lookup/genres
 * @summary Get a list of all available content genres
 * @description Retrieves a list of all predefined content genres.
 */
app.get('/api/v1/lookup/genres', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT uid, name FROM genres ORDER BY name ASC');
    res.status(200).json({
      success: true,
      genres: result.rows
    });
  } catch (error) {
    console.error('Error fetching genres:', error);
    res.status(500).json({ success: false, message: 'Internal server error fetching genres' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/v1/lookup/moods
 * @summary Get a list of all predefined moods
 * @description Retrieves a list of all predefined moods for recommendation filtering.
 */
app.get('/api/v1/lookup/moods', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT uid, name, icon_emoji FROM moods ORDER BY name ASC');
    res.status(200).json({
      success: true,
      moods: result.rows
    });
  } catch (error) {
    console.error('Error fetching moods:', error);
    res.status(500).json({ success: false, message: 'Internal server error fetching moods' });
  } finally {
    client.release();
  }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all route for SPA routing (should be after all API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});