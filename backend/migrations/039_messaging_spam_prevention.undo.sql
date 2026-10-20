-- Undo BE-38: Remove messaging spam prevention tables

DROP TABLE IF EXISTS message_reports;
DROP TABLE IF EXISTS message_blocks;
