import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { config } from "../../shared/config.js";

let supabaseClient: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient => {
  supabaseClient ??= createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
  return supabaseClient;
};

export interface SupabaseUser {
  id: string;
  email: string;
  user_metadata: {
    name?: string;
    full_name?: string;
    avatar_url?: string;
    picture?: string;
  };
  app_metadata: {
    provider?: string;
    providers?: string[];
  };
}

export const verifySupabaseToken = async (
  accessToken: string
): Promise<SupabaseUser | null> => {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  return user as SupabaseUser;
};
