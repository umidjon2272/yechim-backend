export function pagination(query: Record<string, any>) {
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(500, Math.max(1, Number(query.pageSize || 10)));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paged<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize };
}
