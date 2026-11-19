// O ensaio só administra um servidor local explicitamente informado, nunca DATABASE_URL.
export function recoveryAdmin(raw: string | undefined, mode?: string) {
  let url: URL;
  try {
    url = new URL(raw ?? '');
  } catch {
    throw new Error(
      'Informe RECOVERY_ADMIN_URL local, apontando para postgres.',
    );
  }
  if (
    mode === 'production' ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/postgres' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Ensaio permitido somente no banco administrativo postgres local, fora de produção.',
    );
  return url;
}
export function recoveryName(name: string, created: ReadonlySet<string>) {
  if (
    !/^balducore_drill_[a-f0-9]{32}_(source|restore)$/.test(name) ||
    !created.has(name)
  )
    throw new Error('Recusada remoção de banco não criado por este ensaio.');
  return `"${name}"`;
}
