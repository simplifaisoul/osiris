/* The catalog's "Feature Service" type is set by the publisher, and the
   item's URL is a separate field they can point anywhere: an Experience
   app page, a portal, or nothing. Only a REST service can be queried. */
export function isQueryableService(url: unknown): url is string {
  return typeof url === 'string' && /\/rest\/services\//i.test(url);
}

export function queryableResults<T extends { url?: unknown }>(items: T[], limit: number): T[] {
  return items.filter(item => isQueryableService(item.url)).slice(0, limit);
}
