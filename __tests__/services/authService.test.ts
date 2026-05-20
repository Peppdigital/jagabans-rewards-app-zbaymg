import { authService } from '../../services/supabaseService';

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockSignUp          = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignOut         = jest.fn();
const mockGetSession      = jest.fn();
const mockGetUser         = jest.fn();
const mockInsert          = jest.fn();
const mockFrom            = jest.fn();

jest.mock('@/app/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signUp:              () => mockSignUp(),
      signInWithPassword:  (...args: any[]) => mockSignInWithPassword(...args),
      signOut:             () => mockSignOut(),
      getSession:          () => mockGetSession(),
      getUser:             () => mockGetUser(),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
  SUPABASE_URL: 'https://test.supabase.co',
}));

// ── Builder chain helper ──────────────────────────────────────────────────────
function makeChain(resolvedWith: object) {
  const chain: any = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single', 'maybeSingle', 'in'];
  methods.forEach(m => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  // The terminal call resolves
  chain.insert = jest.fn().mockReturnValue({ ...chain, single: jest.fn().mockResolvedValue(resolvedWith) });
  return chain;
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

// ── authService.signIn ────────────────────────────────────────────────────────

describe('authService.signIn', () => {
  it('returns {data, error:null} on success', async () => {
    const fakeData = { user: { id: '1', email: 'test@test.com' }, session: {} };
    mockSignInWithPassword.mockResolvedValue({ data: fakeData, error: null });

    const result = await authService.signIn('test@test.com', 'pass');
    expect(result.error).toBeNull();
    expect(result.data).toEqual(fakeData);
  });

  it('returns {data:null, error} when Supabase throws', async () => {
    const authError = new Error('Invalid credentials');
    mockSignInWithPassword.mockResolvedValue({ data: null, error: authError });

    const result = await authService.signIn('bad@test.com', 'wrong');
    expect(result.data).toBeNull();
    expect(result.error).toBe(authError);
  });

  it('passes email and password to supabase.auth.signInWithPassword', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: {}, error: null });
    await authService.signIn('user@test.com', 'secret');

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'user@test.com',
      password: 'secret',
    });
  });
});

// ── authService.signUp ────────────────────────────────────────────────────────

describe('authService.signUp', () => {
  beforeEach(() => {
    const chain = makeChain({ data: {}, error: null });
    mockFrom.mockReturnValue(chain);
  });

  it('returns {data, error:null} when signup succeeds', async () => {
    const fakeUser = { id: 'user-1', email: 'new@test.com' };
    mockSignUp.mockResolvedValue({ data: { user: fakeUser }, error: null });

    const result = await authService.signUp('new@test.com', 'pass', 'New User');
    expect(result.error).toBeNull();
    expect(result.data?.user).toEqual(fakeUser);
  });

  it('returns {data:null, error} when auth fails', async () => {
    const authError = new Error('Email already taken');
    mockSignUp.mockResolvedValue({ data: null, error: authError });

    const result = await authService.signUp('dup@test.com', 'pass', 'Dup');
    expect(result.data).toBeNull();
    expect(result.error).toBe(authError);
  });

  it('inserts a user_profiles row with correct defaults after successful signup', async () => {
    const fakeUser = { id: 'user-abc' };
    mockSignUp.mockResolvedValue({ data: { user: fakeUser }, error: null });

    const insertSpy = jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({ data: {}, error: null }),
    });
    mockFrom.mockReturnValue({ insert: insertSpy });

    await authService.signUp('new@test.com', 'pass', 'Alice', '+15551234567');

    expect(mockFrom).toHaveBeenCalledWith('user_profiles');
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-abc',
        name: 'Alice',
        email: 'new@test.com',
        phone: '+15551234567',
        points: 0,
        user_role: 'user',
      })
    );
  });

  it('uses empty string for phone when not provided', async () => {
    const fakeUser = { id: 'user-xyz' };
    mockSignUp.mockResolvedValue({ data: { user: fakeUser }, error: null });

    const insertSpy = jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue({ data: {}, error: null }),
    });
    mockFrom.mockReturnValue({ insert: insertSpy });

    await authService.signUp('no-phone@test.com', 'pass', 'Bob');

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '' })
    );
  });
});

// ── authService.signOut ───────────────────────────────────────────────────────

describe('authService.signOut', () => {
  it('calls supabase.auth.signOut when a session exists', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    mockSignOut.mockResolvedValue({ error: null });

    await authService.signOut();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('skips signOut call and returns early when there is no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await authService.signOut();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('returns {error:null} on success', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    mockSignOut.mockResolvedValue({ error: null });

    const result = await authService.signOut();
    expect(result).toEqual({ error: null });
  });
});

// ── authService.getSession ────────────────────────────────────────────────────

describe('authService.getSession', () => {
  it('returns session data on success', async () => {
    const fakeSession = { user: { id: '1' } };
    mockGetSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    const result = await authService.getSession();
    expect(result.error).toBeNull();
  });

  it('returns {data:null, error} when getSession throws', async () => {
    mockGetSession.mockRejectedValue(new Error('network error'));

    const result = await authService.getSession();
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});
