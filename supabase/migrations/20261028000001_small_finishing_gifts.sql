-- A gift under $5 is allowed when it pays off exactly what an item still needs
-- (with fees covered), so the last few dollars of an item can be funded.
-- The $5 minimum for every other gift is enforced in lib/payments/checkout.ts.
alter table donations drop constraint if exists donations_gift_cents_check;
alter table donations add constraint donations_gift_cents_check check (gift_cents > 0);
