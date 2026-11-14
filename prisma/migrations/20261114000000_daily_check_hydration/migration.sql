-- Use the latest daily fluid total so a follow-up can clear an intake alert.
-- Keep configured limits, enabled state, and alert history.
UPDATE "AlertRule" SET "kind" = 'latest' WHERE "id" = 'hydration_low' AND "kind" = 'threshold';
