import { HTTPException } from "hono/http-exception";

const invalid = message => { throw new HTTPException(400, { message }); };

export const getLanguage = c => {
  const lang = c.req.query("lang") ?? "en";
  if (lang !== "en" && lang !== "fr") invalid("lang must be en or fr");
  return lang;
};

const integer = (c, key, fallback, max) => {
  const value = c.req.query(key);
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
    invalid(`${key} must be an integer between 1 and ${max}`);
  }
  return Number(value);
};

export const getDrawQuery = c => {
  const lang = getLanguage(c);
  const year = c.req.query("year");
  if (year !== undefined && !/^\d{4}$/.test(year)) invalid("year must contain four digits");
  const category = c.req.query("category")?.trim();
  if (category !== undefined && (category.length === 0 || category.length > 200)) {
    invalid("category must contain between 1 and 200 characters");
  }
  const limit = integer(c, "limit", 50, 100);
  const page = integer(c, "page", 1, Math.floor(Number.MAX_SAFE_INTEGER / 100));
  return { lang, year, category, page, limit };
};
