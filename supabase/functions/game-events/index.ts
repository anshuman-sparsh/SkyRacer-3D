// Optional, rate-limited gameplay telemetry. Never needed to play or rank.
// User JWT is required; the admin client and database RPC remain server-only.
import { withSupabase } from 'npm:@supabase/server@^1';
import { validateGameplayEvent } from './validation.js';

const MAX_REQUEST_LENGTH = 2048;
const errorResponse = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return errorResponse('Player session required.', 401);
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Allow': 'POST',
          'Cache-Control': 'no-store' },
      });
    }

    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (!Number.isFinite(declaredLength) || declaredLength > MAX_REQUEST_LENGTH) {
      return errorResponse('Event is too large.', 413);
    }

    let input: unknown;
    try {
      const body = await request.text();
      if (body.length > MAX_REQUEST_LENGTH) return errorResponse('Event is too large.', 413);
      input = JSON.parse(body);
    } catch {
      return errorResponse('Invalid JSON.', 400);
    }
    const event = validateGameplayEvent(input);
    if (!event) return errorResponse('Invalid gameplay event.', 400);

    const { data, error } = await ctx.supabaseAdmin.rpc('record_gameplay_event', {
      p_user_id: userId,
      p_event_id: event.eventId,
      p_session_id: event.sessionId,
      p_event_name: event.eventName,
      p_mode: event.mode,
      p_score: event.score,
      p_rings: event.rings,
      p_distance: event.distance,
      p_duration_seconds: event.durationSeconds,
      p_reason: event.reason,
    });
    if (error) {
      if (error.message?.includes('ANALYTICS_RATE_LIMIT')) {
        return errorResponse('Telemetry rate limit reached.', 429);
      }
      console.error('Gameplay telemetry write failed.');
      return errorResponse('Telemetry temporarily unavailable.', 503);
    }
    return Response.json({ accepted: true, duplicate: data === false }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }),
};
