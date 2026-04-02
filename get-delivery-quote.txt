// import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface UberAddress {
  street_address: [string, string];
  city: string;
  state: string;
  zip_code: string;
  country: string;
}

interface LatLng {
  lat: number;
  lng: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DISTANCE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Haversine formula — returns straight-line distance in miles between two
 * lat/lng coordinates. Used as a fast pre-check before calling Uber.
 */
function haversineDistanceMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    sinDLng * sinDLng;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Converts a UberAddress (or plain text string) to a single-line string
 * suitable for the Google Geocoding API.
 */
function addressToGeocodingQuery(raw: string): string {
  const parsed = parseUberAddress(raw);
  if (!parsed) return raw.trim();

  const parts: string[] = [];
  if (parsed.street_address[0]) parts.push(parsed.street_address[0]);
  if (parsed.street_address[1]) parts.push(parsed.street_address[1]);
  if (parsed.city)     parts.push(parsed.city);
  if (parsed.state)    parts.push(parsed.state);
  if (parsed.zip_code) parts.push(parsed.zip_code);
  if (parsed.country)  parts.push(parsed.country);
  return parts.join(', ');
}

/**
 * Geocodes an address string using the Google Maps Geocoding API.
 * Returns null if the request fails or no results are found.
 */
async function geocodeAddress(address: string, apiKey: string): Promise<LatLng | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', apiKey);

  console.log('[geocode] Querying:', address);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status !== 'OK' || !data.results?.length) {
      console.warn('[geocode] No results for:', address, '| status:', data.status);
      return null;
    }

    const { lat, lng } = data.results[0].geometry.location;
    console.log('[geocode] Result:', { lat, lng }, 'for:', address);
    return { lat, lng };
  } catch (err) {
    console.error('[geocode] Error:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADDRESS HELPERS  (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

function parseUberAddress(value: string): UberAddress | null {
  try {
    const parsed = JSON.parse(value);
    if (
      parsed &&
      Array.isArray(parsed.street_address) &&
      parsed.street_address.length === 2 &&
      typeof parsed.city === 'string' &&
      typeof parsed.state === 'string' &&
      typeof parsed.zip_code === 'string' &&
      typeof parsed.country === 'string'
    ) {
      return parsed as UberAddress;
    }
    return null;
  } catch {
    return null;
  }
}

function validateUberAddress(addr: UberAddress): string[] {
  const issues: string[] = [];
  if (!addr.street_address[0]?.trim()) issues.push('street_address[0] (street line) is empty');
  if (!addr.city?.trim())              issues.push('city is empty');
  if (!addr.state?.trim() || addr.state.length !== 2) issues.push('state must be a 2-letter abbreviation');
  if (!addr.zip_code?.trim())          issues.push('zip_code is empty');
  if (!addr.country?.trim() || addr.country.length !== 2) issues.push('country must be a 2-letter ISO code');
  return issues;
}

function resolveAddress(raw: string): {
  addressString: string;
  isStructured: boolean;
  issues: string[];
} {
  const parsed = parseUberAddress(raw);

  if (parsed) {
    const issues = validateUberAddress(parsed);
    if (issues.length > 0) {
      console.warn('[address] UberAddress has validation issues:', issues);
    } else {
      console.log('[address] Valid structured UberAddress detected');
    }
    return { addressString: raw, isStructured: true, issues };
  }

  console.log('[address] Plain text address — wrapping in UberAddress shape');
  const fallback: UberAddress = {
    street_address: [raw.trim(), ''],
    city: '',
    state: '',
    zip_code: '',
    country: 'US',
  };
  return {
    addressString: JSON.stringify(fallback),
    isStructured: false,
    issues: ['Address was plain text — structured format recommended for reliability'],
  };
}

function resolvePickupAddress(env: {
  restaurantAddressUber?: string;
  restaurantAddress?: string;
}): { addressString: string; isStructured: boolean } {
  if (env.restaurantAddressUber) {
    const { addressString, isStructured, issues } = resolveAddress(env.restaurantAddressUber);
    console.log('[pickup] Using RESTAURANT_ADDRESS_UBER | structured:', isStructured);
    if (issues.length) console.warn('[pickup] Issues:', issues);
    return { addressString, isStructured };
  }

  if (env.restaurantAddress) {
    console.warn('[pickup] Falling back to RESTAURANT_ADDRESS (plain text).');
    const { addressString, isStructured } = resolveAddress(env.restaurantAddress);
    return { addressString, isStructured };
  }

  throw new Error('Neither RESTAURANT_ADDRESS_UBER nor RESTAURANT_ADDRESS is configured');
}

// ─────────────────────────────────────────────────────────────────────────────
// Uber Direct auth  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

async function getUberAccessToken(clientId: string, clientSecret: string): Promise<string> {
  console.log('[auth] Requesting Uber OAuth token...');

  const tokenResponse = await fetch('https://auth.uber.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'eats.deliveries direct.organizations',
    }),
  });

  console.log('[auth] OAuth response status:', tokenResponse.status);

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text();
    console.error('[auth] OAuth failed body:', err);
    throw new Error(`Uber OAuth failed (${tokenResponse.status}): ${err}`);
  }

  const data = await tokenResponse.json();
  console.log('[auth] OAuth success — token type:', data.token_type, '| expires_in:', data.expires_in);
  return data.access_token as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DELIVERY_RADIUS_MILES = 9.5;

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json();
    console.log('[request] Body received:', JSON.stringify(body));

    const { dropoffAddress } = body;

    if (!dropoffAddress || typeof dropoffAddress !== 'string' || dropoffAddress.trim().length < 5) {
      console.warn('[request] Invalid dropoffAddress:', dropoffAddress);
      return respond({ success: false, error: 'dropoffAddress is required' }, 400);
    }

    // ── Resolve addresses ─────────────────────────────────────────────────────
    const {
      addressString: resolvedDropoff,
      isStructured: dropoffIsStructured,
      issues: dropoffIssues,
    } = resolveAddress(dropoffAddress);

    console.log('[dropoff] Resolved | structured:', dropoffIsStructured);
    if (dropoffIssues.length) console.warn('[dropoff] Issues:', dropoffIssues);
    console.log('[dropoff] Final address string:', resolvedDropoff);

    const { addressString: resolvedPickup, isStructured: pickupIsStructured } = resolvePickupAddress({
      restaurantAddressUber: Deno.env.get('RESTAURANT_ADDRESS_UBER'),
      restaurantAddress:     Deno.env.get('RESTAURANT_ADDRESS'),
    });

    console.log('[pickup] Resolved | structured:', pickupIsStructured);
    console.log('[pickup] Final address string:', resolvedPickup);

    // ── Uber credentials ──────────────────────────────────────────────────────
    const uberClientId     = Deno.env.get('UBER_CLIENT_ID');
    const uberClientSecret = Deno.env.get('UBER_CLIENT_SECRET');
    const uberCustomerId   = Deno.env.get('UBER_CUSTOMER_ID');
    const googleApiKey     = Deno.env.get('GOOGLE_MAPS_API_KEY');

    if (!uberClientId || !uberClientSecret || !uberCustomerId) {
      throw new Error('Uber credentials not configured');
    }

    // ── Distance check ────────────────────────────────────────────────────────
    // Geocode both addresses and reject early if the dropoff is outside the
    // delivery radius. This avoids wasting an Uber quote call and gives the
    // customer a clear, actionable error message.
    if (googleApiKey) {
      const pickupQuery  = addressToGeocodingQuery(resolvedPickup);
      const dropoffQuery = addressToGeocodingQuery(resolvedDropoff);

      console.log('[radius] Geocoding pickup:', pickupQuery);
      console.log('[radius] Geocoding dropoff:', dropoffQuery);

      const [pickupCoords, dropoffCoords] = await Promise.all([
        geocodeAddress(pickupQuery,  googleApiKey),
        geocodeAddress(dropoffQuery, googleApiKey),
      ]);

      if (pickupCoords && dropoffCoords) {
        const distanceMiles = haversineDistanceMiles(pickupCoords, dropoffCoords);
        console.log(`[radius] Distance: ${distanceMiles.toFixed(2)} miles | limit: ${DELIVERY_RADIUS_MILES} miles`);

        if (distanceMiles > DELIVERY_RADIUS_MILES) {
          console.warn(`[radius] Address is outside delivery radius (${distanceMiles.toFixed(1)} mi)`);
          return respond({
            success: false,
            outsideRadius: true,
            distanceMiles: parseFloat(distanceMiles.toFixed(1)),
            radiusMiles: DELIVERY_RADIUS_MILES,
            error: `Sorry, we only deliver within ${DELIVERY_RADIUS_MILES} miles. Your address is ${distanceMiles.toFixed(1)} miles away.`,
          });
        }

        console.log(`[radius] Address is within delivery radius ✓ (${distanceMiles.toFixed(1)} mi)`);
      } else {
        // If geocoding fails for either address, log and continue — we don't
        // hard-block the order on a geocoding failure; Uber will validate on
        // their end anyway.
        console.warn('[radius] Could not geocode one or both addresses — skipping distance check');
      }
    } else {
      console.warn('[radius] GOOGLE_MAPS_API_KEY not set — skipping distance check');
    }

    // ── Get Uber token ────────────────────────────────────────────────────────
    const accessToken = await getUberAccessToken(uberClientId, uberClientSecret);

    // ── Build and send quote request ──────────────────────────────────────────
    const quotePayload = {
      pickup_address:  resolvedPickup,
      dropoff_address: resolvedDropoff,
    };

    const quoteUrl = `https://api.uber.com/v1/customers/${uberCustomerId}/delivery_quotes`;
    console.log('[quote] URL:', quoteUrl);
    console.log('[quote] Payload:', JSON.stringify(quotePayload));

    const quoteRes = await fetch(quoteUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(quotePayload),
    });

    console.log('[quote] Response status:', quoteRes.status, quoteRes.statusText);

    const responseHeaders: Record<string, string> = {};
    quoteRes.headers.forEach((v, k) => { responseHeaders[k] = v; });
    console.log('[quote] Response headers:', JSON.stringify(responseHeaders));

    const rawBody = await quoteRes.text();
    console.log('[quote] Raw response body:', rawBody);

    if (!quoteRes.ok) {
      console.error('[quote] Quote request failed —', quoteRes.status, rawBody);
      return respond({
        success: false,
        error: `Delivery quote unavailable (${quoteRes.status})`,
        debug: {
          dropoffWasStructured: dropoffIsStructured,
          pickupWasStructured:  pickupIsStructured,
          dropoffIssues,
        },
      });
    }

    // ── Parse and return response ─────────────────────────────────────────────
    let quote: any;
    try {
      quote = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error('[quote] Failed to parse response JSON:', parseErr);
      throw new Error('Invalid JSON in Uber quote response');
    }

    console.log('[quote] Parsed response:', JSON.stringify(quote));
    // Guard: expires must be present — the frontend relies on it for auto-refresh
    if (!quote.expires) {
      console.warn('[quote] Uber response missing `expires` field — quote refresh will not work');
    }

    const feeDollars = (quote.fee ?? 0) / 100;

    const result = {
      success:        true,
      quoteId:        quote.id,
      fee:            feeDollars,
      feeCents:       quote.fee,
      currency:       quote.currency ?? 'usd',
      duration:       quote.duration ?? null,
      pickupDuration: quote.pickup_duration ?? null,
      dropoffEta:     quote.dropoff_eta ?? null,
      expires:        quote.expires ?? null,
    };

    console.log('[quote] Returning to client:', JSON.stringify(result));
    return respond(result);

  } catch (err: any) {
    console.error('[error] Unhandled exception:', err?.message ?? err);
    console.error('[error] Stack:', err?.stack ?? '(no stack)');
    return respond(
      { success: false, error: err?.message ?? 'Failed to get delivery quote' },
      500
    );
  }
});