/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The two routes to the same database server. */
export interface ServerEndpointConfig {
  /** Address through the internet, for example "https://pos.hp-backup.com". Tried first. */
  domainUrl: string;
  /** Address inside the shop network, for example "http://192.168.1.12". Empty when there is none. */
  localUrl: string;
}

/** Tuning values; the defaults suit the app and tests replace them. */
export interface ServerEndpointOptions {
  /** HTTP function. */
  fetchImpl?: typeof fetch;
  /** Clock in milliseconds. */
  now?: () => number;
  /** How long a health check may take before the address counts as unreachable. */
  probeTimeoutMs?: number;
  /** How long a request may take before it is treated as lost. */
  requestTimeoutMs?: number;
  /** While on the local address, how often the domain is checked again. */
  domainRecheckMs?: number;
  /** Address of the page the app runs in, for example "https://pos.hp-backup.com"; read from the browser when not given. Used to explain failures. */
  pageOrigin?: string;
}

/** Details of one request. */
export interface ServerRequestOptions {
  /** True for requests that can safely be sent twice (reads). A write whose answer was lost is never repeated on the other address. */
  idempotent: boolean;
}

/** HTTP statuses a proxy or CDN answers when the server behind it cannot be reached; the request did not reach the database. */
const UNREACHABLE_STATUSES = new Set([502, 503, 504, 521, 522, 523]);

/** A route that did not answer, with the reason. */
class UnreachableError extends Error {}

/**
 * Sends requests to the database server over the domain address first and the local address when the
 * domain cannot be reached, and goes back to the domain once it answers again.
 *
 * Reachability is decided by a short health check (`/api/health`), not by waiting for a real request
 * to time out. A request that fails to connect is repeated once on the other address. A write that timed
 * out is not repeated, because it may have been stored already; the error says so.
 */
export class ServerEndpoints {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly probeTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly domainRecheckMs: number;
  private readonly pageOrigin: string;
  /** Why the last health check of each route failed, for the error message. */
  private readonly probeFailure: Partial<Record<'domain' | 'local', string>> = {};
  private active: 'domain' | 'local' | null = null;
  private lastDomainCheck = 0;
  private domainProbe: Promise<void> | null = null;

  /**
   * @param config The two addresses; the local one may be empty.
   * @param options Tuning values.
   */
  constructor(private readonly config: ServerEndpointConfig, options: ServerEndpointOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => Date.now());
    this.probeTimeoutMs = options.probeTimeoutMs ?? 2500;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30000;
    this.domainRecheckMs = options.domainRecheckMs ?? 15000;
    this.pageOrigin = options.pageOrigin ?? (typeof location !== 'undefined' ? location.origin : '');
  }

  /**
   * @returns The address in use now ("domain" before the first request).
   */
  get activeRoute(): 'domain' | 'local' {
    return this.active ?? 'domain';
  }

  /**
   * @returns The base address in use now.
   */
  get activeUrl(): string {
    return this.urlOf(this.activeRoute);
  }

  /**
   * Sends a request to the server, failing over between the two addresses.
   *
   * @param path API path, for example "/api/sql".
   * @param init Fetch options (method, headers, body); the abort signal is managed here.
   * @param options Whether the request may be repeated.
   * @returns The server's answer. HTTP error statuses other than "server unreachable" are returned, not thrown.
   * @throws Error with a readable message naming the addresses tried when none can be reached, or when a write timed out.
   */
  async request(path: string, init: RequestInit, options: ServerRequestOptions): Promise<Response> {
    if (this.active === null) await this.chooseRoute();
    else this.recheckDomainInBackground();

    const first = this.activeRoute;
    try {
      return await this.send(first, path, init, options);
    } catch (error) {
      const other = first === 'domain' ? 'local' : 'domain';
      if (!this.hasRoute(other) || !(error instanceof UnreachableError)) throw this.describe(first, error);
      if (!(await this.isHealthy(other))) throw this.describe(first, error, other);
      this.setActive(other);
      try {
        return await this.send(other, path, init, options);
      } catch (retryError) {
        throw this.describe(first, error, other, retryError);
      }
    }
  }

  /**
   * Sends a request on one route and reports "not reachable" as `UnreachableError`.
   *
   * @param route Route to use.
   * @param path API path.
   * @param init Fetch options.
   * @param options Whether the request may be repeated.
   * @returns The answer.
   * @throws UnreachableError when the route did not answer; Error for a write that timed out.
   */
  private async send(route: 'domain' | 'local', path: string, init: RequestInit, options: ServerRequestOptions): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(`${this.urlOf(route)}${path}`, init, this.requestTimeoutMs);
    } catch (error) {
      if ((error as Error).name === 'AbortError' && !options.idempotent) {
        throw new Error('Máy chủ không trả lời kịp. Thao tác có thể đã được lưu, hãy kiểm tra lại dữ liệu trước khi làm lại.');
      }
      throw new UnreachableError((error as Error).message);
    }
    if (UNREACHABLE_STATUSES.has(response.status)) throw new UnreachableError(`mã ${response.status}`);
    return response;
  }

  /**
   * Picks the route for the first request: the domain when it answers, else the local address.
   * When neither answers the domain stays selected and the request reports the failure.
   */
  private async chooseRoute(): Promise<void> {
    if (await this.isHealthy('domain')) {
      this.setActive('domain');
    } else if (this.hasRoute('local') && await this.isHealthy('local')) {
      this.setActive('local');
    } else {
      this.active = 'domain';
    }
  }

  /**
   * While the local address is in use, checks the domain now and then (without making the caller wait)
   * and goes back to it once it answers.
   */
  private recheckDomainInBackground(): void {
    if (this.active !== 'local' || this.domainProbe || this.now() - this.lastDomainCheck < this.domainRecheckMs) return;
    this.domainProbe = this.isHealthy('domain')
      .then((healthy) => { if (healthy) this.setActive('domain'); })
      .finally(() => { this.domainProbe = null; });
  }

  /**
   * @param route Route to check.
   * @returns True when its health check answers in time.
   */
  private async isHealthy(route: 'domain' | 'local'): Promise<boolean> {
    if (route === 'domain') this.lastDomainCheck = this.now();
    const url = this.urlOf(route);
    if (this.isBlockedAsMixedContent(url)) {
      this.probeFailure[route] = `trình duyệt chặn: trang ${this.pageOrigin} dùng https nên không được gọi địa chỉ http. Hãy mở app ở địa chỉ http của mạng nội bộ`;
      return false;
    }
    try {
      const response = await this.fetchWithTimeout(`${url}/api/health`, { method: 'GET' }, this.probeTimeoutMs);
      if (!response.ok) this.probeFailure[route] = `máy chủ trả mã ${response.status}`;
      else delete this.probeFailure[route];
      return response.ok;
    } catch (error) {
      this.probeFailure[route] = (error as Error).name === 'AbortError'
        ? `không phản hồi sau ${this.probeTimeoutMs / 1000} giây`
        : `${(error as Error).message} (không tới được máy chủ, hoặc máy chủ không cho phép trang ${this.pageOrigin || 'này'} gọi vào)`;
      return false;
    }
  }

  /**
   * Browsers refuse to let a page opened over https call an http address (except this machine itself).
   *
   * @param url Address to call.
   * @returns True when the call would be blocked for that reason.
   */
  private isBlockedAsMixedContent(url: string): boolean {
    return this.pageOrigin.startsWith('https:') && url.startsWith('http:') && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
  }

  /**
   * @param route Route that is now in use.
   */
  private setActive(route: 'domain' | 'local'): void {
    this.active = route;
    if (route === 'local') this.lastDomainCheck = this.now();
  }

  /**
   * @param url Full address.
   * @param init Fetch options.
   * @param timeoutMs Time allowed.
   * @returns The answer.
   */
  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * @param route Route name.
   * @returns True when the route has an address.
   */
  private hasRoute(route: 'domain' | 'local'): boolean {
    return Boolean(this.urlOf(route));
  }

  /**
   * @param route Route name.
   * @returns The address of the route; empty for a local route that is not set.
   */
  private urlOf(route: 'domain' | 'local'): string {
    return route === 'domain' ? this.config.domainUrl : this.config.localUrl;
  }

  /**
   * Builds the error shown when a request could not be completed.
   *
   * @param first Route tried first.
   * @param firstError Why it failed.
   * @param second Route tried second, if any.
   * @param secondError Why it failed, when it was tried.
   * @returns The error to throw.
   */
  private describe(first: 'domain' | 'local', firstError: unknown, second?: 'domain' | 'local', secondError?: unknown): Error {
    if (!(firstError instanceof UnreachableError)) return firstError as Error;
    const parts = [`${this.urlOf(first)}: ${(firstError as Error).message}`];
    if (second) parts.push(`${this.urlOf(second)}: ${secondError ? (secondError as Error).message : this.probeFailure[second] ?? 'không phản hồi'}`);
    const where = second ? 'cả hai địa chỉ' : 'địa chỉ này';
    const page = this.pageOrigin ? ` Trang đang mở tại ${this.pageOrigin}.` : '';
    return new Error(`Không kết nối được máy chủ dữ liệu qua ${where} (${parts.join('; ')}).${page}`);
  }
}
