import { authenticatedGet, authenticatedPost } from '../../utils/api';

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockGetSession = jest.fn();

jest.mock('@/app/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
  },
  SUPABASE_URL: 'https://test.supabase.co',
}));

// ── fetch mock ────────────────────────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// ── Helpers ───────────────────────────────────────────────────────────────────
function mockSession(token = 'test-token') {
  mockGetSession.mockResolvedValue({ data: { session: { access_token: token } } });
}

function mockNoSession() {
  mockGetSession.mockResolvedValue({ data: { session: null } });
}

function mockOkResponse(body: object) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(body),
  });
}

function mockErrorResponse(status: number, body: object) {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── authenticatedGet ──────────────────────────────────────────────────────────

describe('authenticatedGet', () => {
  it('throws when no session exists', async () => {
    mockNoSession();
    await expect(authenticatedGet('/menu')).rejects.toThrow('Not authenticated');
  });

  it('calls the correct URL with GET and bearer token', async () => {
    mockSession('my-token');
    mockOkResponse({ items: [] });

    await authenticatedGet('/menu');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/menu',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('returns the parsed JSON on success', async () => {
    mockSession();
    mockOkResponse({ items: [{ id: '1' }] });

    const result = await authenticatedGet('/menu');
    expect(result).toEqual({ items: [{ id: '1' }] });
  });

  it('throws an error from the response body on non-OK status', async () => {
    mockSession();
    mockErrorResponse(404, { error: 'Not found' });

    await expect(authenticatedGet('/missing')).rejects.toThrow('Not found');
  });

  it('falls back to "Request failed" when error body has no error field', async () => {
    mockSession();
    mockErrorResponse(500, {});

    await expect(authenticatedGet('/boom')).rejects.toThrow('Request failed');
  });
});

// ── authenticatedPost ─────────────────────────────────────────────────────────

describe('authenticatedPost', () => {
  it('throws when no session exists', async () => {
    mockNoSession();
    await expect(authenticatedPost('/place-order', {})).rejects.toThrow('Not authenticated');
  });

  it('calls the correct URL with POST, bearer token, and JSON body', async () => {
    mockSession('post-token');
    mockOkResponse({ orderId: 'abc' });

    const body = { items: ['item1'] };
    await authenticatedPost('/place-order', body);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/place-order',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer post-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(body),
      })
    );
  });

  it('returns the parsed JSON on success', async () => {
    mockSession();
    mockOkResponse({ orderId: 'xyz', status: 'created' });

    const result = await authenticatedPost('/place-order', { items: [] });
    expect(result).toEqual({ orderId: 'xyz', status: 'created' });
  });

  it('throws the error message from the response on non-OK status', async () => {
    mockSession();
    mockErrorResponse(400, { error: 'Invalid cart' });

    await expect(authenticatedPost('/place-order', {})).rejects.toThrow('Invalid cart');
  });

  it('serialises the body to JSON', async () => {
    mockSession();
    mockOkResponse({});

    const payload = { name: 'Test', value: 42, nested: { a: true } };
    await authenticatedPost('/endpoint', payload);

    const call = mockFetch.mock.calls[0][1];
    expect(JSON.parse(call.body)).toEqual(payload);
  });
});
