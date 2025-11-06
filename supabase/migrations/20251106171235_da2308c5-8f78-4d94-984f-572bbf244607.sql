-- Tabla: proceso
CREATE TABLE proceso (
    id_proceso SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla: subproceso
CREATE TABLE subproceso (
    id_subproceso SERIAL PRIMARY KEY,
    id_proceso INTEGER NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (id_proceso) REFERENCES proceso(id_proceso) ON DELETE CASCADE
);

-- Tabla: caso_uso
CREATE TABLE caso_uso (
    id_caso_uso SERIAL PRIMARY KEY,
    id_subproceso INTEGER NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    actor_principal VARCHAR(150),
    tipo_caso_uso SMALLINT CHECK (tipo_caso_uso IN (1, 2, 3)),
    -- 1=Funcional, 2=No Funcional, 3=Sistema
    precondiciones TEXT,
    postcondiciones TEXT,
    criterios_de_aceptacion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (id_subproceso) REFERENCES subproceso(id_subproceso) ON DELETE CASCADE
);

-- Habilitar RLS en las tablas
ALTER TABLE proceso ENABLE ROW LEVEL SECURITY;
ALTER TABLE subproceso ENABLE ROW LEVEL SECURITY;
ALTER TABLE caso_uso ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (acceso público para esta aplicación)
CREATE POLICY "Permitir lectura pública de procesos" ON proceso FOR SELECT USING (true);
CREATE POLICY "Permitir inserción pública de procesos" ON proceso FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir lectura pública de subprocesos" ON subproceso FOR SELECT USING (true);
CREATE POLICY "Permitir inserción pública de subprocesos" ON subproceso FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir lectura pública de casos de uso" ON caso_uso FOR SELECT USING (true);
CREATE POLICY "Permitir inserción pública de casos de uso" ON caso_uso FOR INSERT WITH CHECK (true);

-- Índices para mejorar el rendimiento
CREATE INDEX idx_subproceso_proceso ON subproceso(id_proceso);
CREATE INDEX idx_caso_uso_subproceso ON caso_uso(id_subproceso);