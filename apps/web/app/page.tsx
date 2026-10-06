import { ServiceWorkerRegistration } from "./sw-register";

export default function Home() {
  return (
    <main style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
      <h1>ClaimTidy</h1>
      <p>Snap a receipt, tap a category, and your monthly claim builds itself.</p>
      <ServiceWorkerRegistration />
    </main>
  );
}
