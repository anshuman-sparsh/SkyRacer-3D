import { withSupabase } from 'npm:@supabase/server@^1';
export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, {status:405});
    const uid=ctx.userClaims?.id;
    if (!uid) return Response.json({error:'Unauthorized'}, {status:401});
    const { data,error }=await ctx.supabaseAdmin.rpc('get_hangar_progress',{p_user_id:uid});
    if (error || !data) return Response.json({error:'Progress unavailable'}, {status:503,headers:{'Cache-Control':'no-store'}});
    return Response.json(data,{headers:{'Cache-Control':'no-store'}});
  }),
};