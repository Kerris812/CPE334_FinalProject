CREATE FUNCTION preserve_queue_entry_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sequence IS DISTINCT FROM OLD.sequence OR NEW.queue_id IS DISTINCT FROM OLD.queue_id
     OR NEW.display_number IS DISTINCT FROM OLD.display_number THEN
    RAISE EXCEPTION 'Allocated queue numbers are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER queue_entry_number_immutable BEFORE UPDATE ON queue_entries
FOR EACH ROW EXECUTE FUNCTION preserve_queue_entry_number();
