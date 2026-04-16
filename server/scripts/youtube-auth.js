const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

function resolveClientSecretPath() {
  const direct = process.env.YT_CLIENT_SECRET_PATH;
  if (direct && fs.existsSync(direct)) {
    return direct;
  }

  const defaults = [
    path.resolve(__dirname, '../secrets/client_secret.json'),
    path.resolve(__dirname, '../../secreats/client_secret.json'),
  ];

  for (const candidate of defaults) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveTokenPath() {
  return process.env.YT_TOKEN_PATH || path.resolve(__dirname, '../secrets/youtube_token.json');
}

function loadClientCredentials() {
  const clientSecretPath = resolveClientSecretPath();
  if (!clientSecretPath) {
    throw new Error('Missing OAuth client file. Expected server/secrets/client_secret.json or YT_CLIENT_SECRET_PATH.');
  }

  const parsed = JSON.parse(fs.readFileSync(clientSecretPath, 'utf8'));
  const creds = parsed.installed || parsed.web;

  if (!creds || !creds.client_id || !creds.client_secret) {
    throw new Error('Invalid client secret JSON format.');
  }

  return {
    clientSecretPath,
    credentials: creds,
  };
}

function promptForCode(url) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('Authorize this app by visiting the URL:');
    console.log(url);
    rl.question('Paste authorization code here: ', (code) => {
      rl.close();
      resolve(code.trim());
    });
  });
}

async function getAuthorizedClient(scopes) {
  const { credentials } = loadClientCredentials();
  const tokenPath = resolveTokenPath();
  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    (credentials.redirect_uris && credentials.redirect_uris[0]) || 'http://localhost'
  );

  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oauth2Client.setCredentials(token);
    return oauth2Client;
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });

  let code = process.env.YT_AUTH_CODE || '';
  if (!code) {
    if (!process.stdin.isTTY) {
      throw new Error(`OAuth authorization required. Open this URL and rerun with YT_AUTH_CODE:\n${authUrl}`);
    }
    code = await promptForCode(authUrl);
  }

  const tokenResponse = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokenResponse.tokens);

  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(tokenResponse.tokens, null, 2), 'utf8');
  console.log(`OAuth token saved: ${tokenPath}`);

  return oauth2Client;
}

module.exports = {
  getAuthorizedClient,
  resolveClientSecretPath,
  resolveTokenPath,
};
