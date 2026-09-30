/** Внутренние запросы приложения. HTTP не принимает эти команды от клиента. */
export type DataQuery = {
  fields?: readonly string[]; filter?: object; sort?: readonly string[];
  limit?: number; offset?: number; page?: number; deep?: object;
};
export type DataCommand = {
  kind: string; collection: string; id?: string; query?: DataQuery;
  data?: Record<string, unknown> | Record<string, unknown>[];
  aggregate?: { count?: string; sum?: string }; groupBy?: string[];
};
export const readItems = (collection: string, query?: DataQuery): DataCommand => ({ kind: "readItems", collection, query });
export const readItem = (collection: string, id: string, query?: DataQuery): DataCommand => ({ kind: "readItem", collection, id, query });
export const createItem = (collection: string, data: Record<string, unknown>): DataCommand => ({ kind: "createItem", collection, data });
export const createItems = (collection: string, data: Record<string, unknown>[]): DataCommand => ({ kind: "createItems", collection, data });
export const updateItem = (collection: string, id: string, data: Record<string, unknown>): DataCommand => ({ kind: "updateItem", collection, id, data });
export const updateItems = (collection: string, query: DataQuery, data: Record<string, unknown>): DataCommand => ({ kind: "updateItems", collection, query, data });
export const deleteItem = (collection: string, id: string): DataCommand => ({ kind: "deleteItem", collection, id });
export const deleteItems = (collection: string, query: DataQuery): DataCommand => ({ kind: "deleteItems", collection, query });
export const aggregate = (collection: string, options: Pick<DataCommand, "aggregate" | "groupBy" | "query">): DataCommand => ({ kind: "aggregate", collection, ...options });
export const readUsers = (query?: DataQuery) => readItems("directus_users", query);
export const readUser = (id: string, query?: DataQuery) => readItem("directus_users", id, query);
export const readRoles = (query?: DataQuery) => readItems("directus_roles", query);
export const updateUser = (id: string, data: Record<string, unknown>): DataCommand => ({ kind: "updateAlumniUser", collection: "directus_users", id, data });
export const deleteUser = (id: string): DataCommand => ({ kind: "deleteAlumniUser", collection: "directus_users", id });
