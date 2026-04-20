'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  APP_MODULES,
  AppModule,
  PermissionLevel,
  hasAtLeast,
} from '@/lib/auth/permissions';

type PermissionMap = Partial<Record<AppModule, PermissionLevel>>;

interface PermissionsContextValue {
  permissions: PermissionMap;
  isAdmin: boolean;
  loading: boolean;
  canAccess: (module: AppModule, minLevel?: PermissionLevel) => boolean;
}

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: {},
  isAdmin: false,
  loading: true,
  canAccess: () => false,
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      const [adminRes, permsRes] = await Promise.all([
        supabase.rpc('is_admin'),
        supabase.rpc('current_user_permissions'),
      ]);

      if (cancelled) return;

      setIsAdmin(adminRes.data === true);

      const map: PermissionMap = {};
      if (Array.isArray(permsRes.data)) {
        for (const row of permsRes.data as { module: AppModule; level: PermissionLevel }[]) {
          map[row.module] = row.level;
        }
      }
      setPermissions(map);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  function canAccess(module: AppModule, minLevel: PermissionLevel = 'view'): boolean {
    if (isAdmin) return true;
    return hasAtLeast(permissions[module], minLevel);
  }

  return (
    <PermissionsContext.Provider value={{ permissions, isAdmin, loading, canAccess }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}

export { APP_MODULES };
