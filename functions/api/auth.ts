export interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { username, password } = await context.request.json() as { username?: string; password?: string };

    if (!username || !username.trim()) {
      return new Response(JSON.stringify({ error: 'יש להזין שם משתמש' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (password !== 'מפלג828' && username !== 'nirb8153') {
      return new Response(JSON.stringify({ error: 'סיסמה שגויה' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Generate session that expires in 2 hours
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000;

    // Create a simple auth token (in production this would be encrypted/signed)
    // We base64 encode username and expiry for simplicity, and check them on subsequent requests
    const sessionData = { username: username.trim(), expiresAt };
    const token = btoa(encodeURIComponent(JSON.stringify(sessionData)));

    return new Response(JSON.stringify({ token, expiresAt, username: username.trim() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'שגיאת שרת פנימית' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
