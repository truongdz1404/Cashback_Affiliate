const configStore = require('./configStore');

// Verifies a Google Identity Services ID token by asking Google's own
// tokeninfo endpoint (no extra dependency, no local JWKS caching needed at
// this scale) and checking the audience matches our configured client ID.
// Returns { providerId, email, name } on success, throws on any failure.
async function verifyGoogleIdToken(idToken) {
  const clientId = await configStore.get('googleClientId');
  if (!clientId) {
    const err = new Error('not_configured');
    err.notConfigured = true;
    throw err;
  }

  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw new Error('invalid Google id token');
  const payload = await res.json();

  if (payload.aud !== clientId) throw new Error('Google id token audience mismatch');
  if (!payload.sub) throw new Error('Google id token missing sub');

  return { providerId: payload.sub, email: payload.email || null, name: payload.name || null };
}

// Verifies a Facebook access token in two steps against the Graph API:
// debug_token confirms it was actually issued for our app (not some other
// app's token replayed here), then /me reads the profile it grants access to.
async function verifyFacebookAccessToken(accessToken) {
  const appId = await configStore.get('facebookAppId');
  const appSecret = await configStore.get('facebookAppSecret');
  if (!appId || !appSecret) {
    const err = new Error('not_configured');
    err.notConfigured = true;
    throw err;
  }

  const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
  const debugRes = await fetch(debugUrl);
  if (!debugRes.ok) throw new Error('invalid Facebook access token');
  const debug = await debugRes.json();
  const data = debug && debug.data;
  if (!data || !data.is_valid || String(data.app_id) !== String(appId)) {
    throw new Error('Facebook access token failed verification');
  }

  const meRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`);
  if (!meRes.ok) throw new Error('could not read Facebook profile');
  const me = await meRes.json();
  if (!me.id) throw new Error('Facebook profile missing id');

  return { providerId: me.id, email: me.email || null, name: me.name || null };
}

module.exports = { verifyGoogleIdToken, verifyFacebookAccessToken };
