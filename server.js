const express = require('express');
const nodemailer = require('nodemailer');
const { Pool, Client } = require('pg');
const app = express();
const port = process.env.PORT || 3000;
const admin = require('./firebase_admin');
const bp = require('body-parser');
const moment = require('moment');

app.use(bp.json());
app.use(bp.urlencoded({ extended: true }));

const DEFAULT_AVATAR =
  'https://user-images.githubusercontent.com/79369571/182101394-89e63593-11a1-4aed-8ec5-9638d9c62a81.png';

//MUST-CONFIG
// Database URL
const pool = new Pool({
  connectionString:
    'postgres://khuatdangquang11a9:gxdi8uMEN4vT@tiny-glitter-399565.us-east-2.aws.neon.tech/main?options=project%3Dtiny-glitter-399565&sslmode=require',
  ssl: {
    rejectUnauthorized: false,
  },
});

// Get user info from database with jwt firebase token
const fetchUserInfo = async (token) => {
  // 1) Extracts token
  const decodedToken = await admin.auth().verifyIdToken(token);

  const { email, uid, name } = decodedToken;

  // 2) Fetches userInfo in a mock function
  const userRes = await pool.query(
    'SELECT * FROM public."User" WHERE email=$1',
    [email],
  );

  let users = userRes.rows;

  if (!users || users.length === 0) {
    const insertUserRes = await pool.query(
      'INSERT INTO public."User" (uid, full_name, email, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [uid, name ?? email, email, decodedToken.picture ?? DEFAULT_AVATAR],
    );
    users = insertUserRes.rows;
  }

  // 3) Return hasura variables
  return users;
};

// GET: Hasura user information
app.get('/', async (request, response) => {
  // Extract token from request
  let token = request.get('Authorization');
  try {
    // Fetch user_id that is associated with this token
    const users = await fetchUserInfo(token.replace(/^Bearer\s/, ''));

    let hasuraVariables = {};

    if (users.length > 0) {
      hasuraVariables = {
        'X-Hasura-Role': 'user',
        'X-Hasura-User-Id': `${users[0].id}`,
      };
    }

    // Return appropriate response to Hasura
    response.json({
      ...hasuraVariables,
      token: token ?? 'empty',
    });
  } catch (error) {
    response.json({ error, token: token ?? 'empty' });
  }
});

// GET: trigger webhook get or create user when login
app.get('/webhook', async (request, response) => {
  // Extract token from request
  var token = request.get('Authorization');

  // Fetch user_id that is associated with this token
  const user = await fetchUserInfo(token);

  let hasuraVariables = {};

  if (user.length > 0) {
    hasuraVariables = {
      'X-Hasura-Role': 'user',
      'X-Hasura-User-Id': `${user[0].id}`,
    };
  }
  // Return appropriate response to Hasura
  response.json(hasuraVariables);
});

// POST: Callback for sign in with apple
app.post('/callback', async (request, response) => {
  const redirect = `intent://callback?${new URLSearchParams(
    request.body,
  ).toString()}#Intent;package=dev.timistudio.monsey;scheme=signinwithapple;end`;

  response.redirect(307, redirect);
});

// listen for requests :)
app.listen(port, function () {
  console.log('Your app is listening on port ' + port);
});

// Export the Express API
module.exports = app;
