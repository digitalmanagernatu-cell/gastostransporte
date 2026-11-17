-- Esquema de la base de datos del dashboard (Neon, proyecto "gastos-transporte",
-- id muddy-snow-15107989, rama main). Referencia: ya está aplicado.
-- La Data API expone solo el esquema "api"; las tablas no son accesibles directamente.
-- La contraseña de carga se guarda como hash bcrypt en private.settings.
--   Cambiarla:  UPDATE private.settings SET value = crypt('NUEVA', gen_salt('bf'))
--               WHERE key = 'upload_password_hash';

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS api;
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE months (
  id serial PRIMARY KEY,
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  billing_filename text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

-- Una fila por línea del Excel SAP (normalmente una por factura)
CREATE TABLE billing_rows (
  id serial PRIMARY KEY,
  month_id int NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  invoice_number text NOT NULL DEFAULT '',
  client_code text NOT NULL,
  client_name text NOT NULL,
  comercial text NOT NULL DEFAULT '',
  linea_negocio text NOT NULL DEFAULT '',
  base_imponible numeric(14,2) NOT NULL DEFAULT 0,
  num_facturas int NOT NULL DEFAULT 0
);
CREATE INDEX ON billing_rows (month_id);

-- Un archivo de factura de agencia subido
CREATE TABLE invoices (
  id serial PRIMARY KEY,
  month_id int NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  agency text NOT NULL,
  filename text NOT NULL,
  invoice_number text,
  total numeric(14,2) NOT NULL DEFAULT 0,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON invoices (month_id);

-- Líneas de una factura de agencia. client_code/reference = referencia limpia
-- (código cliente C123/CF123 o nº factura SAP sin prefijo FV/PV); el cruce con SAP
-- se hace en el navegador (src/utils/buildMonth.ts).
CREATE TABLE invoice_lines (
  id serial PRIMARY KEY,
  invoice_id int NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  client_code text,
  reference text NOT NULL DEFAULT '',
  reference_original text NOT NULL DEFAULT '',
  agency_invoice text NOT NULL DEFAULT '',
  amount numeric(14,2) NOT NULL
);
CREATE INDEX ON invoice_lines (invoice_id);

CREATE TABLE private.settings (key text PRIMARY KEY, value text NOT NULL);

-- ─── Funciones (las únicas expuestas por la Data API) ───────────────────────

CREATE OR REPLACE FUNCTION private.assert_password(p text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
BEGIN
  IF p IS NULL OR NOT EXISTS (SELECT 1 FROM private.settings WHERE key = 'upload_password_hash' AND value = crypt(p, value)) THEN
    RAISE EXCEPTION 'Contraseña incorrecta' USING ERRCODE = '28000';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION api.check_password(p_password text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
BEGIN PERFORM private.assert_password(p_password); RETURN true; END $$;

-- Todos los meses con su facturación, facturas y líneas (agregadas por referencia)
CREATE OR REPLACE FUNCTION api.get_dashboard() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id', m.id, 'year', m.year, 'month', m.month, 'billing_filename', m.billing_filename, 'updated_at', m.updated_at,
  'billing', COALESCE((SELECT jsonb_agg(jsonb_build_object('invoice_number', b.invoice_number, 'client_code', b.client_code,
      'client_name', b.client_name, 'comercial', b.comercial, 'linea_negocio', b.linea_negocio,
      'base_imponible', b.base_imponible::float8, 'num_facturas', b.num_facturas) ORDER BY b.id)
    FROM billing_rows b WHERE b.month_id = m.id), '[]'::jsonb),
  'invoices', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'agency', i.agency, 'filename', i.filename,
      'invoice_number', i.invoice_number, 'total', i.total::float8, 'uploaded_at', i.uploaded_at,
      'line_count', (SELECT count(*) FROM invoice_lines l WHERE l.invoice_id = i.id)) ORDER BY i.uploaded_at)
    FROM invoices i WHERE i.month_id = m.id), '[]'::jsonb),
  'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('agency', x.agency, 'client_code', x.client_code,
      'reference', x.reference, 'reference_original', x.reference_original, 'amount', x.amount))
    FROM (SELECT i.agency, l.client_code, l.reference, l.reference_original, sum(l.amount)::float8 AS amount
          FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id WHERE i.month_id = m.id
          GROUP BY i.agency, l.client_code, l.reference, l.reference_original) x), '[]'::jsonb)
) ORDER BY m.year, m.month), '[]'::jsonb) FROM months m $$;

-- Crea el mes o reemplaza su facturación (las facturas de transporte se conservan)
CREATE OR REPLACE FUNCTION api.upsert_month(p_password text, p_year int, p_month int, p_filename text, p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE v_id int; v_count int;
BEGIN
  PERFORM private.assert_password(p_password);
  IF p_year NOT BETWEEN 2000 AND 2100 OR p_month NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Mes o año no válido'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN RAISE EXCEPTION 'El Excel de facturación no tiene filas'; END IF;
  INSERT INTO months (year, month, billing_filename) VALUES (p_year, p_month, p_filename)
    ON CONFLICT (year, month) DO UPDATE SET billing_filename = EXCLUDED.billing_filename, updated_at = now()
    RETURNING id INTO v_id;
  DELETE FROM billing_rows WHERE month_id = v_id;
  INSERT INTO billing_rows (month_id, invoice_number, client_code, client_name, comercial, linea_negocio, base_imponible, num_facturas)
  SELECT v_id, COALESCE(btrim(r->>'invoice_number'), ''), btrim(r->>'client_code'),
         COALESCE(NULLIF(btrim(r->>'client_name'), ''), btrim(r->>'client_code')),
         COALESCE(btrim(r->>'comercial'), ''), COALESCE(btrim(r->>'linea_negocio'), ''),
         COALESCE((r->>'base_imponible')::numeric, 0), COALESCE((r->>'num_facturas')::numeric, 1)::int
  FROM jsonb_array_elements(p_rows) r WHERE NULLIF(btrim(r->>'client_code'), '') IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('id', v_id, 'rows', v_count);
END $$;

-- Añade una factura de agencia a un mes ya creado
CREATE OR REPLACE FUNCTION api.add_invoice(p_password text, p_month_id int, p_agency text, p_filename text, p_invoice_number text, p_lines jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE v_id int; v_count int; v_total numeric;
BEGIN
  PERFORM private.assert_password(p_password);
  IF upper(p_agency) NOT IN ('SEUR','PALEMANIA','TRANSAHER','REDUR','NACEX','DHL','DHL_EXPORT','CORREOS','OTROS') THEN RAISE EXCEPTION 'Agencia no válida: %', p_agency; END IF;
  IF NOT EXISTS (SELECT 1 FROM months WHERE id = p_month_id) THEN RAISE EXCEPTION 'El mes no existe'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'La factura no tiene líneas con importe'; END IF;
  INSERT INTO invoices (month_id, agency, filename, invoice_number)
    VALUES (p_month_id, upper(p_agency), COALESCE(p_filename, ''), NULLIF(btrim(p_invoice_number), '')) RETURNING id INTO v_id;
  INSERT INTO invoice_lines (invoice_id, client_code, reference, reference_original, agency_invoice, amount)
  SELECT v_id, NULLIF(btrim(l->>'client_code'), ''), COALESCE(btrim(l->>'reference'), ''), COALESCE(btrim(l->>'reference_original'), ''),
         COALESCE(btrim(l->>'agency_invoice'), ''), (l->>'amount')::numeric
  FROM jsonb_array_elements(p_lines) l WHERE COALESCE((l->>'amount')::numeric, 0) <> 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SELECT COALESCE(sum(amount), 0) INTO v_total FROM invoice_lines WHERE invoice_id = v_id;
  UPDATE invoices SET total = v_total WHERE id = v_id;
  UPDATE months SET updated_at = now() WHERE id = p_month_id;
  RETURN jsonb_build_object('id', v_id, 'lines', v_count, 'total', v_total::float8);
END $$;

CREATE OR REPLACE FUNCTION api.delete_invoice(p_password text, p_id int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE v_n int; BEGIN PERFORM private.assert_password(p_password); DELETE FROM invoices WHERE id = p_id;
GET DIAGNOSTICS v_n = ROW_COUNT; RETURN jsonb_build_object('deleted', v_n); END $$;

CREATE OR REPLACE FUNCTION api.delete_month(p_password text, p_id int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE v_n int; BEGIN PERFORM private.assert_password(p_password); DELETE FROM months WHERE id = p_id;
GET DIAGNOSTICS v_n = ROW_COUNT; RETURN jsonb_build_object('deleted', v_n); END $$;

-- Permisos: el rol anónimo de la Data API solo puede ejecutar estas funciones
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA api TO anonymous;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO anonymous;
