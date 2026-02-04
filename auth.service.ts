import bcrypt from "bcryptjs";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../utils/httpError.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/tokens.js";
import { env } from "../../config/env.js";

import { z } from "zod";
import { nanoid } from "nanoid";

const RegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80).optional(),
  businessName: z.string().min(1).max(120).optional(),
  baseCurrency: z.string().min(2).max(10).optional()
});

const LoginSchema = z.object({
  identifier: z.string().min(1), // username or email
  password: z.string().min(1),
  businessId: z.string().uuid().optional()
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const SwitchSchema = z.object({
  businessId: z.string().uuid()
});

async function seedSystemAccounts(businessId: string) {
  const seed = [
    { code: "1200", name: "Inventory", type: "ASSET", isSystem: true },
    { code: "2100", name: "Tax Payable", type: "LIABILITY", isSystem: true },

    { code: "1000", name: "Cash", type: "ASSET", isSystem: true },
    { code: "1100", name: "Accounts Receivable", type: "ASSET", isSystem: true },
    { code: "2000", name: "Accounts Payable", type: "LIABILITY", isSystem: true },
    { code: "4000", name: "Sales Revenue", type: "INCOME", isSystem: true },
    { code: "5000", name: "Operating Expenses", type: "EXPENSE", isSystem: true },
    { code: "5100", name: "Cost of Goods Sold", type: "EXPENSE", isSystem: true },
    { code: "5200", name: "Inventory Wastage", type: "EXPENSE", isSystem: true },
    { code: "5290", name: "Inventory Adjustments", type: "EXPENSE", isSystem: true },
    { code: "9999", name: "Suspense", type: "ASSET", isSystem: true }
  ];

  await prisma.account.createMany({
    data: seed.map(s => ({ ...s, businessId })),
    skipDuplicates: true
  });
}

function hashToken(token: string) {
  return bcrypt.hash(token, 10);
}

export async function register(input: unknown) {
  const data = RegisterSchema.parse(input);

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email: data.email }, { username: data.username }] }
  });
  if (exists) throw new HttpError(409, "User already exists");

  const passwordHash = await bcrypt.hash(data.password, 12);

  const baseCurrency = (data.baseCurrency || "USD").toUpperCase();
  const businessName = data.businessName || (data.displayName ? `${data.displayName} Business` : "My Business");

  // Create user + business + membership in one transaction
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: data.email,
        username: data.username,
        passwordHash,
        displayName: data.displayName,
        // In your WP MU-plugin you required admin approval; we keep same default:
        isApproved: false,
      }
    });

    const business = await tx.business.create({
      data: {
        ownerId: user.id,
        name: businessName,
      }
    });


    await tx.businessSettings.create({
      data: {
        businessId: business.id,
        baseCurrency,
        multiCurrency: true,
        currencyRules: {
          base: baseCurrency,
          allowed: ["USD", "BDT", "EUR", "GBP", "AED", "SAR"],
          invoice_override: true,
          snapshot_per_invoice: true
        },
        invoicePrefix: "INV-",
        invoiceNextNo: 1,
        billPrefix: "BILL-",
        billNextNo: 1,
        pdfTemplate: "classic",
        lang: "en",
        scheme: "light"
      }
    });

    await tx.membership.create({
      data: { userId: user.id, businessId: business.id, role: "ADMIN" }
    });

    // Subscription: 30 days from now (matches your MU-plugin logic)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await tx.subscription.create({
      data: {
        businessId: business.id,
        planName: "Monthly",
        planPrice: 0,
        status: "ACTIVE",
        startsAt: new Date(),
        expiresAt
      }
    });

    return { user, business };
  });

  // Seed accounts outside tx (still safe)
  await seedSystemAccounts(result.business.id);

  // Issue tokens with active business context
  const accessToken = signAccessToken({ sub: result.user.id, bid: result.business.id, role: "ADMIN" });
  const refreshToken = signRefreshToken({ sub: result.user.id, bid: result.business.id, role: "ADMIN" });

  // Store hashed refresh token (rotation-ready)
  await prisma.refreshToken.create({
    data: {
      userId: result.user.id,
      tokenHash: await hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  return {
    user: { id: result.user.id, email: result.user.email, username: result.user.username, isApproved: result.user.isApproved },
    activeBusiness: result.business,
    tokens: { accessToken, refreshToken }
  };
}

export async function login(input: unknown) {
  const data = LoginSchema.parse(input);

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: data.identifier }, { username: data.identifier }]
    }
  });

  if (!user) throw new HttpError(401, "Invalid credentials");
  const ok = await bcrypt.compare(data.password, user.passwordHash);
  if (!ok) throw new HttpError(401, "Invalid credentials");

  // Business context
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { business: { include: { settings: true } } }
  });
  if (!memberships.length) throw new HttpError(400, "No business found for this user");

  const active = data.businessId
    ? memberships.find(m => m.businessId === data.businessId)
    : memberships[0];

  if (!active) throw new HttpError(404, "Business not found");

  const accessToken = signAccessToken({ sub: user.id, bid: active.businessId, role: active.role });
  const refreshToken = signRefreshToken({ sub: user.id, bid: active.businessId, role: active.role });

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: await hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  return {
    user: { id: user.id, email: user.email, username: user.username, isApproved: user.isApproved },
    businesses: memberships.map(m => ({ id: m.business.id, name: m.business.name, role: m.role })),
    activeBusiness: { id: active.business.id, name: active.business.name, baseCurrency: active.business.settings?.baseCurrency || "USD" },
    tokens: { accessToken, refreshToken }
  };
}

export async function refresh(input: unknown) {
  const data = RefreshSchema.parse(input);

  let payload;
  try {
    payload = verifyRefreshToken(data.refreshToken);
  } catch {
    throw new HttpError(401, "Invalid refresh token");
  }

  // Check token against DB (hashed)
  const tokens = await prisma.refreshToken.findMany({
    where: { userId: payload.sub, revokedAt: null },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  const match = await Promise.any(
    tokens.map(async (t) => (await bcrypt.compare(data.refreshToken, t.tokenHash)) ? t : Promise.reject())
  ).catch(() => null);

  if (!match) throw new HttpError(401, "Refresh token not recognized");

  // Rotate: revoke old
  await prisma.refreshToken.update({ where: { id: match.id }, data: { revokedAt: new Date() } });

  const accessToken = signAccessToken({ sub: payload.sub, bid: payload.bid, role: payload.role });
  const refreshToken = signRefreshToken({ sub: payload.sub, bid: payload.bid, role: payload.role });

  await prisma.refreshToken.create({
    data: {
      userId: payload.sub,
      tokenHash: await hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  return { tokens: { accessToken, refreshToken } };
}

export async function me(userId: string, businessId?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "User not found");

  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { business: { include: { settings: true } } }
  });

  const active = businessId ? memberships.find(m => m.businessId === businessId) : memberships[0] ?? null;

  return {
    user: { id: user.id, email: user.email, username: user.username, isApproved: user.isApproved },
    businesses: memberships.map(m => ({ id: m.business.id, name: m.business.name, role: m.role })),
    activeBusiness: active ? { id: active.business.id, name: active.business.name, baseCurrency: active.business.settings?.baseCurrency || "USD", role: active.role } : null,
    theme: {
      // Colors come from frontend; backend just exposes brand name
      brandName: env.PDF_BRAND_NAME
    }
  };
}

export async function switchBusiness(userId: string, input: unknown) {
  const data = SwitchSchema.parse(input);

  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId, businessId: data.businessId } }
  });
  if (!membership) throw new HttpError(404, "Not a member of this business");

  const accessToken = signAccessToken({ sub: userId, bid: data.businessId, role: membership.role });
  return { tokens: { accessToken } };
}