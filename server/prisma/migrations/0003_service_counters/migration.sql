BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM queue_entries e JOIN queues q ON q.id=e.queue_id
    WHERE e.status IN ('CALLED','SERVING') AND
      (q.code NOT IN ('R','S') OR e.called_at IS NULL OR (e.status='SERVING' AND e.serving_at IS NULL))
  ) THEN
    RAISE EXCEPTION 'Counter migration requires supported active queues and valid lifecycle timestamps';
  END IF;
END $$;

CREATE TABLE service_counters (
  id UUID PRIMARY KEY,
  code VARCHAR(8) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT service_counters_id_queue_id_key UNIQUE (id,queue_id)
);
CREATE INDEX service_counters_queue_id_idx ON service_counters(queue_id);
INSERT INTO service_counters(id,code,name,queue_id)
SELECT gen_random_uuid(),code,'Counter '||code,id FROM queues WHERE code IN ('R','S');

ALTER TABLE queue_entries ADD COLUMN counter_id UUID;
UPDATE queue_entries e SET counter_id=c.id
FROM service_counters c WHERE e.queue_id=c.queue_id AND e.status IN ('CALLED','SERVING');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM queue_entries WHERE status IN ('CALLED','SERVING') AND counter_id IS NULL) THEN
    RAISE EXCEPTION 'Counter migration could not backfill every active entry';
  END IF;
END $$;

ALTER TABLE queue_entries ADD CONSTRAINT queue_entries_counter_id_queue_id_fkey
  FOREIGN KEY(counter_id,queue_id) REFERENCES service_counters(id,queue_id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE queue_entries ADD CONSTRAINT queue_entries_counter_status
  CHECK ((status NOT IN ('CALLED','SERVING') OR counter_id IS NOT NULL)
    AND (status NOT IN ('WAITING','CANCELLED') OR counter_id IS NULL));
CREATE UNIQUE INDEX queue_entries_one_counter_reservation ON queue_entries(counter_id)
  WHERE status IN ('CALLED','SERVING');

COMMIT;
