import ldap from "ldapjs";
import { prisma } from "../lib/prisma";
import bcrypt from "bcrypt";

interface LDAPConfig {
  url: string;
  bindDN: string;
  bindPassword: string;
  searchBase: string;
  searchFilter?: string;
}

interface LDAPUser {
  dn: string;
  email: string;
  displayName?: string;
  uid: string;
}

export class LDAPService {
  private config: LDAPConfig;
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.ENABLE_LDAP === "true";
    this.config = {
      url: process.env.LDAP_URL || "",
      bindDN: process.env.LDAP_BIND_DN || "",
      bindPassword: process.env.LDAP_BIND_PASSWORD || "",
      searchBase: process.env.LDAP_SEARCH_BASE || "",
      searchFilter: process.env.LDAP_SEARCH_FILTER || "(uid={{username}})",
    };
  }

  isEnabled(): boolean {
    return this.enabled && !!this.config.url;
  }

  private createClient(): ldap.Client {
    return ldap.createClient({
      url: this.config.url,
      reconnect: true,
    });
  }

  /**
   * Authenticate user against LDAP server
   */
  async authenticate(
    username: string,
    password: string
  ): Promise<LDAPUser | null> {
    if (!this.isEnabled()) {
      throw new Error("LDAP authentication is not enabled");
    }

    const client = this.createClient();

    try {
      // First, bind with admin credentials to search for user
      await this.bind(client, this.config.bindDN, this.config.bindPassword);

      // Search for user
      const user = await this.searchUser(client, username);
      if (!user) {
        return null;
      }

      // Unbind admin connection
      await this.unbind(client);

      // Try to bind with user credentials to verify password
      const userClient = this.createClient();
      try {
        await this.bind(userClient, user.dn, password);
        await this.unbind(userClient);
        return user;
      } catch (error) {
        // Authentication failed
        return null;
      }
    } catch (error) {
      console.error("LDAP authentication error:", error);
      throw error;
    } finally {
      client.destroy();
    }
  }

  /**
   * Search for user in LDAP directory
   */
  private async searchUser(
    client: ldap.Client,
    username: string
  ): Promise<LDAPUser | null> {
    return new Promise((resolve, reject) => {
      const searchFilter = this.config.searchFilter!.replace(
        "{{username}}",
        username
      );
      const opts: ldap.SearchOptions = {
        filter: searchFilter,
        scope: "sub",
        attributes: ["dn", "mail", "email", "displayName", "cn", "uid"],
      };

      client.search(this.config.searchBase, opts, (err, res) => {
        if (err) {
          return reject(err);
        }

        let foundUser: LDAPUser | null = null;

        res.on("searchEntry", (entry) => {
          const obj = entry.pojo;
          foundUser = {
            dn: obj.objectName || "",
            email:
              obj.attributes.find(
                (a: any) => a.type === "mail" || a.type === "email"
              )?.values[0] || "",
            displayName: obj.attributes.find(
              (a: any) => a.type === "displayName" || a.type === "cn"
            )?.values[0],
            uid:
              obj.attributes.find((a: any) => a.type === "uid")?.values[0] ||
              username,
          };
        });

        res.on("error", (err) => {
          reject(err);
        });

        res.on("end", () => {
          resolve(foundUser);
        });
      });
    });
  }

  /**
   * Bind to LDAP server
   */
  private async bind(
    client: ldap.Client,
    dn: string,
    password: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      client.bind(dn, password, (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  }

  /**
   * Unbind from LDAP server
   */
  private async unbind(client: ldap.Client): Promise<void> {
    return new Promise((resolve, reject) => {
      client.unbind((err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  }

  /**
   * Sync LDAP user to local database
   */
  async syncUser(ldapUser: LDAPUser): Promise<any> {
    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { email: ldapUser.email },
    });

    if (!user) {
      // Create new user
      // Generate a random password hash (won't be used for LDAP users)
      const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);

      user = await prisma.user.create({
        data: {
          email: ldapUser.email,
          passwordHash: randomPassword,
          emailVerified: true, // LDAP users are pre-verified
          oauthProvider: "ldap",
          oauthId: ldapUser.uid,
        },
      });
    } else if (user.oauthProvider !== "ldap") {
      // Update existing user to link with LDAP
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          oauthProvider: "ldap",
          oauthId: ldapUser.uid,
        },
      });
    }

    return user;
  }

  /**
   * Test LDAP connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    const client = this.createClient();

    try {
      await this.bind(client, this.config.bindDN, this.config.bindPassword);
      await this.unbind(client);
      return true;
    } catch (error) {
      console.error("LDAP connection test failed:", error);
      return false;
    } finally {
      client.destroy();
    }
  }
}

export const ldapService = new LDAPService();
