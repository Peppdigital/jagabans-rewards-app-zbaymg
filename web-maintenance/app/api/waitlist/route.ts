import { NextRequest, NextResponse } from 'next/server';

// ── Waitlist endpoint ─────────────────────────────────────────────────────────
// Swap the TODO sections for your preferred storage (Supabase, Resend, KV, etc.)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email: string = (body?.email ?? '').trim().toLowerCase();

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address.' },
        { status: 422 },
      );
    }

    // ── TODO: persist to your store ─────────────────────────────────────────
    // Option A — Supabase:
    //   const { error } = await supabase.from('waitlist').insert({ email });
    //
    // Option B — Resend (send a "you're on the list" confirmation):
    //   await resend.emails.send({
    //     from: 'Jagabans L.A. <noreply@jagabansla.com>',
    //     to: email,
    //     subject: "We'll notify you when we're back",
    //     html: `…`,
    //   });
    //
    // Option C — Vercel KV:
    //   await kv.sadd('waitlist', email);
    // ─────────────────────────────────────────────────────────────────────────

    console.info('[waitlist] subscribed:', email);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[waitlist] error:', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
