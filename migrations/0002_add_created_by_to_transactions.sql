-- Migration to add created_by column to transactions table
ALTER TABLE transactions ADD COLUMN created_by TEXT NULL;

-- Populate created_by from full_name for historical ADDITION, UPDATE, and DEDUCTION records
UPDATE transactions 
SET created_by = full_name 
WHERE transaction_type IN ('ADDITION', 'UPDATE', 'DEDUCTION');

-- Clear full_name for those records since it shouldn't hold operator name
UPDATE transactions
SET full_name = NULL
WHERE transaction_type IN ('ADDITION', 'UPDATE', 'DEDUCTION');
