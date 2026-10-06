import type { Config } from "./config.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
  /** Development only: messages sent so far (log mode). */
  readonly outbox?: Mail[];
}

export function createMailer(config: Config): Mailer {
  if (config.MAIL_MODE === "postmark") {
    return {
      async send(mail) {
        const res = await fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-postmark-server-token": config.POSTMARK_TOKEN ?? "",
          },
          body: JSON.stringify({
            From: config.MAIL_FROM,
            To: mail.to,
            Subject: mail.subject,
            TextBody: mail.text,
            MessageStream: "outbound",
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`postmark send failed: ${res.status}`);
      },
    };
  }
  const outbox: Mail[] = [];
  return {
    outbox,
    async send(mail) {
      outbox.push(mail);
      if (outbox.length > 200) outbox.shift();
    },
  };
}
