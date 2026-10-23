// Public configuration, inlined at build time.
const read = (value: string | undefined, fallback: string) => (value && value.length > 0 ? value : fallback);

export const env = {
  supabaseUrl: read(process.env.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321"),
  supabaseAnonKey: read(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  ),
  apiUrl: read(process.env.NEXT_PUBLIC_API_URL, "http://localhost:8081"),
  google: {
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    authUrl: read(process.env.NEXT_PUBLIC_GOOGLE_AUTH_URL, "https://accounts.google.com/o/oauth2/v2/auth"),
    apiBase: read(process.env.NEXT_PUBLIC_GOOGLE_API_BASE, "https://www.googleapis.com"),
  },
  microsoft: {
    clientId: process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID ?? "",
    authUrl: read(process.env.NEXT_PUBLIC_MICROSOFT_AUTH_URL, "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"),
    apiBase: read(process.env.NEXT_PUBLIC_MICROSOFT_API_BASE, "https://graph.microsoft.com/v1.0"),
  },
};
