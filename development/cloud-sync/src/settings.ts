import { defaults, identity, normalizeConfig } from "./config";
import { hash } from "./content";
import { validatePassword } from "./encryption";
import {
  SyncError,
  type Config,
  type Credentials,
  type ConnectionInput,
} from "./model";

type SavedCredentials = Credentials & { syncPassword?: string };

export class Settings {
  constructor(private ctx: Textus.PluginContext) {}
  private async scope(root: string) {
    return hash(new TextEncoder().encode(root));
  }
  async load(root: string): Promise<Config> {
    const raw = await this.ctx.storage.global.get(
      `config:${await this.scope(root)}`,
    );
    return raw ? normalizeConfig(raw as Config) : { ...defaults };
  }
  private async secretKey(root: string, config: Config) {
    return `connection:${await hash(new TextEncoder().encode(root + identity(config)))}`;
  }
  async credentials(root: string, config: Config): Promise<SavedCredentials> {
    const saved = await this.ctx.secrets.get(
      await this.secretKey(root, config),
    );
    if (!saved) throw new SyncError("credentialsRequired");
    try {
      const value = JSON.parse(saved) as SavedCredentials;
      if (!value.account || !value.secret) throw new Error();
      return value;
    } catch {
      throw new SyncError("credentialsRequired");
    }
  }
  async password(root: string, config: Config) {
    const password = (await this.credentials(root, config)).syncPassword ?? "";
    validatePassword(password);
    return password;
  }
  async save(
    root: string,
    input: Partial<Config>,
    incoming: ConnectionInput,
  ): Promise<Config> {
    const config = normalizeConfig(input);
    const key = await this.secretKey(root, config);
    let previous: SavedCredentials = { account: "", secret: "" };
    try {
      previous = await this.credentials(root, config);
    } catch {
      /* A new connection. */
    }
    const account = String(incoming.account ?? "").trim() || previous.account;
    const secret = String(incoming.secret ?? "") || previous.secret;
    if (!account || !secret) throw new SyncError("credentialsRequired");
    // Changing the account cannot silently reuse a different account's secret.
    if (account !== previous.account && !incoming.secret)
      throw new SyncError("credentialsRequired");
    const syncPassword =
      String(incoming.syncPassword ?? "") || previous.syncPassword || "";
    validatePassword(syncPassword);
    if (
      (incoming.syncPassword || incoming.confirmPassword) &&
      incoming.syncPassword !== incoming.confirmPassword
    )
      throw new SyncError("syncPasswordMismatch");
    const sessionToken =
      String(incoming.sessionToken ?? "") ||
      (incoming.secret ? "" : previous.sessionToken);
    if ([account, secret, sessionToken].includes(syncPassword))
      throw new SyncError("syncPasswordSeparate");
    await this.ctx.secrets.set(
      key,
      JSON.stringify({
        account,
        secret,
        syncPassword,
        sessionToken,
      }),
    );
    await this.ctx.storage.global.set(
      `config:${await this.scope(root)}`,
      config,
    );
    return config;
  }
  async baseKey(root: string, config: Config) {
    const { account } = await this.credentials(root, config);
    return `encrypted-base:${await hash(new TextEncoder().encode(root + identity(config) + "\n" + account))}`;
  }
}
