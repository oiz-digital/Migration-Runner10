import React from "react";
import { useApp } from "@/context/AppContext";

export function useAuth() {
  const a = useApp() as any;
  const u = a.user;
  const isLoggedIn = !!(u && u.isLoggedIn === true);
  const isAuthenticated = isLoggedIn;
  return {
    user: isLoggedIn ? {
      id: u.id,
      email: u.email,
      firstName: (u.name ?? u.firstName ?? "").split(" ")[0] ?? "",
      lastName: (u.name ?? "").split(" ").slice(1).join(" ") ?? "",
      status: u.status,
      kycStatus: u.kycStatus ?? "pending",
      kycLevel: u.kycLevel,
      vipTier: u.vipTier,
      referralCode: u.referralCode,
      uid: u.uid,
      name: u.name,
      phone: u.phone,
    } : null,
    isLoading: !a.authBootstrapped,
    isAuthenticated,
    login: async (email: string, password: string) => {
      await a.loginWithApi(email, password);
    },
    register: async (email: string, password: string, firstName?: string) => {
      await a.signupWithApi({ name: firstName ?? "", email, phone: "", password });
    },
    logout: async () => { await a.logout(); },
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Provider is no-op; auth state comes from AppProvider mounted in app/_layout.tsx
  return <>{children}</>;
}
