export function getPublicSiteUrl() {
  const vercelProductionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const configuredUrl = vercelProductionHost
    ? `https://${vercelProductionHost}`
    : process.env.NEXT_PUBLIC_SITE_URL;

  if (!configuredUrl) throw new Error("The application site URL is not configured.");

  const siteUrl = new URL(configuredUrl);
  if (
    (process.env.VERCEL || process.env.NODE_ENV === "production")
    && (siteUrl.protocol !== "https:" || siteUrl.hostname === "localhost" || siteUrl.hostname === "127.0.0.1")
  ) {
    throw new Error("A public HTTPS application URL is required for email links.");
  }

  return siteUrl.origin;
}
