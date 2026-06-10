export interface Session {
  username: string;
  expiresAt: number;
}

export function verifySession(request: Request): Session | null {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = JSON.parse(decodeURIComponent(atob(token))) as Session;

    if (!decoded.username || !decoded.expiresAt) {
      return null;
    }

    if (Date.now() > decoded.expiresAt) {
      return null;
    }

    return decoded;
  } catch (e) {
    return null;
  }
}

export function createErrorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function createJSONResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
