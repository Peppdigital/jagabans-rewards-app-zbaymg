
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/app/integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, name: string, phone?: string, inviteCode?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on mount, making getSession() redundant.
    // Using a functional update for user avoids creating a new object reference when
    // the same user is already set (e.g. TOKEN_REFRESHED for the same user).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', _event, session?.user?.email);
      if (_event === 'INITIAL_SESSION') {
        console.log('Initial session:', session?.user?.email);
      }
      setSession(session);
      setUser(prev => {
        const next = session?.user ?? null;
        // Keep the same reference if the user ID hasn't changed to prevent
        // unnecessary downstream re-renders from unstable object identity.
        if (next?.id === prev?.id) return prev;
        return next;
      });
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      console.log('Signing in:', email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Sign in error:', error);
        return { error };
      }

      console.log('Sign in successful:', data.user?.email);
      return { error: null };
    } catch (error: any) {
      console.error('Sign in exception:', error);
      return { error };
    }
  };

  const signUp = async (email: string, password: string, name: string, phone?: string, inviteCode?: string) => {
    try {
      console.log('Signing up:', email, inviteCode ? `with invite code: ${inviteCode}` : 'without invite code');

      // Sign up user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, phone },
          emailRedirectTo: 'https://jagabansla.com/email-confirmed',
        },
      });

      if (error) {
        console.error('Sign-up error:', error);
        return { error };
      }

      // Handle confirmation or auto-signin
      if (data.user) {
        if (data.session) {
          // Auto-confirmed (dev mode)
          console.log('User auto-confirmed:', data.user.email);
        } else {
          // Confirmation required (production mode)
          console.log('Confirmation email sent to:', data.user.email);
        }

        // If invite code provided, redeem it
        if (inviteCode && inviteCode.trim()) {
          console.log('Attempting to redeem invite code:', inviteCode);
          try {
            const { data: redeemData, error: redeemError } = await supabase.rpc('redeem_referral_code', {
              p_referral_code: inviteCode.trim().toUpperCase(),
              p_referred_user_id: data.user.id,
            });

            if (redeemError) {
              console.error('Error redeeming invite code:', redeemError);
              // Don't fail signup if invite code is invalid, just log it
            } else if (redeemData && redeemData.success) {
              console.log('Invite code redeemed successfully:', redeemData);
            } else if (redeemData && !redeemData.success) {
              console.warn('Invite code redemption failed:', redeemData.error);
            }
          } catch (inviteError) {
            console.error('Exception redeeming invite code:', inviteError);
            // Don't fail signup if invite code redemption fails
          }
        }
      }

      console.log('Sign-up complete for:', data.user?.email);
      return { error: null };
    } catch (error: any) {
      console.error('Sign-up exception:', error);
      return { error };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://jagabansla.com/reset-password',
      });
      return { error };
    } catch (error: any) {
      return { error };
    }
  };

  const signOut = async () => {
    try {
      console.log('Signing out');
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Sign out error:', error);
        throw error;
      }
      console.log('Sign out successful');
    } catch (error: any) {
      console.error('Sign out exception:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        isAuthenticated: !!session,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
