/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compares two secrets without leaking their length or content through timing.
 *
 * @param {string} received Value sent by the client.
 * @param {string} expected Value stored in the server settings.
 * @returns {boolean} True when both are equal.
 */
export function secretsMatch(received, expected) {
  const receivedHash = createHash('sha256').update(received).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

/**
 * Builds an Express middleware that only lets requests through when they carry
 * `Authorization: Bearer <token>` with the configured token.
 *
 * @param {string} apiToken Secret every request must present.
 * @returns {import('express').RequestHandler} Middleware that answers 401 on a missing or wrong token.
 */
export function requireBearerToken(apiToken) {
  return (request, response, next) => {
    const header = request.get('Authorization') || '';
    const prefix = 'Bearer ';
    const received = header.startsWith(prefix) ? header.slice(prefix.length) : '';
    if (!received || !secretsMatch(received, apiToken)) {
      response.status(401).json({ error: 'Missing or invalid API token.' });
      return;
    }
    next();
  };
}
