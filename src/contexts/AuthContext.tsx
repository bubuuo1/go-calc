import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ReactNode } from "react";
import { getSupabaseBrowserClient } from "@/services/supabase";
import type {
  HouseholdMembership,
  HouseholdRole,
  SignUpResult
} from "@/types/household";
import type { Inputter } from "@/types/transaction";

type HouseholdRow = {
  id: string;
  name: string;
};

type MembershipRow = {
  household_id: string;
  role: HouseholdRole;
  display_name: string;
  inputter: Inputter;
  households: HouseholdRow | HouseholdRow[] | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  membership: HouseholdMembership | null;
  loading: boolean;
  membershipError: string | null;
  refreshMembership: () => Promise<HouseholdMembership | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const toMembership = (
  row: MembershipRow | null,
  userId: string
): HouseholdMembership | null => {
  if (!row) {
    return null;
  }

  const household = Array.isArray(row.households) ? row.households[0] : row.households;
  if (!household) {
    return null;
  }

  return {
    householdId: row.household_id,
    userId,
    role: row.role,
    displayName: row.display_name,
    inputter: row.inputter,
    household
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [membership, setMembership] = useState<HouseholdMembership | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [membershipCheckedUserId, setMembershipCheckedUserId] = useState<string | null>(
    null
  );
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const membershipRequestRef = useRef(0);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;

    const applySession = (nextSession: Session | null) => {
      if (!active) {
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user || null);
      setAuthLoading(false);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("저장된 로그인 정보를 확인하지 못했습니다.", error);
        applySession(null);
        return;
      }

      applySession(data.session);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const loadMembership = useCallback(async (userId: string) => {
    const requestId = ++membershipRequestRef.current;
    setMembershipLoading(true);
    setMembershipError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("household_members")
        .select("household_id,role,display_name,inputter,households(id,name)")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const nextMembership = toMembership(data as unknown as MembershipRow | null, userId);
      if (requestId === membershipRequestRef.current) {
        setMembership(nextMembership);
      }
      return nextMembership;
    } catch (error) {
      if (requestId === membershipRequestRef.current) {
        console.error("공유 가구 정보를 불러오지 못했습니다.", error);
        setMembership(null);
        setMembershipError("공유 가구 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      return null;
    } finally {
      if (requestId === membershipRequestRef.current) {
        setMembershipLoading(false);
        setMembershipCheckedUserId(userId);
      }
    }
  }, []);

  const userId = user?.id || null;

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!userId) {
      membershipRequestRef.current += 1;
      setMembership(null);
      setMembershipError(null);
      setMembershipLoading(false);
      setMembershipCheckedUserId(null);
      return;
    }

    setMembership(null);
    void loadMembership(userId);
  }, [authLoading, loadMembership, userId]);

  const refreshMembership = useCallback(async () => {
    if (!userId) {
      membershipRequestRef.current += 1;
      setMembership(null);
      setMembershipError(null);
      setMembershipLoading(false);
      setMembershipCheckedUserId(null);
      return null;
    }

    return loadMembership(userId);
  }, [loadMembership, userId]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });

    if (error) {
      throw error;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const emailRedirectTo =
      typeof window === "undefined" ? undefined : window.location.origin + "/login";
    const { data, error } = await getSupabaseBrowserClient().auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: emailRedirectTo ? { emailRedirectTo } : undefined
    });

    if (error) {
      throw error;
    }

    return { requiresEmailConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await getSupabaseBrowserClient().auth.signOut();
    if (error) {
      throw error;
    }

    membershipRequestRef.current += 1;
    setSession(null);
    setUser(null);
    setMembership(null);
    setMembershipError(null);
    setMembershipLoading(false);
    setMembershipCheckedUserId(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      membership,
      loading:
        authLoading ||
        membershipLoading ||
        Boolean(userId && membershipCheckedUserId !== userId),
      membershipError,
      refreshMembership,
      signIn,
      signUp,
      signOut
    }),
    [
      authLoading,
      membership,
      membershipCheckedUserId,
      membershipError,
      membershipLoading,
      refreshMembership,
      session,
      signIn,
      signOut,
      signUp,
      user,
      userId
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return value;
};
