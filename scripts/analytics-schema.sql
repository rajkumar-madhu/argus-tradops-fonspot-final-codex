-- Optional setup for a NEW analytics database. Existing customer tables stay owned
-- by their deployment. Run with a schema administrator, never the API reader.
CREATE TABLE IF NOT EXISTS order_latency (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  file_date DATE NOT NULL,
  noren_ord_num BIGINT NOT NULL,
  exch_seg VARCHAR(64) NOT NULL,
  token BIGINT,
  oms_latency DOUBLE,
  oms_exch_confirmation DOUBLE,
  oms_update_time BIGINT NOT NULL,
  exch_update_time BIGINT,
  oms_update_time_conv DATETIME,
  INDEX latency_day_segment (file_date, exch_seg, oms_update_time),
  INDEX latency_event_time (oms_update_time),
  INDEX latency_order (noren_ord_num)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS queue_line1 (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  file_date DATE NOT NULL,
  segment VARCHAR(64) NOT NULL,
  time DATETIME NOT NULL,
  seq_no BIGINT,
  erf BIGINT,
  queue_size BIGINT NOT NULL,
  INDEX queue_day_segment (file_date, segment, time),
  INDEX queue_event_time (time)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS queue_line2 LIKE queue_line1;
