-- Migration v33: Allow patients to upload their own photos
-- Run this in Supabase SQL Editor

-- Allow patients to insert their own attachments
DROP POLICY IF EXISTS "patient_attachments_insert" ON public.patient_attachments;
CREATE POLICY "patient_attachments_insert" ON public.patient_attachments
  FOR INSERT WITH CHECK (
    get_my_role() = 'doctor'
    OR (get_my_role() = 'patient' AND auth.uid() = patient_id)
  );

-- Allow patients to delete their own uploads (where they are the doctor_id = uploader)
DROP POLICY IF EXISTS "patient_attachments_delete" ON public.patient_attachments;
CREATE POLICY "patient_attachments_delete" ON public.patient_attachments
  FOR DELETE USING (
    get_my_role() = 'doctor'
    OR (get_my_role() = 'patient' AND auth.uid() = patient_id AND auth.uid() = doctor_id)
  );
