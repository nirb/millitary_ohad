-- Migration to add notes column to inventory table
ALTER TABLE inventory ADD COLUMN notes TEXT NULL;
