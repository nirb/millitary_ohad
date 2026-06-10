-- Migration to initialize the inventory and transactions tables

CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    product TEXT NOT NULL,
    quantity INTEGER DEFAULT 0,
    container_capacity INTEGER,
    required_target INTEGER,
    gap INTEGER GENERATED ALWAYS AS (required_target - quantity) VIRTUAL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_id INTEGER NOT NULL,
    transaction_type TEXT CHECK(transaction_type IN ('ADDITION', 'UPDATE', 'SIGN_OUT', 'DEDUCTION')) NOT NULL,
    quantity_changed INTEGER NOT NULL,
    full_name TEXT NULL,
    phone_number TEXT NULL,
    unit TEXT NULL,
    destination TEXT NULL,
    returned_quantity INTEGER DEFAULT 0,
    transaction_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transactions_inventory ON transactions(inventory_id);
