-- Enable RLS on application_contacts
ALTER TABLE public.application_contacts ENABLE ROW LEVEL SECURITY;

-- Allow users to manage contacts linked to their own job applications only
CREATE POLICY "Users manage their own application_contacts"
ON public.application_contacts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM job_applications
    WHERE job_applications.id = application_contacts.application_id
    AND job_applications.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM job_applications
    WHERE job_applications.id = application_contacts.application_id
    AND job_applications.owner_id = auth.uid()
  )
);
