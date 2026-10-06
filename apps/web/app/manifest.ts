import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClaimTidy",
    short_name: "ClaimTidy",
    description: "Snap a receipt, tap a category, send a finished expense claim.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    // Android: receipts can be shared into the installed app from Photos, Files or email.
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: { files: [{ name: "receipt", accept: ["image/*", "application/pdf"] }] },
    },
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
