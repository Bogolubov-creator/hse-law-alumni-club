type PolicyStore = {
  findPolicy(): Promise<{ id: string } | undefined>;
  findPending(): Promise<string | undefined>;
  startPending(): Promise<string>;
  createPolicy(): Promise<{ id: string }>;
  initializePolicy(id: string): Promise<void>;
  finishPending(id: string): Promise<void>;
};

/** Маркер пишется до политики и удаляется после прав и привязки роли. */
export async function ensureInitialPolicy(store: PolicyStore): Promise<{ id: string }> {
  let policy = await store.findPolicy();
  let pending = await store.findPending();
  // Готовая политика принадлежит оператору: bootstrap не восстанавливает удалённые права.
  if (policy && !pending) return policy;
  pending ??= await store.startPending();
  policy ??= await store.createPolicy();
  await store.initializePolicy(policy.id);
  await store.finishPending(pending);
  return policy;
}
