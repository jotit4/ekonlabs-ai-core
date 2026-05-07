-- Corregir configuración de servicios ISADI según Cuestionario 23/04/2026

-- Pilates: de appointment → cycle
UPDATE public.services SET
    booking_mode = 'cycle',
    capacity_per_slot = 4,
    professional_name = 'Prof. Rocío López',
    reminder_hours_before = 12,
    reminder_instructions = 'Venir con ropa cómoda.'
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4' AND name = 'Pilates';

-- Aquagym: de gated → cycle
UPDATE public.services SET
    booking_mode = 'cycle',
    capacity_per_slot = 9,
    professional_name = 'Profesora Martina',
    reminder_hours_before = 12,
    reminder_instructions = 'Traer toalla, gorrito de natación, ojotas y ropa cómoda o malla.'
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4' AND name = 'Aquagym';

-- Hidroterapia: requiere pedido médico, capacidad, profesional
UPDATE public.services SET
    booking_mode = 'gated',
    requires_prescription = TRUE,
    capacity_per_slot = 9,
    professional_name = 'Profesora Martina',
    prerequisite_note = 'Para iniciar Hidroterapia necesitás un pedido médico de tu médico tratante. Una vez que lo tengas, podemos agendarte el turno.',
    reminder_hours_before = 12,
    reminder_instructions = 'Traer toalla, gorrito de natación, ojotas y ropa cómoda o malla.'
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4' AND name = 'Hidroterapia';

-- Kinesiología: de appointment → gated, requiere pedido médico
UPDATE public.services SET
    booking_mode = 'gated',
    requires_prescription = TRUE,
    capacity_per_slot = 6,
    professional_name = 'Patricia Pérez Bernal / Aldo Luque',
    prerequisite_note = 'Para iniciar tratamiento de Kinesiología necesitás un pedido médico. Llevalo en tu primera visita.',
    reminder_hours_before = 12,
    reminder_instructions = 'Venir con ropa cómoda. Si es la primera vez, traer el pedido médico.'
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4' AND name = 'Kinesiología';

-- Fisioterapia: de appointment → gated, requiere pedido médico
UPDATE public.services SET
    booking_mode = 'gated',
    requires_prescription = TRUE,
    capacity_per_slot = 6,
    professional_name = 'Patricia Pérez Bernal / Aldo Luque',
    prerequisite_note = 'Para Fisioterapia/Rehabilitación necesitás un pedido médico. Llevalo en tu primera visita.',
    reminder_hours_before = 12,
    reminder_instructions = 'Venir con ropa cómoda. Si es la primera vez, traer el pedido médico.'
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4' AND name = 'Fisioterapia';

-- Rehabilitación física: de appointment → gated, requiere pedido médico
UPDATE public.services SET
    booking_mode = 'gated',
    requires_prescription = TRUE,
    capacity_per_slot = 6,
    professional_name = 'Patricia Pérez Bernal / Aldo Luque',
    prerequisite_note = 'Para Rehabilitación necesitás un pedido médico de tu médico tratante.',
    reminder_hours_before = 12,
    reminder_instructions = 'Venir con ropa cómoda. Si es la primera vez, traer el pedido médico.'
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4' AND name = 'Rehabilitación física';

-- Rehabilitación traumatológica: ya es walk_in, agregar profesional y notas
UPDATE public.services SET
    professional_name = 'Dr. Juan Diego Rodríguez',
    prerequisite_note = NULL
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4' AND name = 'Rehabilitación traumatológica';

-- Gimnasia Prenatal: form dice "no hay por el momento" → desactivar
UPDATE public.services SET
    active = FALSE
WHERE tenant_id = '5298fcc5-15bf-494c-9655-b49d759cfef4' AND name = 'Gimnasia Prenatal';

-- Insertar servicios faltantes: Traumatología Dr. Villavicencio y Odontología
INSERT INTO public.services (tenant_id, name, calendar_id, booking_mode, professional_name, duration_minutes, active, requires_prescription)
VALUES
    ('5298fcc5-15bf-494c-9655-b49d759cfef4', 'Traumatología (Dr. Villavicencio)', 'PLACEHOLDER_VILLAVICENCIO@group.calendar.google.com', 'appointment', 'Dr. Villavicencio', 30, TRUE, FALSE),
    ('5298fcc5-15bf-494c-9655-b49d759cfef4', 'Odontología', 'PLACEHOLDER_ODONTOLOGIA@group.calendar.google.com', 'appointment', 'Dr. Juan Pablo Rodríguez', 30, TRUE, FALSE)
ON CONFLICT (tenant_id, name) DO NOTHING;;
