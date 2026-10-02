// Lunchly – Zugang zum Live-Abgleich (Supabase).
// Leer lassen = kein Server, die Swipes werden dann einmal am Tag per Link geschickt.
// Werte stehen im Supabase-Dashboard unter „Project Settings → API“.
window.LUNCHLY_CONFIG = window.LUNCHLY_CONFIG || {
  supabaseUrl: "",      // z. B. "https://abcdefghijkl.supabase.co"
  supabaseAnonKey: "",  // der öffentliche „anon“-Schlüssel (darf im Browser stehen)
};
