/**
 * settleReservation against a real HTTP server and a real client that hangs up.
 *
 * The unit suite drives this with a hand-made response object, which is exactly
 * the wrong place to be confident: the whole design rests on two Node
 * behaviours, that 'close' fires on every outcome and that `writableFinished`
 * separates "the client got the whole body" from "the socket went away". A fake
 * response asserts those behaviours rather than exercising them, so a wrong
 * belief about Node would pass there and lose a client their entire allowance
 * in production.
 *
 * Nothing is mocked here except the ledger write itself. The server, the
 * socket, the abort and the events are real.
 */

const http = require('http');
const { once } = require('events');

jest.mock('../../src/services/downloadQuotaService', () => ({
  releaseReservation: jest.fn(async () => 0),
}));
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const { releaseReservation } = require('../../src/services/downloadQuotaService');
const { settleReservation } = require('../../src/routes/gallery/downloadQuotaGate');

const RESERVED = [{ id: 1, photo_id: 10 }, { id: 2, photo_id: 11 }];
const req = { event: { id: 7 } };

/** Resolves once settleReservation has actually called the ledger. */
function settlementCall() {
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      if (releaseReservation.mock.calls.length > 0) return resolve(releaseReservation.mock.calls[0]);
      if (Date.now() - started > 4000) return resolve(null);
      setTimeout(poll, 10);
    };
    poll();
  });
}

describe('settling a reservation over a real socket', () => {
  let server;
  let port;
  let handler;

  beforeAll(async () => {
    server = http.createServer((request, response) => handler(request, response));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    port = server.address().port;
  });

  afterAll(async () => {
    server.close();
    await once(server, 'close');
  });

  beforeEach(() => jest.clearAllMocks());

  test('a client that hangs up mid-archive is refunded every slot it claimed', async () => {
    handler = (request, response) => {
      settleReservation(response, req, RESERVED, () => [10, 11]);
      response.writeHead(200, { 'Content-Type': 'application/zip' });
      // Announce far more than we send, so the response can never finish on its
      // own and the only way out is the client giving up. A large archive that
      // the client cancels halfway looks exactly like this.
      response.write('x'.repeat(1024));
    };

    const clientRequest = http.get({ host: '127.0.0.1', port, path: '/archive' });
    const [response] = await once(clientRequest, 'response');
    await once(response, 'data');
    clientRequest.destroy();

    const call = await settlementCall();
    expect(call).not.toBeNull();
    // Delivered nothing, so nothing is kept: both claimed rows go back.
    expect(call[0]).toEqual(RESERVED);
    expect(call[1]).toEqual([]);
  }, 15000);

  test('a completed transfer keeps what it delivered and refunds the rest', async () => {
    handler = (request, response) => {
      // The archive builder skipped photo 11, so only 10 actually shipped.
      settleReservation(response, req, RESERVED, () => [10]);
      response.writeHead(200, { 'Content-Type': 'application/zip' });
      response.end('archive-bytes');
    };

    const clientRequest = http.get({ host: '127.0.0.1', port, path: '/archive' });
    const [response] = await once(clientRequest, 'response');
    response.resume();
    await once(response, 'end');

    const call = await settlementCall();
    expect(call).not.toBeNull();
    expect(call[1]).toEqual([10]);
  }, 15000);

  test('a response that ends in an error status refunds everything', async () => {
    handler = (request, response) => {
      settleReservation(response, req, RESERVED, () => [10, 11]);
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'archive failed' }));
    };

    const clientRequest = http.get({ host: '127.0.0.1', port, path: '/archive' });
    const [response] = await once(clientRequest, 'response');
    response.resume();
    await once(response, 'end');

    const call = await settlementCall();
    expect(call).not.toBeNull();
    expect(call[1]).toEqual([]);
  }, 15000);
});
