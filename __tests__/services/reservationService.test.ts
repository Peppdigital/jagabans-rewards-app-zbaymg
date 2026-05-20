import { reservationService } from '../../services/reservationService';

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockGetSession = jest.fn();

// Builder chain — each method returns itself so we can chain arbitrarily deep.
// `single` and `maybeSingle` are the terminal methods that actually resolve.
const mockSingle     = jest.fn();
const mockSelect     = jest.fn();
const mockInsert     = jest.fn();
const mockUpdate     = jest.fn();
const mockEq         = jest.fn();
const mockOrder      = jest.fn();

const chain: any = {
  select:     (...a: any[]) => { mockSelect(...a); return chain; },
  insert:     (...a: any[]) => { mockInsert(...a); return chain; },
  update:     (...a: any[]) => { mockUpdate(...a); return chain; },
  eq:         (...a: any[]) => { mockEq(...a);     return chain; },
  // order() returns whatever mockOrder returns — allows a terminal call to yield a Promise
  order:      (...a: any[]) => mockOrder(...a),
  single:     (...a: any[]) => mockSingle(...a),
};

const mockFrom = jest.fn().mockReturnValue(chain);

jest.mock('@/app/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    from: (...args: any[]) => mockFrom(...args),
  },
  SUPABASE_URL: 'https://test.supabase.co',
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
const BASE_RESERVATION = {
  name: 'Alice',
  email: 'alice@test.com',
  phone: '+15551234567',
  date: '2025-06-15',
  time: '19:00',
  guests: 4,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOrder.mockReturnValue(chain); // default: chain is still chainable
});

// ── createReservation ─────────────────────────────────────────────────────────

describe('reservationService.createReservation', () => {
  it('inserts with status "pending" and returns data', async () => {
    const fakeRow = { id: 'res-1', ...BASE_RESERVATION, status: 'pending' };
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockSingle.mockResolvedValue({ data: fakeRow, error: null });

    const result = await reservationService.createReservation(BASE_RESERVATION);

    expect(mockFrom).toHaveBeenCalledWith('reservations');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' })
    );
    expect(result.data).toEqual(fakeRow);
    expect(result.error).toBeNull();
  });

  it('attaches user_id from session when user is logged in', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-abc' } } } });
    mockSingle.mockResolvedValue({ data: {}, error: null });

    await reservationService.createReservation(BASE_RESERVATION);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-abc' })
    );
  });

  it('sets user_id to null when there is no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSingle.mockResolvedValue({ data: {}, error: null });

    await reservationService.createReservation(BASE_RESERVATION);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: null })
    );
  });

  it('maps specialRequests to special_requests column', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSingle.mockResolvedValue({ data: {}, error: null });

    await reservationService.createReservation({
      ...BASE_RESERVATION,
      specialRequests: 'Window seat please',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ special_requests: 'Window seat please' })
    );
  });

  it('sets special_requests to null when specialRequests is not provided', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSingle.mockResolvedValue({ data: {}, error: null });

    await reservationService.createReservation(BASE_RESERVATION);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ special_requests: null })
    );
  });

  it('returns {data:null, error} when insert fails', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSingle.mockResolvedValue({ data: null, error: new Error('DB error') });

    const result = await reservationService.createReservation(BASE_RESERVATION);
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

// ── getUserReservations ───────────────────────────────────────────────────────

describe('reservationService.getUserReservations', () => {
  it('throws when user is not authenticated', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const result = await reservationService.getUserReservations();
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('queries reservations filtered by the current user_id', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-42' } } } });
    // Simulate the chained query resolving via order().order()
    // The chain's order() returns chain, and we need the last call to return data.
    // We override mockOrder's last call to resolve.
    let orderCallCount = 0;
    mockOrder.mockImplementation(() => {
      orderCallCount++;
      if (orderCallCount === 2) {
        return Promise.resolve({ data: [{ id: 'res-1' }], error: null });
      }
      return chain;
    });

    const result = await reservationService.getUserReservations();

    expect(mockFrom).toHaveBeenCalledWith('reservations');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-42');
    expect(result.data).toEqual([{ id: 'res-1' }]);
  });
});

// ── cancelReservation ─────────────────────────────────────────────────────────

describe('reservationService.cancelReservation', () => {
  it('updates status to "cancelled" for the given reservation ID', async () => {
    const fakeRow = { id: 'res-5', status: 'cancelled' };
    mockSingle.mockResolvedValue({ data: fakeRow, error: null });

    const result = await reservationService.cancelReservation('res-5');

    expect(mockFrom).toHaveBeenCalledWith('reservations');
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(mockEq).toHaveBeenCalledWith('id', 'res-5');
    expect(result.data).toEqual(fakeRow);
    expect(result.error).toBeNull();
  });

  it('returns {data:null, error} when update fails', async () => {
    mockSingle.mockResolvedValue({ data: null, error: new Error('Not found') });

    const result = await reservationService.cancelReservation('bad-id');
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});
