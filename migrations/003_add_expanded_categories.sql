-- Migration: Add expanded job categories for non-tech work-from-home roles
-- Categories 10-16 broaden the scope beyond tech to include healthcare,
-- admin, education, legal, finance, HR, and writing roles.

INSERT OR IGNORE INTO categories (name, slug, description, created_at) VALUES
  ('Healthcare & Medical', 'healthcare-medical', 'Remote medical coding, telehealth, clinical research, healthcare admin, and medical support roles', unixepoch()),
  ('Administrative & Reception', 'administrative-reception', 'Virtual assistants, receptionists, office administrators, and clerical support roles', unixepoch()),
  ('Education & Training', 'education-training', 'Online tutoring, instructional design, curriculum development, and training coordinator roles', unixepoch()),
  ('Legal', 'legal', 'Paralegals, legal assistants, contract specialists, and compliance roles', unixepoch()),
  ('Accounting & Finance', 'accounting-finance', 'Bookkeepers, accountants, financial analysts, payroll, and billing roles', unixepoch()),
  ('Human Resources', 'human-resources', 'HR coordinators, recruiters, benefits administrators, and people operations roles', unixepoch()),
  ('Writing & Content', 'writing-content', 'Technical writers, editors, translators, transcriptionists, and content creators', unixepoch());
