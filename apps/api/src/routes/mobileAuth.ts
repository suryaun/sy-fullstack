import { createHash, randomInt } from "crypto";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

function normalizeMobile(input: string) {
  const digits = input.replace(/\D/g, "");
  return digits;
}

function hashOtp(mobile: string, otp: string) {
  return createHash("sha256").update(`${mobile}:${otp}:${process.env.JWT_SECRET ?? ""}`).digest("hex");
}

router.post("/request-otp", async (req, res) => {
  const mobileRaw = String(req.body?.mobile ?? "");
  const mobile = normalizeMobile(mobileRaw);

  if (mobile.length < 10 || mobile.length > 15) {
    return res.status(400).json({ message: "Invalid mobile number" });
  }

  const otp = String(randomInt(100000, 999999));
  const expiresInMinutes = Number(process.env.MOBILE_OTP_EXPIRY_MINUTES ?? 5);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  const existingUser = await prisma.customerUser.findUnique({ where: { mobile } });

  await prisma.mobileOtp.create({
    data: {
      mobile,
      codeHash: hashOtp(mobile, otp),
      expiresAt,
      customerId: existingUser?.id
    }
  });

  return res.json({
    success: true,
    isRegistered: Boolean(existingUser),
    expiresInSeconds: expiresInMinutes * 60,
    devOtp: otp
  });
});

router.post("/verify-otp", async (req, res) => {
  const mobileRaw = String(req.body?.mobile ?? "");
  const otp = String(req.body?.otp ?? "").trim();
  const providedName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const providedEmail = typeof req.body?.email === "string" ? req.body.email.trim() : "";

  const mobile = normalizeMobile(mobileRaw);

  if (mobile.length < 10 || mobile.length > 15 || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ message: "Invalid mobile or OTP format" });
  }

  const otpRecord = await prisma.mobileOtp.findFirst({
    where: {
      mobile,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!otpRecord || otpRecord.codeHash !== hashOtp(mobile, otp)) {
    return res.status(400).json({ message: "Incorrect or expired OTP" });
  }

  await prisma.mobileOtp.update({
    where: { id: otpRecord.id },
    data: { usedAt: new Date() }
  });

  let user = await prisma.customerUser.findUnique({ where: { mobile } });

  if (!user) {
    user = await prisma.customerUser.create({
      data: {
        mobile,
        fullName: providedName || null,
        email: providedEmail || null,
        profileComplete: Boolean(providedName && providedEmail)
      }
    });
  }

  return res.json({
    user: {
      id: user.id,
      mobile: user.mobile,
      name: user.fullName,
      email: user.email,
      profileComplete: user.profileComplete
    }
  });
});

router.patch("/profile", async (req, res) => {
  const userId = String(req.body?.userId ?? "");
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";

  if (!userId || !name || !email) {
    return res.status(400).json({ message: "userId, name and email are required" });
  }

  const user = await prisma.customerUser.update({
    where: { id: userId },
    data: {
      fullName: name,
      email,
      profileComplete: true
    }
  });

  return res.json({
    user: {
      id: user.id,
      mobile: user.mobile,
      name: user.fullName,
      email: user.email,
      profileComplete: user.profileComplete
    }
  });
});

export default router;
