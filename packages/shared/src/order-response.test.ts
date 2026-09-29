import { it, expect } from 'vitest';
import { myOrdersSchema, cartSummarySchema } from './responses.js';
it('заявка на подписку читается в кабинете, но не становится товаром корзины', () => {
 const item={type:'podcast',ref_id:'podcast-sub-year',qty:1,price:499900,title:'Подписка'};
 expect(myOrdersSchema.safeParse([{number:'ALU-2026-000001',type:'podcast',status:'new',subtotal:499900,total_estimate:499900,member_discount:0,created_at:'2026-09-08T12:00:00Z',items_json:[item]}]).success).toBe(true);
 expect(cartSummarySchema.safeParse({items:[item],count:1,subtotal:499900}).success).toBe(false);
});
