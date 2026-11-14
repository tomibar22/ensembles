import { createClient } from "@supabase/supabase-js";

/* הכתובת והמפתח הציבורי של הפרויקט. שניהם מיועדים לדפדפן ואינם סוד:
   ההגנה על הנתונים היא ה-RLS במסד (רק מייל מורשה רואה משהו). */
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
