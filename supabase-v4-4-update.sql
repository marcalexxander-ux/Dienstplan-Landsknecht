-- Dienstplan Landsknecht v4.4 SQL Update
-- Urlaub wird über app.js automatisch in schedules übertragen.
-- Kein zwingender Datenbank-Umbau nötig.

alter table profiles add column if not exists sort_order integer;

-- Optional: bestehende Daten bleiben erhalten.
