import "jsr:@supabase/functions-js/edge-runtime.d.ts";

console.info('get-reservations started');

Deno.serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), { status: 500 });

    const url = `${supabaseUrl}/rest/v1/reservations`;
    const res = await fetch(url + '?select=*&order=date.asc,time.asc', {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: 'Failed to fetch reservations', detail: text }), { status: res.status });
    }

    const reservations = await res.json();
    return new Response(JSON.stringify({ reservations }), {
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
});