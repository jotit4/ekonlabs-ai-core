-- Cerrar permiso de turnos: admin/receptionist pueden cualquier turno del tenant;
-- doctor SOLO sobre sus propios turnos (professional_id = current_professional_id()).
-- El agente IA crea turnos con service role (bypassa RLS), no se ve afectado.

drop policy if exists appointments_insert_own on appointments;
create policy appointments_insert_own on appointments
  for insert to authenticated
  with check (
    (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''))
    and (
      (auth.jwt() ->> 'app_role') in ('admin','receptionist')
      or ((auth.jwt() ->> 'app_role') = 'doctor' and professional_id = current_professional_id())
    )
  );

drop policy if exists appointments_update_own on appointments;
create policy appointments_update_own on appointments
  for update to authenticated
  using (
    (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''))
    and (
      (auth.jwt() ->> 'app_role') in ('admin','receptionist')
      or ((auth.jwt() ->> 'app_role') = 'doctor' and professional_id = current_professional_id())
    )
  )
  with check (
    (tenant_id::text = coalesce(auth.jwt() ->> 'tenant_id', ''))
    and (
      (auth.jwt() ->> 'app_role') in ('admin','receptionist')
      or ((auth.jwt() ->> 'app_role') = 'doctor' and professional_id = current_professional_id())
    )
  );
