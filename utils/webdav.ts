import type { WebDavConfig, RemoteMeta } from '../types';

export class WebDavClient {
  private config: WebDavConfig;
  private authHeader: string;

  constructor(config: WebDavConfig) {
    this.config = {
      ...config,
      url: this.normalizeUrl(config.url),
      syncDir: this.normalizeDir(config.syncDir || '/passmark/'),
    };
    this.authHeader = `Basic ${btoa(unescape(encodeURIComponent(`${config.username}:${config.password}`)))}`;
  }

  private normalizeUrl(url: string): string {
    let clean = url.trim();
    if (!clean.endsWith('/')) {
      clean += '/';
    }
    return clean;
  }

  private normalizeDir(dir: string): string {
    let clean = dir.trim();
    if (!clean.startsWith('/')) {
      clean = '/' + clean;
    }
    if (!clean.endsWith('/')) {
      clean = clean + '/';
    }
    return clean;
  }

  private getFullUrl(relativePath: string): string {
    const cleanRelative = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    const base = this.config.url;
    const dir = this.config.syncDir.startsWith('/') ? this.config.syncDir.slice(1) : this.config.syncDir;
    return `${base}${dir}${cleanRelative}`;
  }

  private getDirUrl(): string {
    const base = this.config.url;
    const dir = this.config.syncDir.startsWith('/') ? this.config.syncDir.slice(1) : this.config.syncDir;
    return `${base}${dir}`;
  }

  /**
   * Test connection and ensure target sync folder exists
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    hasExistingVault?: boolean;
    meta?: RemoteMeta | null;
  }> {
    try {
      // 1. First probe base url or dir with PROPFIND
      const dirUrl = this.getDirUrl();
      const res = await fetch(dirUrl, {
        method: 'PROPFIND',
        headers: {
          Authorization: this.authHeader,
          Depth: '0',
        },
      });

      if (res.status === 401 || res.status === 403) {
        return { success: false, message: '认证失败：用户名或密码错误' };
      }

      if (res.status === 404) {
        // Try creating directory
        const created = await this.ensureDirectory();
        if (created) {
          return { success: true, message: '连接成功，已自动创建远程同步目录', hasExistingVault: false };
        } else {
          return { success: false, message: '未找到同步目录，且尝试自动创建失败' };
        }
      }

      if (res.ok || res.status === 207) {
        const meta = await this.getMeta();
        if (meta && meta.salt) {
          return {
            success: true,
            message: 'WebDAV 连接正常，检测到已有云端保险箱备份！',
            hasExistingVault: true,
            meta,
          };
        }
        return { success: true, message: 'WebDAV 服务连接正常，目标目录为空', hasExistingVault: false };
      }

      return { success: false, message: `连接异常，服务器响应 HTTP ${res.status}` };
    } catch (err: any) {
      return { success: false, message: `网络连接失败: ${err.message || String(err)}` };
    }
  }

  /**
   * Ensure the sync directory exists on the WebDAV server
   */
  async ensureDirectory(): Promise<boolean> {
    try {
      const dirUrl = this.getDirUrl();
      const checkRes = await fetch(dirUrl, {
        method: 'PROPFIND',
        headers: {
          Authorization: this.authHeader,
          Depth: '0',
        },
      });

      if (checkRes.ok || checkRes.status === 207) {
        return true;
      }

      if (checkRes.status === 404) {
        // Recursive directory creation for nested paths like /a/b/c/
        const parts = this.config.syncDir.split('/').filter(Boolean);
        let currentPath = '';
        for (const part of parts) {
          currentPath += `${part}/`;
          const stepUrl = `${this.config.url}${currentPath}`;
          const mkRes = await fetch(stepUrl, {
            method: 'MKCOL',
            headers: {
              Authorization: this.authHeader,
            },
          });
          // 201 Created or 405 Method Not Allowed (already exists)
          if (!mkRes.ok && mkRes.status !== 405 && mkRes.status !== 201) {
            // Some servers return 405 if directory already exists
          }
        }
        return true;
      }
      return false;
    } catch (e) {
      console.error('ensureDirectory error:', e);
      return false;
    }
  }

  /**
   * Read remote file content
   */
  async getFile(filename: string): Promise<string | null> {
    try {
      const url = this.getFullUrl(filename);
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          'Cache-Control': 'no-cache',
        },
      });

      if (res.status === 404) {
        return null;
      }

      if (!res.ok) {
        throw new Error(`WebDAV GET ${filename} failed: HTTP ${res.status}`);
      }

      return await res.text();
    } catch (err: any) {
      if (err.message?.includes('404')) return null;
      throw err;
    }
  }

  /**
   * Upload / write remote file
   */
  async putFile(filename: string, content: string, contentType = 'application/json'): Promise<boolean> {
    await this.ensureDirectory();

    const url = this.getFullUrl(filename);
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': contentType,
      },
      body: content,
    });

    if (!res.ok && res.status !== 201 && res.status !== 204) {
      throw new Error(`WebDAV PUT ${filename} failed: HTTP ${res.status}`);
    }

    return true;
  }

  /**
   * Fetch meta.json
   */
  async getMeta(): Promise<RemoteMeta | null> {
    const content = await this.getFile('meta.json');
    if (!content) return null;
    try {
      return JSON.parse(content) as RemoteMeta;
    } catch {
      return null;
    }
  }

  /**
   * Save meta.json
   */
  async putMeta(meta: RemoteMeta): Promise<boolean> {
    return this.putFile('meta.json', JSON.stringify(meta, null, 2));
  }
}
