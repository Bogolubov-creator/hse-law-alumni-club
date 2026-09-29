import { it, expect } from 'vitest';
import { safeRequestLog } from './request-log.js';
it('подписанные ссылки, пароль и заголовки не раскрываются в журнале запроса', () => {
 const request={method:'GET',url:'/podcasts/id/audio?h=owner&sig=private-signature&token=private-token',ip:'127.0.0.1',headers:{authorization:'Bearer private-auth'},body:{password:'private-password'}};
 const log=JSON.stringify(safeRequestLog(request));
 expect(log).toContain('/podcasts/id/audio');expect(log).not.toContain('private-');expect(log).not.toContain('owner');
});
