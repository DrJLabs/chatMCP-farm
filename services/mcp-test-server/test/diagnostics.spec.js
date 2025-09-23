import { describe, expect, it } from 'vitest';
import { buildDiagnosticsPayload, diagnosticsToolMetadata } from '../src/mcp.js';
function createFakeJwt(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.signature`;
}
describe('diagnostics.ping payload', () => {
    it('summarizes token claims and metadata safely', () => {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const token = createFakeJwt({ sub: 'user-123', aud: ['aud-a', 'aud-b'], exp: nowSeconds + 3600 });
        const extra = {
            signal: new AbortController().signal,
            requestId: '1',
            sendNotification: async () => { },
            sendRequest: async () => {
                throw new Error('not implemented');
            },
            authInfo: {
                token,
                clientId: 'client-abc',
                scopes: ['mcp:tools'],
                expiresAt: nowSeconds + 3600,
            },
            requestInfo: {
                headers: new Headers({ origin: 'https://chatgpt.com' }),
            },
            sessionId: 'session-1',
        };
        const payload = buildDiagnosticsPayload({ note: 'hello' }, extra, { allowedOrigins: ['https://chatgpt.com'] });
        expect(payload.note).toBe('hello');
        expect(payload.allowedOrigins).toEqual(['https://chatgpt.com']);
        expect(payload.origin).toBe('https://chatgpt.com');
        expect(payload.token?.subject).toBe('user-123');
        expect(payload.token?.audiences).toEqual(['aud-a', 'aud-b']);
        expect(payload.token?.clientId).toBe('client-abc');
        expect(payload.token?.scopes).toEqual(['mcp:tools']);
        expect(payload.timestamp).toBeTypeOf('string');
    });
});
describe('diagnostics tool metadata', () => {
    it('describes the diagnostics tool for manifest listing', () => {
        expect(diagnosticsToolMetadata.name).toBe('diagnostics.ping');
        expect(diagnosticsToolMetadata.description).toContain('deterministic');
    });
});
