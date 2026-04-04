import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "../api/auth";
import { healthApi } from "../api/health";
import { queryKeys } from "../lib/queryKeys";

export type UserRole = "admin" | "user";

interface UserRoleContextValue {
  role: UserRole;
  isAdmin: boolean;
  loading: boolean;
}

const UserRoleContext = createContext<UserRoleContextValue | null>(null);

export function UserRoleProvider({ children }: { children: ReactNode }) {
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });

  const isAuthenticatedMode = healthQuery.data?.deploymentMode === "authenticated";

  const meQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => authApi.getMe(),
    enabled: !healthQuery.isLoading,
    retry: false,
    staleTime: 60_000,
  });

  const value = useMemo<UserRoleContextValue>(() => {
    // In local_trusted mode everyone is admin; in authenticated mode check the flag
    let isAdmin: boolean;
    if (!isAuthenticatedMode) {
      isAdmin = true;
    } else {
      isAdmin = meQuery.data?.isInstanceAdmin ?? false;
    }

    return {
      role: isAdmin ? "admin" : "user",
      isAdmin,
      loading: healthQuery.isLoading || meQuery.isLoading,
    };
  }, [isAuthenticatedMode, healthQuery.isLoading, meQuery.data, meQuery.isLoading]);

  return <UserRoleContext.Provider value={value}>{children}</UserRoleContext.Provider>;
}

export function useUserRole() {
  const ctx = useContext(UserRoleContext);
  if (!ctx) {
    throw new Error("useUserRole must be used within UserRoleProvider");
  }
  return ctx;
}
