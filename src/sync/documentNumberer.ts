/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Kinds of numbered documents; the same names the server uses. */
export type DocumentKind = 'order' | 'import' | 'export' | 'receipt' | 'payment';

/** The number to show and, when it is only a temporary code, that code. */
export interface DocumentNumber {
  /** Number shown to people: the official number, or the temporary code until the server replaces it. */
  number: string;
  /** Temporary code given while the server could not be reached; empty when `number` is official. */
  tempNumber: string;
}

/** Source of official numbers. */
export interface NextNumberSource {
  /**
   * @param storeId Store the number is for.
   * @param kind Kind of document.
   * @returns The official number.
   */
  nextNumber(storeId: string, kind: DocumentKind): Promise<string>;
}

/** Source of temporary codes. */
export interface TempCodeIssuer {
  /**
   * @returns A temporary code that no other device gives.
   */
  nextTempCode(): Promise<string>;
}

/** How long a phone waits for the server before it gives the document a temporary code, in milliseconds. */
export const DEFAULT_NUMBER_WAIT_MS = 4000;

/**
 * Gives new documents their number. The server hands out official numbers that rise by one per store. A phone
 * that cannot reach the server within a short wait gives a temporary code instead, and the server replaces it
 * with an official number when the document is uploaded. A browser (no temporary codes) needs the server and
 * reports an error when it cannot be reached.
 */
export class DocumentNumberer {
  /**
   * @param source Where official numbers come from.
   * @param temp Issues temporary codes; null for a browser, which has no offline mode.
   * @param waitMs Longest wait for the server when `temp` is set.
   */
  constructor(
    private readonly source: NextNumberSource,
    private readonly temp: TempCodeIssuer | null,
    private readonly waitMs: number = DEFAULT_NUMBER_WAIT_MS,
  ) {}

  /**
   * @param storeId Store the document belongs to.
   * @param kind Kind of document.
   * @returns The number of the new document.
   * @throws {Error} When the server fails and there is no temporary code to fall back on.
   */
  async next(storeId: string, kind: DocumentKind): Promise<DocumentNumber> {
    if (!this.temp) return { number: await this.source.nextNumber(storeId, kind), tempNumber: '' };
    try {
      return { number: await this.withinWait(this.source.nextNumber(storeId, kind)), tempNumber: '' };
    } catch {
      // Any failure (no network, slow network, server error) falls back, so a sale is never blocked by the connection.
      const code = await this.temp.nextTempCode();
      return { number: code, tempNumber: code };
    }
  }

  /**
   * @param request The pending request.
   * @returns The request's result.
   * @throws {Error} When the request fails or takes longer than the wait.
   */
  private withinWait<T>(request: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The server did not answer in time.')), this.waitMs);
      request.then(
        value => { clearTimeout(timer); resolve(value); },
        error => { clearTimeout(timer); reject(error); },
      );
    });
  }
}
