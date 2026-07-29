/**
 * Заглушка @directus/sdk для тестов роутов.
 *
 * Настоящий SDK возвращает из readItems/createItem/... «команду» — функцию, которую
 * исполняет client.request(). Проверить по такой функции, что именно запросил роут,
 * нельзя. Поэтому в тестах билдеры возвращают описание запроса, а fake-directus его
 * исполняет по данным в памяти. Роуты при этом не меняются: они по-прежнему вызывают
 * readItems("orders", {...}) — просто под ними другой транспорт.
 */
export interface Descriptor {
  kind: string;
  collection?: string;
  id?: string;
  query?: any;
  data?: any;
}

export const readItems = (collection: string, query?: any): Descriptor => ({ kind: "readItems", collection, query });
export const readItem = (collection: string, id: string, query?: any): Descriptor => ({ kind: "readItem", collection, id, query });
export const createItem = (collection: string, data: any): Descriptor => ({ kind: "createItem", collection, data });
export const createItems = (collection: string, data: any): Descriptor => ({ kind: "createItems", collection, data });
export const updateItem = (collection: string, id: string, data: any): Descriptor => ({ kind: "updateItem", collection, id, data });
export const deleteItem = (collection: string, id: string): Descriptor => ({ kind: "deleteItem", collection, id });
export const aggregate = (collection: string, query?: any): Descriptor => ({ kind: "aggregate", collection, query });

export const readUsers = (query?: any): Descriptor => ({ kind: "readUsers", collection: "directus_users", query });
export const createUser = (data: any): Descriptor => ({ kind: "createItem", collection: "directus_users", data });
export const updateUser = (id: string, data: any): Descriptor => ({ kind: "updateItem", collection: "directus_users", id, data });
export const readRoles = (query?: any): Descriptor => ({ kind: "readItems", collection: "directus_roles", query });

// Клиентские хелперы: в тестах не используются, но модуль должен их экспортировать —
// его импортируют и другие файлы (lib/directus.ts, scripts).
export const createDirectus = () => ({ with: () => ({ with: () => ({ request: async () => [] }) }) });
export const rest = () => (c: unknown) => c;
export const staticToken = () => (c: unknown) => c;
