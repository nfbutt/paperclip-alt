import { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from "react";

export type UserRole = "admin" | "user";

const STORAGE_KEY = "paperclip.roleChoice";

interface UserRoleContextValue {
  role: UserRole;
  isAdmin: boolean;
  roleChosen: boolean;
  setRole: (role: UserRole) => void;
  clearRole: () => void;
}

const UserRoleContext = createContext<UserRoleContextValue | null>(null);

export function UserRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<UserRole | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "admin" || stored === "user" ? stored : null;
  });

  const setRole = useCallback((r: UserRole) => {
    setRoleState(r);
    localStorage.setItem(STORAGE_KEY, r);
  }, []);

  const clearRole = useCallback(() => {
    setRoleState(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo<UserRoleContextValue>(
    () => ({
      role: role ?? "user",
      isAdmin: role === "admin",
      roleChosen: role !== null,
      setRole,
      clearRole,
    }),
    [role, setRole, clearRole],
  );

  return <UserRoleContext.Provider value={value}>{children}</UserRoleContext.Provider>;
}

export function useUserRole() {
  const ctx = useContext(UserRoleContext);
  if (!ctx) throw new Error("useUserRole must be used within UserRoleProvider");
  return ctx;
}
