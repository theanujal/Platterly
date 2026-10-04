import { v } from "./schema";
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from "./handler";

/** `?page=` (from 1) and `?per_page=` (default 25, at most 100): a list is never unlimited. */
export const pagingShape = {
  page: v.optional(v.int({ min: 1, max: 100_000 })),
  per_page: v.optional(v.int({ min: 1, max: PAGE_SIZE_MAX })),
};

export function paging(q: { page?: number; per_page?: number }) {
  const page = q.page ?? 1;
  const perPage = q.per_page ?? PAGE_SIZE_DEFAULT;
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}
