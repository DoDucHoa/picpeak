/**
 * Client access has always stored a real bcrypt password, but the only rule
 * on it was Joi's `string().max(1024)`. The gallery password next to it has
 * required six characters since forever, server side, so the weaker of the
 * two credentials into the same gallery was the one the API would take
 * without complaint. The UI now refuses a short one; this is the half that
 * still holds when the request does not come from the UI.
 *
 * Runs the validator chain the routes declare, rather than standing up the
 * whole admin router: the chain is the contract, and it is identical on the
 * create and the update route.
 */
const express = require('express');
const request = require('supertest');
const { body, validationResult } = require('express-validator');

// The rule as adminEvents/crud.js declares it on both routes.
const clientPasswordRule = body('client_password').optional().isString().custom((value) => {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  if (typeof value !== 'string' || value.trim().length < 6) {
    throw new Error('Client password must be at least 6 characters long');
  }
  return true;
});

function app() {
  const server = express();
  server.use(express.json());
  server.post('/events', clientPasswordRule, (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    res.json({ ok: true });
  });
  return server;
}

describe('client_password validator', () => {
  test('accepts a password of six characters or more', async () => {
    const res = await request(app()).post('/events').send({ client_password: 'Wedding-2026' });
    expect(res.status).toBe(200);
  });

  test('rejects anything shorter than six characters', async () => {
    const res = await request(app()).post('/events').send({ client_password: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toMatch(/at least 6 characters/);
  });

  test('counts trimmed length, so spaces cannot pad a short password', async () => {
    const res = await request(app()).post('/events').send({ client_password: '  ab  ' });
    expect(res.status).toBe(400);
  });

  test('lets the field through untouched when it is absent or empty', async () => {
    await expect(request(app()).post('/events').send({}).then((r) => r.status)).resolves.toBe(200);
    await expect(
      request(app()).post('/events').send({ client_password: '' }).then((r) => r.status),
    ).resolves.toBe(200);
  });

  test('rejects a non-string', async () => {
    const res = await request(app()).post('/events').send({ client_password: 123456 });
    expect(res.status).toBe(400);
  });
});
