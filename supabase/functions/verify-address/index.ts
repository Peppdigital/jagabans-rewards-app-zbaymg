// supabase/functions/verify-address/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AddressValidationRequest {
  address: string;
}

interface AddressValidationResponse {
  success: boolean;
  isValid: boolean;
  formattedAddress?: string;
  addressComponents?: {
    streetNumber?: string;
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  confidence?: 'high' | 'medium' | 'low';
  suggestions?: string[];
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth: accept either a logged-in user OR a valid anon-key request ──
    // This function is called from the public checkout page where no user
    // session exists. We allow anon access so address validation works for
    // all customers, authenticated or not.
    //
    // If you want to restrict to logged-in users only, uncomment the block
    // below and remove the anon fallback.
    //
    // const authHeader = req.headers.get('Authorization');
    // const supabaseClient = createClient(
    //   Deno.env.get('SUPABASE_URL') ?? '',
    //   Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    //   { global: { headers: { Authorization: authHeader ?? '' } } }
    // );
    // const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    // if (userError || !user) {
    //   return new Response(JSON.stringify({ success: false, isValid: false, error: 'Unauthorized' }), {
    //     status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    //   });
    // }

    // Basic presence check — reject requests with no Authorization header at all
    // (prevents completely open abuse while still allowing anon key callers)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, isValid: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Parse body ────────────────────────────────────────────────────────
    const { address }: AddressValidationRequest = await req.json();

    if (!address || address.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, isValid: false, error: 'Address is required' } as AddressValidationResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Google Address Validation API ─────────────────────────────────────
    const googleApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');

    if (!googleApiKey) {
      console.warn('GOOGLE_MAPS_API_KEY not set — falling back to basic validation');
      return new Response(
        JSON.stringify(performBasicValidation(address)),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const googleResponse = await fetch(
      `https://addressvalidation.googleapis.com/v1:validateAddress?key=${googleApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: {
            regionCode: 'US',
            addressLines: [address],
          },
          enableUspsCass: true,
        }),
      }
    );

    if (!googleResponse.ok) {
      console.error('Google API error:', await googleResponse.text());
      return new Response(
        JSON.stringify(performBasicValidation(address)),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const googleData = await googleResponse.json();
    const result   = googleData.result;
    const verdict  = result?.verdict;
    const addr_obj = result?.address;

    // ── Determine confidence ──────────────────────────────────────────────
    let confidence: 'high' | 'medium' | 'low' = 'low';
    let isValid = false;

    if (verdict) {
      const granularity              = verdict.validationGranularity ?? 'OTHER';
      const hasUnconfirmedComponents = verdict.hasUnconfirmedComponents ?? false;

      if (granularity === 'PREMISE') {
        confidence = hasUnconfirmedComponents ? 'medium' : 'high';
        isValid    = true;
      } else if (granularity === 'ROUTE' || granularity === 'BLOCK') {
        confidence = 'medium';
        isValid    = true;
      } else {
        confidence = 'low';
        isValid    = false;
      }
    }

    // ── Extract formatted address & components ────────────────────────────
    const formattedAddress = addr_obj?.formattedAddress ?? address;
    const addressComponents: AddressValidationResponse['addressComponents'] = {};

    if (addr_obj?.addressComponents) {
      for (const component of addr_obj.addressComponents) {
        const type = component.componentType;
        const name = component.componentName?.text ?? '';
        if      (type === 'street_number')                addressComponents.streetNumber = name;
        else if (type === 'route')                        addressComponents.street       = name;
        else if (type === 'locality')                     addressComponents.city         = name;
        else if (type === 'administrative_area_level_1')  addressComponents.state        = name;
        else if (type === 'postal_code')                  addressComponents.postalCode   = name;
        else if (type === 'country')                      addressComponents.country      = name;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        isValid,
        formattedAddress,
        addressComponents,
        confidence,
      } as AddressValidationResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Address verification error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        isValid: false,
        error: error.message ?? 'Failed to verify address',
      } as AddressValidationResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ── Basic validation fallback (no Google API key) ─────────────────────────────

function performBasicValidation(address: string): AddressValidationResponse {
  const trimmed = address.trim();

  const hasNumber      = /\d/.test(trimmed);
  const hasStreet      = trimmed.split(/[,\n]/).length >= 2;
  const minLength      = trimmed.length >= 10;
  const hasZip         = /\d{5}(-\d{4})?/.test(trimmed);
  const hasStreetNum   = /^\d+\s+[a-zA-Z]/.test(trimmed);

  let isValid    = false;
  let confidence: 'high' | 'medium' | 'low' = 'low';

  if (hasStreetNum && hasStreet && hasZip) {
    isValid    = true;
    confidence = 'medium';
  } else if (hasNumber && hasStreet && minLength) {
    isValid    = true;
    confidence = 'low';
  }

  return {
    success: true,
    isValid,
    formattedAddress: trimmed,
    confidence,
  };
}