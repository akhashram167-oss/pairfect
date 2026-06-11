exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { ok: false, error: 'Email list is not connected yet. Add BREVO_API_KEY in Netlify environment variables.' });
  }

  let email = '';
  try {
    const body = JSON.parse(event.body || '{}');
    email = String(body.email || '').trim().toLowerCase();
  } catch (error) {
    return jsonResponse(400, { ok: false, error: 'Invalid request body' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(400, { ok: false, error: 'Invalid email' });
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        email,
        updateEnabled: true
      })
    });

    if (!response.ok) {
      const details = await response.text();
      if (isAlreadySubscribed(response.status, details)) {
        return jsonResponse(200, { ok: true, alreadySubscribed: true });
      }

      console.error('Brevo contact save failed:', response.status, details);
      return jsonResponse(502, { ok: false, error: brevoErrorMessage(details) });
    }

    return jsonResponse(200, { ok: true });
  } catch (error) {
    console.error('Brevo request failed:', error);
    return jsonResponse(502, { ok: false, error: 'Brevo request failed' });
  }
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function isAlreadySubscribed(status, details) {
  if (status !== 400 && status !== 409) return false;
  return /already|duplicate|associated/i.test(details || '');
}

function brevoErrorMessage(details) {
  try {
    const parsed = JSON.parse(details);
    if (parsed && parsed.message) return `Email list error: ${parsed.message}`;
  } catch (error) {}

  return 'Email list error: Brevo could not save this email. Check the API key and contact-list settings.';
}
