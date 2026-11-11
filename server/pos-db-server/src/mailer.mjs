/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import nodemailer from 'nodemailer';

/**
 * Something that sends a plain-text mail.
 *
 * @typedef {Object} Mailer
 * @property {(message: { to: string, subject: string, text: string }) => Promise<void>} send Sends the mail; rejects when the mail server refuses it.
 */

/**
 * Builds a mailer that sends through an SMTP server.
 *
 * @param {import('./config.mjs').SmtpConfig} smtp Mail server settings.
 * @returns {Mailer} The mailer.
 */
export function createSmtpMailer(smtp) {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass } } : {}),
  });
  return {
    async send({ to, subject, text }) {
      await transport.sendMail({ from: smtp.from, to, subject, text });
    },
  };
}
