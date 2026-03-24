-- Add appearance JSONB column to agents table
-- Stores LPC layer choices: { charType, layers: { body: { option, variant }, hair: { ... }, ... } }
ALTER TABLE agents ADD COLUMN IF NOT EXISTS appearance JSONB DEFAULT NULL;
