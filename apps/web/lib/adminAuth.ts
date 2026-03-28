export function normalizeMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 10) {
    return digits;
  }
  return digits.slice(-10);
}

export function getAdminMobilesFromEnv() {
  const raw = process.env.ADMIN_MOBILE_NUMBERS ?? "";
  return raw
    .split(",")
    .map((item) => normalizeMobile(item.trim()))
    .filter(Boolean);
}

export function isAdminMobile(mobile: string | undefined) {
  if (!mobile) {
    return false;
  }

  const candidate = normalizeMobile(mobile);
  const adminMobiles = getAdminMobilesFromEnv();
  return adminMobiles.includes(candidate);
}
