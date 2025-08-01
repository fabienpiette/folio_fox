-- Add quality_order column to quality_profiles table

ALTER TABLE quality_profiles ADD COLUMN quality_order TEXT DEFAULT '[]';