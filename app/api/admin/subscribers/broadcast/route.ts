import { eq } from "drizzle-orm";
import { broadcasts, coupons, subscribers } from "../../../../../db/schema";
import { AuthError, requireAdmin, toErrorResponse } from "../../../../../lib/admin-routes";
import { isEmailConfigured, sendEmails } from "../../../../../lib/email";

export async function POST(request: Request) {
  try {
    const db = await requireAdmin(request);
    const payload = (await request.json()) as {
      subject?: string;
      message?: string;
      couponCode?: string;
    };

    const subject = (payload.subject ?? "").trim();
    const message = (payload.message ?? "").trim();
    const couponCodeRaw = (payload.couponCode ?? "").trim().toUpperCase();

    if (!subject) {
      return Response.json({ error: "Subject is required" }, { status: 400 });
    }
    if (subject.length > 200) {
      return Response.json({ error: "Subject must be 200 characters or fewer" }, { status: 400 });
    }
    if (!message) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }
    if (message.length > 5000) {
      return Response.json({ error: "Message must be 5000 characters or fewer" }, { status: 400 });
    }

    // Optional coupon: must be a real, active code so we never announce a
    // discount that won't work at checkout.
    let couponCode = "";
    if (couponCodeRaw) {
      const [coupon] = await db.select().from(coupons).where(eq(coupons.code, couponCodeRaw)).limit(1);
      if (!coupon || !coupon.active) {
        return Response.json({ error: "That coupon doesn't exist or is paused" }, { status: 400 });
      }
      couponCode = couponCodeRaw;
    }

    if (!isEmailConfigured()) {
      return Response.json(
        {
          error:
            "Cloudflare email sending isn't set up yet. Enable email sending for phillyontheblock.com in the Cloudflare dashboard and add the CLOUDFLARE_EMAIL_TOKEN Worker secret, then try again.",
        },
        { status: 503 },
      );
    }

    const recipients = (await db.select().from(subscribers)).map((row) => row.email);
    if (recipients.length === 0) {
      return Response.json({ error: "There are no subscribers to send to yet." }, { status: 400 });
    }

    const finalMessage = couponCode ? `${message}\n\nUse code ${couponCode} at checkout.` : message;
    const { sent, failed } = await sendEmails(recipients, subject, finalMessage);

    const [broadcast] = await db
      .insert(broadcasts)
      .values({
        subject,
        message: finalMessage,
        couponCode,
        recipientCount: recipients.length,
        failedCount: failed,
        status: sent > 0 ? "sent" : "failed",
        sentAt: sent > 0 ? new Date() : null,
        createdAt: new Date(),
      })
      .returning();

    if (sent === 0) {
      return Response.json(
        { error: "Sending failed for every recipient. Check the Cloudflare email setup and try again." },
        { status: 502 },
      );
    }

    return Response.json(
      { broadcast, sent, failed, total: recipients.length },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    return toErrorResponse(error);
  }
}
