-- The default ordering of every /app/shopping-products page. 11k rows today,
-- growing with every scrape, and sorted from scratch on each request.
CREATE INDEX "shopping_products_scraped_at_idx" ON "shopping_products"("scraped_at");

-- campaign_rewards already has a (campaign_id, user_id, threshold_amount)
-- unique constraint, but its index is campaign-leading, so the app's
-- "my rewards" list could not use it.
CREATE INDEX "campaign_rewards_user_id_idx" ON "campaign_rewards"("user_id");
