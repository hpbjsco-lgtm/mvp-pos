/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BĂM MẬT KHẨU (PBKDF2-SHA256)
 * -----------------------------
 * Tách riêng khỏi auth.ts để seed.ts có thể tạo tài khoản nhân viên mẫu
 * mà không tạo vòng lặp import (auth.ts -> seed.ts -> auth.ts).
 */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Dự phòng cho môi trường không có Web Crypto (http qua IP LAN khi dev). */
function weakHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `weak$${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}`;
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return toHex(bytes.buffer);
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) {
    console.warn('[AUTH] Web Crypto không khả dụng, dùng cơ chế băm dự phòng.');
    return weakHash(`${salt}:${password}`);
  }
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key,
    256,
  );
  return `pbkdf2$${toHex(bits)}`;
}

export async function verifyPassword(password: string, salt: string, expected: string): Promise<boolean> {
  if (expected.startsWith('weak$')) return weakHash(`${salt}:${password}`) === expected;
  return (await hashPassword(password, salt)) === expected;
}
