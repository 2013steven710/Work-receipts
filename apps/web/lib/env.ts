// Public configuration, inlined at build time.
export const env = {
  directoryUrl: process.env.NEXT_PUBLIC_DIRECTORY_URL ?? "http://localhost:54390",
  apiUrls: JSON.parse(process.env.NEXT_PUBLIC_API_URLS ?? '{"au":"http://localhost:8081"}') as Record<string, string>,
};
