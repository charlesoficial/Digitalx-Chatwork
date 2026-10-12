import { createClient } from "@supabase/supabase-js";
export const supabase =
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: "pkce",
          },
        },
      )
    : null;
export function client() {
  if (!supabase) throw new Error("Configure a conexão Supabase no .env.local.");
  return supabase;
}
export function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
