-- Script SQL pour créer la table des modèles de messages
-- À exécuter dans l'éditeur SQL Supabase

CREATE TABLE IF NOT EXISTS message_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activer RLS (Row Level Security)
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Politique pour que les utilisateurs ne voient que leurs propres modèles
CREATE POLICY "Users can only see their own templates" ON message_templates
    FOR SELECT USING (auth.uid() = created_by);

-- Politique pour que les utilisateurs ne puissent insérer que leurs propres modèles
CREATE POLICY "Users can only insert their own templates" ON message_templates
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Politique pour que les utilisateurs ne puissent modifier que leurs propres modèles
CREATE POLICY "Users can only update their own templates" ON message_templates
    FOR UPDATE USING (auth.uid() = created_by);

-- Politique pour que les utilisateurs ne puissent supprimer que leurs propres modèles
CREATE POLICY "Users can only delete their own templates" ON message_templates
    FOR DELETE USING (auth.uid() = created_by);

-- Créer un index pour améliorer les performances
CREATE INDEX idx_message_templates_created_by ON message_templates(created_by);

-- Créer un trigger pour mettre à jour le champ updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_message_templates_updated_at 
    BEFORE UPDATE ON message_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
