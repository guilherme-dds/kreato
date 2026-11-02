-- Migra o flag isPremium para o campo plano (FREE | CREATOR | STUDIO)
-- e renomeia a role padrão de "user" para "creator".
-- Executar ANTES do `prisma db push`, para não perder quem já é assinante:
--   npx prisma db execute --file prisma/sql/001_subscription_plans.sql

ALTER TABLE Usuario ADD COLUMN plano VARCHAR(20) NOT NULL DEFAULT 'FREE';

UPDATE Usuario SET plano = 'CREATOR' WHERE isPremium = 1;

UPDATE Usuario SET role = 'creator' WHERE role = 'user';
ALTER TABLE Usuario ALTER COLUMN role SET DEFAULT 'creator';

ALTER TABLE Usuario DROP COLUMN isPremium;
